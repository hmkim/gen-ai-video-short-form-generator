import type { Schema } from "./resource";
import {
  SecretsManagerClient,
  PutSecretValueCommand,
  CreateSecretCommand,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const secretsManager = new SecretsManagerClient();
const SECRET_ID = "youtube-oauth-credentials";

export const handler: Schema["exchangeYouTubeToken"]["functionHandler"] = async (
  event
) => {
  const { code, redirectUri } = event.arguments;
  let { clientId, clientSecret } = event.arguments;

  try {
    // If clientId/clientSecret not provided, read from existing Secrets Manager credentials (reconnect flow)
    if (!clientId || !clientSecret) {
      try {
        const existingSecret = await secretsManager.send(
          new GetSecretValueCommand({ SecretId: SECRET_ID })
        );
        if (existingSecret.SecretString) {
          const existing = JSON.parse(existingSecret.SecretString);
          clientId = clientId || existing.client_id || "";
          clientSecret = clientSecret || existing.client_secret || "";
        }
      } catch {
        // No existing secret — clientId/clientSecret are required for first-time setup
      }

      if (!clientId || !clientSecret) {
        return JSON.stringify({
          success: false,
          error: "Client credentials not found. Please set up YouTube connection first.",
        });
      }
    }

    // Exchange authorization code for tokens using Google's token endpoint
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      return JSON.stringify({ success: false, error: `Token exchange failed: ${errorText}` });
    }

    const tokens = await tokenResponse.json();

    if (!tokens.access_token) {
      return JSON.stringify({ success: false, error: "No access token received" });
    }

    // Fetch Google account info using the access token
    let accountEmail = "";
    let accountName = "";
    let accountPicture = "";
    try {
      const userInfoResponse = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        accountEmail = userInfo.email || "";
        accountName = userInfo.name || "";
        accountPicture = userInfo.picture || "";
      }
    } catch (e) {
      console.warn("Could not fetch user info:", e);
    }

    // Store tokens + account info in Secrets Manager
    const secretValue = JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
      token_uri: "https://oauth2.googleapis.com/token",
      expiry: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : undefined,
      account_email: accountEmail,
      account_name: accountName,
      account_picture: accountPicture,
    });

    try {
      // Try to update existing secret
      await secretsManager.send(
        new PutSecretValueCommand({
          SecretId: SECRET_ID,
          SecretString: secretValue,
        })
      );
    } catch {
      // Secret doesn't exist yet, create it
      await secretsManager.send(
        new CreateSecretCommand({
          Name: SECRET_ID,
          SecretString: secretValue,
          Description: "YouTube OAuth2 credentials for video uploads",
        })
      );
    }

    return JSON.stringify({ success: true });
  } catch (error) {
    console.error("Exchange error:", error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

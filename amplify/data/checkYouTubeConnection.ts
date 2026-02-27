import type { Schema } from "./resource";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const secretsManager = new SecretsManagerClient();
const SECRET_ID = "youtube-oauth-credentials";

interface YouTubeChannel {
  id: string;
  title: string;
  thumbnail: string;
}

/**
 * Refresh the access token if it has expired.
 */
async function refreshAccessToken(creds: Record<string, string>): Promise<string> {
  if (!creds.refresh_token || !creds.client_id || !creds.client_secret) {
    return creds.access_token || "";
  }

  // Check if token is still valid (with 5min buffer)
  if (creds.expiry) {
    const expiryDate = new Date(creds.expiry);
    if (expiryDate.getTime() > Date.now() + 5 * 60 * 1000) {
      return creds.access_token;
    }
  }

  // Refresh the token
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    console.warn("Token refresh failed:", await response.text());
    return creds.access_token || "";
  }

  const tokens = await response.json();
  const newAccessToken = tokens.access_token || creds.access_token;
  const newExpiry = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : creds.expiry;

  // Update stored credentials with new access token
  const updatedCreds = {
    ...creds,
    access_token: newAccessToken,
    expiry: newExpiry,
  };

  try {
    await secretsManager.send(
      new PutSecretValueCommand({
        SecretId: SECRET_ID,
        SecretString: JSON.stringify(updatedCreds),
      })
    );
  } catch (e) {
    console.warn("Failed to update refreshed token:", e);
  }

  return newAccessToken;
}

/**
 * Fetch the user's YouTube channels.
 */
async function fetchChannels(accessToken: string): Promise<YouTubeChannel[]> {
  try {
    const response = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) return [];

    const data = await response.json();
    return (data.items || []).map((item: { id: string; snippet: { title: string; thumbnails?: { default?: { url: string } } } }) => ({
      id: item.id,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails?.default?.url || "",
    }));
  } catch (e) {
    console.warn("Failed to fetch channels:", e);
    return [];
  }
}

export const handler: Schema["checkYouTubeConnection"]["functionHandler"] = async () => {
  try {
    const response = await secretsManager.send(
      new GetSecretValueCommand({ SecretId: SECRET_ID })
    );

    if (response.SecretString) {
      const creds = JSON.parse(response.SecretString);

      // Refresh token if needed and fetch channels
      const accessToken = await refreshAccessToken(creds);
      const channels = await fetchChannels(accessToken);

      return JSON.stringify({
        connected: true,
        hasRefreshToken: !!creds.refresh_token,
        email: creds.account_email || "",
        name: creds.account_name || "",
        picture: creds.account_picture || "",
        clientId: creds.client_id || "",
        channels,
        selectedChannelId: creds.selected_channel_id || "",
      });
    }

    return JSON.stringify({ connected: false });
  } catch {
    return JSON.stringify({ connected: false });
  }
};

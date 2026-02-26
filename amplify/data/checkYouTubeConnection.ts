import type { Schema } from "./resource";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const secretsManager = new SecretsManagerClient();
const SECRET_ID = "youtube-oauth-credentials";

export const handler: Schema["checkYouTubeConnection"]["functionHandler"] = async () => {
  try {
    const response = await secretsManager.send(
      new GetSecretValueCommand({ SecretId: SECRET_ID })
    );

    if (response.SecretString) {
      const creds = JSON.parse(response.SecretString);
      return JSON.stringify({
        connected: true,
        hasRefreshToken: !!creds.refresh_token,
      });
    }

    return JSON.stringify({ connected: false });
  } catch {
    // Secret doesn't exist — not connected
    return JSON.stringify({ connected: false });
  }
};

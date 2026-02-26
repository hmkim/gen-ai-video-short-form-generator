import type { Schema } from "./resource";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const secretsManager = new SecretsManagerClient();
const SECRET_ID = "youtube-oauth-credentials";

export const handler: Schema["saveYouTubeChannel"]["functionHandler"] = async (
  event
) => {
  const { channelId } = event.arguments;

  try {
    const response = await secretsManager.send(
      new GetSecretValueCommand({ SecretId: SECRET_ID })
    );

    if (!response.SecretString) {
      return JSON.stringify({ success: false, error: "No credentials found" });
    }

    const creds = JSON.parse(response.SecretString);
    creds.selected_channel_id = channelId;

    await secretsManager.send(
      new PutSecretValueCommand({
        SecretId: SECRET_ID,
        SecretString: JSON.stringify(creds),
      })
    );

    return JSON.stringify({ success: true });
  } catch (error) {
    console.error("Save channel error:", error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

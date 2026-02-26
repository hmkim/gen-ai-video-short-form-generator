import type { Schema } from "./resource";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambdaClient = new LambdaClient();

export const handler: Schema["uploadToYouTube"]["functionHandler"] = async (
  event,
  context
) => {
  const { outputId, title, description, tags, playlistName } = event.arguments;

  try {
    const payload = JSON.stringify({
      outputId,
      title,
      description: description || "",
      tags: tags ? JSON.parse(tags) : [],
      playlistName: playlistName || "",
    });

    const command = new InvokeCommand({
      FunctionName: process.env.YOUTUBE_UPLOAD_FUNCTION,
      InvocationType: "Event",
      Payload: new TextEncoder().encode(payload),
    });

    await lambdaClient.send(command);

    return JSON.stringify({
      statusCode: 200,
      body: { message: "YouTube upload started" },
    });
  } catch (error) {
    return JSON.stringify({
      statusCode: 500,
      body: error,
    });
  }
};

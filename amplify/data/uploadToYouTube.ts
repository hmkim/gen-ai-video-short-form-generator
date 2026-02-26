import type { Schema } from "./resource";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const lambdaClient = new LambdaClient();
const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient());

export const handler: Schema["uploadToYouTube"]["functionHandler"] = async (
  event
) => {
  const { outputId, title, description, tags, playlistName } = event.arguments;
  const outputTableName = process.env.LONG_VIDEO_OUTPUT_TABLE_NAME!;

  try {
    // Set upload status to 'uploading' in DDB before starting
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: outputTableName,
        Key: { id: outputId },
        UpdateExpression:
          "SET uploadStatus = :s, uploadStartedAt = :t, uploadError = :e",
        ExpressionAttributeValues: {
          ":s": "uploading",
          ":t": new Date().toISOString(),
          ":e": "",
        },
      })
    );

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

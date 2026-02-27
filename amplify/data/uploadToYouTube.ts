import type { Schema } from "./resource";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const lambdaClient = new LambdaClient();
const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient());

export const handler: Schema["uploadToYouTube"]["functionHandler"] = async (
  event
) => {
  const { outputId, title, description, tags, playlistName } = event.arguments;
  const outputTableName = process.env.LONG_VIDEO_OUTPUT_TABLE_NAME!;
  const uploadTableName = process.env.YOUTUBE_UPLOAD_TABLE_NAME!;

  try {
    // Read output record to get longVideoEditId and presenterNumber
    const outputResult = await ddbDocClient.send(
      new GetCommand({
        TableName: outputTableName,
        Key: { id: outputId },
      })
    );
    const outputItem = outputResult.Item;

    const now = new Date().toISOString();
    const uploadRecordId = randomUUID();

    // Create a new YouTubeUpload record for this upload attempt
    await ddbDocClient.send(
      new PutCommand({
        TableName: uploadTableName,
        Item: {
          id: uploadRecordId,
          longVideoOutputId: outputId,
          longVideoEditId: outputItem?.longVideoEditId || "",
          presenterNumber: outputItem?.presenterNumber || 0,
          title: title,
          description: description || "",
          tags: tags || "",
          uploadStatus: "uploading",
          uploadError: "",
          uploadStartedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      })
    );

    // Also update LongVideoOutput for backward compat (output page status)
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: outputTableName,
        Key: { id: outputId },
        UpdateExpression:
          "SET uploadStatus = :s, uploadStartedAt = :t, uploadError = :e",
        ExpressionAttributeValues: {
          ":s": "uploading",
          ":t": now,
          ":e": "",
        },
      })
    );

    const payload = JSON.stringify({
      outputId,
      uploadRecordId,
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
      body: { message: "YouTube upload started", uploadRecordId },
    });
  } catch (error) {
    return JSON.stringify({
      statusCode: 500,
      body: error,
    });
  }
};

import type { Schema } from "./resource";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";

const sfnClient = new SFNClient();

export const handler: Schema["generateLongVideoOutput"]["functionHandler"] = async (
  event,
  context
) => {
  const { videoId, presenterNumber, title, description } = event.arguments;

  const stateMachineArn = process.env.STATE_MACHINE;

  try {
    const input = JSON.stringify({
      videoId,
      presenterNumber,
      title: title || "",
      description: description || "",
      bucket_name: process.env.BUCKET_NAME,
    });

    const command = new StartExecutionCommand({
      stateMachineArn: stateMachineArn,
      input: input,
    });

    const result = await sfnClient.send(command);

    return JSON.stringify({
      statusCode: 200,
      body: {
        executionArn: result.executionArn,
      },
    });
  } catch (error) {
    return JSON.stringify({
      statusCode: 500,
      body: error,
    });
  }
};

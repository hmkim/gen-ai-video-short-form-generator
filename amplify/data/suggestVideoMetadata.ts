import type { Schema } from "./resource";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const bedrockClient = new BedrockRuntimeClient({ region: "us-west-2" });
const s3Client = new S3Client();
const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient());

export const handler: Schema["suggestVideoMetadata"]["functionHandler"] = async (
  event
) => {
  const { videoId, presenterNumber } = event.arguments;

  const bucketName = process.env.BUCKET_NAME!;
  const editTableName = process.env.LONG_VIDEO_EDIT_TABLE_NAME!;

  // Read edit record for model ID, presenter names, video name
  const editResult = await ddbDocClient.send(
    new GetCommand({ TableName: editTableName, Key: { id: videoId } })
  );
  const edit = editResult.Item;
  if (!edit) {
    return JSON.stringify({ error: "Edit record not found" });
  }

  const modelId = edit.modelID || "us.anthropic.claude-sonnet-4-6-v1";
  const presenterName =
    presenterNumber === 1 ? edit.presenter1Name : edit.presenter2Name;
  const videoName = (edit.videoName || "").replace(/\.[^.]+$/, "");

  // Read transcript from S3
  let fullScript = "";
  try {
    const transcriptObj = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: `videos/${videoId}/LongVideoTranscript.json`,
      })
    );
    const transcriptStr = (await transcriptObj.Body?.transformToString()) || "";
    const transcript = JSON.parse(transcriptStr);
    fullScript = transcript.results?.transcripts?.[0]?.transcript || "";
  } catch (e) {
    console.error("Error reading transcript:", e);
  }

  // Use first/last parts for context
  const scriptStart = fullScript.substring(0, 3000);
  const scriptEnd =
    fullScript.length > 6000
      ? fullScript.substring(fullScript.length - 3000)
      : "";

  const prompt = `You are helping prepare a YouTube video upload. The video is an edited recording of a webinar/seminar, showing only one presenter's segments.

Video file name: ${videoName}
Presenter name: ${presenterName || `Presenter ${presenterNumber}`}

Transcript beginning:
${scriptStart}

${scriptEnd ? `Transcript ending:\n${scriptEnd}` : ""}

Based on this content, generate YouTube video metadata for this presenter's video:

1. **Title** (required): A compelling, SEO-friendly YouTube title (max 100 chars). Include the main topic. If the presenter name is meaningful (not "Presenter 1"), include it.
2. **Description**: A YouTube description (200-500 chars) summarizing what this presenter covers. Include key topics and takeaways.
3. **Tags**: 5-10 relevant YouTube tags for discoverability.
4. **Playlist name**: A suggested playlist name this video could belong to (e.g., "AWS re:Invent 2025", "Tech Talks", etc.)

Return ONLY valid JSON:
{"title": "...", "description": "...", "tags": ["tag1", "tag2"], "playlistName": "..."}`;

  try {
    const response = await bedrockClient.send(
      new ConverseCommand({
        modelId: modelId,
        messages: [{ role: "user", content: [{ text: prompt }] }],
        system: [
          {
            text: "You are a YouTube SEO expert. Generate compelling, accurate video metadata. Respond with valid JSON only, no markdown.",
          },
        ],
        inferenceConfig: { temperature: 0.5, maxTokens: 1024 },
      })
    );

    const rawResult =
      response.output?.message?.content?.[0]?.text || "{}";
    const firstBrace = rawResult.indexOf("{");
    const lastBrace = rawResult.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return rawResult.substring(firstBrace, lastBrace + 1);
    }
    return rawResult;
  } catch (error) {
    console.error("Bedrock error:", error);
    // Fallback suggestions
    return JSON.stringify({
      title: `${presenterName || `Presenter ${presenterNumber}`} - ${videoName}`,
      description: `Presentation by ${presenterName || `Presenter ${presenterNumber}`}`,
      tags: ["presentation", "webinar", "seminar"],
      playlistName: "Presentations",
    });
  }
};

import type { Schema } from "./resource";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const bedrockClient = new BedrockRuntimeClient({ region: "us-west-2" });
const s3Client = new S3Client();
const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient());

interface TranscriptItem {
  type: string;
  start_time?: string;
  end_time?: string;
  alternatives: { content: string }[];
}

interface Segment {
  startTime: number;
  endTime: number;
  speakerLabel: string;
  segmentType: string;
  includeInOutput: boolean;
}

/**
 * Extract transcript text that falls within the given time ranges.
 */
function extractPresenterTranscript(
  items: TranscriptItem[],
  segments: Segment[]
): string {
  const words: string[] = [];

  for (const item of items) {
    if (item.type === "punctuation") {
      // Attach punctuation to last word
      if (words.length > 0) {
        words[words.length - 1] += item.alternatives[0].content;
      }
      continue;
    }

    const startTime = parseFloat(item.start_time || "0");

    // Check if this word falls within any of the presenter's segments
    const inSegment = segments.some(
      (seg) => startTime >= seg.startTime && startTime < seg.endTime
    );

    if (inSegment) {
      words.push(item.alternatives[0].content);
    }
  }

  return words.join(" ");
}

export const handler: Schema["suggestVideoMetadata"]["functionHandler"] = async (
  event
) => {
  const { videoId, presenterNumber } = event.arguments;

  const bucketName = process.env.BUCKET_NAME!;
  const editTableName = process.env.LONG_VIDEO_EDIT_TABLE_NAME!;
  const segmentTableName = process.env.LONG_VIDEO_SEGMENT_TABLE_NAME!;

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

  // Query segments for this presenter
  const presenterLabel = `presenter${presenterNumber}`;
  const segmentResult = await ddbDocClient.send(
    new ScanCommand({
      TableName: segmentTableName,
      FilterExpression:
        "longVideoEditId = :vid AND speakerLabel = :label AND includeInOutput = :inc",
      ExpressionAttributeValues: {
        ":vid": videoId,
        ":label": presenterLabel,
        ":inc": true,
      },
    })
  );

  const segments: Segment[] = (segmentResult.Items || [])
    .map((item) => ({
      startTime: item.startTime as number,
      endTime: item.endTime as number,
      speakerLabel: item.speakerLabel as string,
      segmentType: item.segmentType as string,
      includeInOutput: item.includeInOutput as boolean,
    }))
    .sort((a, b) => a.startTime - b.startTime);

  // Read transcript from S3 and extract presenter-specific text
  let presenterScript = "";
  try {
    const transcriptObj = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: `videos/${videoId}/LongVideoTranscript.json`,
      })
    );
    const transcriptStr = (await transcriptObj.Body?.transformToString()) || "";
    const transcript = JSON.parse(transcriptStr);
    const items: TranscriptItem[] = transcript.results?.items || [];

    if (items.length > 0 && segments.length > 0) {
      presenterScript = extractPresenterTranscript(items, segments);
    }

    // Fallback to full transcript if extraction yielded nothing
    if (!presenterScript) {
      presenterScript =
        transcript.results?.transcripts?.[0]?.transcript || "";
    }
  } catch (e) {
    console.error("Error reading transcript:", e);
  }

  // Trim to reasonable size for the prompt (max ~6000 chars)
  const trimmedScript =
    presenterScript.length > 6000
      ? presenterScript.substring(0, 3000) +
        "\n...\n" +
        presenterScript.substring(presenterScript.length - 3000)
      : presenterScript;

  const totalMinutes = segments.reduce(
    (sum, s) => sum + (s.endTime - s.startTime),
    0
  ) / 60;

  const prompt = `You are helping prepare a YouTube video upload. The video is an edited recording of a webinar/seminar, showing ONLY one presenter's segments (approximately ${totalMinutes.toFixed(0)} minutes).

Video file name: ${videoName}
Presenter name: ${presenterName || `Presenter ${presenterNumber}`}
Number of segments: ${segments.length}

Below is the transcript of ONLY this presenter's speaking segments:
${trimmedScript}

Based on THIS PRESENTER'S content only, generate YouTube video metadata:

1. **Title** (required): A compelling, SEO-friendly YouTube title (max 100 chars). Include the main topic this presenter covers. If the presenter name is meaningful (not "Presenter 1"), include it.
2. **Description**: A YouTube description (200-500 chars) summarizing what this specific presenter covers. Include key topics and takeaways from their segments.
3. **Tags**: 5-10 relevant YouTube tags for discoverability.
4. **Playlist name**: A suggested playlist name this video could belong to.

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
    return JSON.stringify({
      title: `${presenterName || `Presenter ${presenterNumber}`} - ${videoName}`,
      description: `Presentation by ${presenterName || `Presenter ${presenterNumber}`}`,
      tags: ["presentation", "webinar", "seminar"],
      playlistName: "Presentations",
    });
  }
};

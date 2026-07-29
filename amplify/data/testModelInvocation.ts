// testModelInvocation.ts
//
// U3 (F3) AppSync query resolver — ModelTestResolver.
//
// Invokes the target model once with a FIXED, short prompt (Bedrock Converse)
// and reports whether the call succeeded. Business rule (US-3, Q3=A): a normal
// response (any text received) == success; an access/permission failure ==
// "모델 접근 필요" and blocks approval. The prompt is a constant template with
// NO user-supplied text, so there is no prompt-injection surface.
//
// Side effect: stamps lastTestedAt / lastTestResult on the matching ManagedModel
// row (looked up by modelId). New code: AWS SDK v3 only. Input validated.

import type { Schema } from './resource';
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const REGION = 'us-west-2';

// Fixed test prompt — never interpolates caller input (injection-safe).
const TEST_PROMPT = 'Reply with the single word: OK';
// Opus 5 reasons before answering by default, and thinking tokens count
// against maxTokens — keep headroom so the text answer is not truncated.
const TEST_MAX_TOKENS = 128;

// Bedrock model id shape: provider.family-... with optional region prefix,
// version (`-v1:0`) and inference-profile dots. Restrict to a safe charset.
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,200}$/;

const bedrockClient = new BedrockRuntimeClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient());

interface ModelTestResult {
  ok: boolean;
  message: string;
  costHint: string;
}

/** Stamp the test outcome onto the ManagedModel row (best-effort). */
async function recordTestResult(
  tableName: string,
  modelId: string,
  result: 'success' | 'failed',
): Promise<void> {
  try {
    const scan = await ddbDocClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'modelId = :modelId',
        ExpressionAttributeValues: { ':modelId': modelId },
        Limit: 1,
      }),
    );
    const row = scan.Items?.[0];
    if (!row?.id) {
      return;
    }
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: row.id },
        UpdateExpression:
          'SET lastTestedAt = :ts, lastTestResult = :result, updatedAt = :ts',
        ExpressionAttributeValues: {
          ':ts': new Date().toISOString(),
          ':result': result,
        },
      }),
    );
  } catch (error) {
    console.error(`Failed to record test result for ${modelId}:`, error);
  }
}

export const handler: Schema['testModelInvocation']['functionHandler'] = async (
  event,
): Promise<ModelTestResult> => {
  const tableName = process.env.MANAGED_MODEL_TABLE_NAME;

  // Boundary validation.
  const modelId = event.arguments?.modelId;
  if (typeof modelId !== 'string' || !MODEL_ID_PATTERN.test(modelId)) {
    return {
      ok: false,
      message: '유효하지 않은 모델 ID입니다.',
      costHint: '',
    };
  }

  // Claude Opus models (4.7+) reject `temperature` — same guard as the
  // pipeline Lambdas (`"opus" not in modelID`).
  const inferenceConfig: { maxTokens: number; temperature?: number } = {
    maxTokens: TEST_MAX_TOKENS,
  };
  if (!modelId.includes('opus')) {
    inferenceConfig.temperature = 0;
  }

  try {
    const response = await bedrockClient.send(
      new ConverseCommand({
        modelId,
        messages: [{ role: 'user', content: [{ text: TEST_PROMPT }] }],
        inferenceConfig,
      }),
    );

    // Reasoning models (Opus 5, DeepSeek R1) prepend a reasoningContent block,
    // so the text block is not always content[0].
    const blocks = response.output?.message?.content ?? [];
    const text = blocks.map((block) => block.text ?? '').join('');
    const usage = response.usage;
    const succeeded = text.trim().length > 0;

    if (tableName) {
      await recordTestResult(tableName, modelId, succeeded ? 'success' : 'failed');
    }

    if (!succeeded) {
      return {
        ok: false,
        message: '모델이 빈 응답을 반환했습니다.',
        costHint: '',
      };
    }

    const costHint = usage
      ? `입력 ${usage.inputTokens ?? 0} · 출력 ${usage.outputTokens ?? 0} 토큰 (테스트 호출 기준 estimate)`
      : 'estimate';

    return {
      ok: true,
      message: '모델 호출 성공',
      costHint,
    };
  } catch (error) {
    console.error(`testModelInvocation failed for ${modelId}:`, error);
    if (tableName) {
      await recordTestResult(tableName, modelId, 'failed');
    }
    return {
      ok: false,
      message: '모델 접근 필요',
      costHint: '',
    };
  }
};

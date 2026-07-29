// listFoundationModels.ts
//
// U3 (F3) AppSync query resolver — ModelDiscoveryResolver.
//
// On `refresh: true` it lists us-west-2 Bedrock foundation models, derives
// provider/displayName (ADR-2), and UPSERTS them into the ManagedModel table:
//   - new modelId            -> PENDING (hidden until tested+approved)
//   - existing modelId       -> metadata refreshed, STATUS PRESERVED
// On any failure (or `refresh` falsey) it returns the existing records without
// destructive writes (business-rules: "조회 실패 시 기존 목록 보존").
//
// New code: AWS SDK v3 only. Input is validated at the boundary. The function
// writes to DynamoDB directly via its execution role (infra-design IAM grant),
// which is why ManagedModel updates are surfaced via explicit UI refetch rather
// than an AppSync subscription (nfr-design Minor #2).

import type { Schema } from './resource';
import {
  BedrockClient,
  ListFoundationModelsCommand,
  type FoundationModelSummary,
} from '@aws-sdk/client-bedrock';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { deriveModelMetadata } from '../../src/data/modelMetadata';

const REGION = 'us-west-2';

const bedrockClient = new BedrockClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient());

type ManagedModel = Schema['ManagedModel']['type'];
type ManagedModelStatus = NonNullable<ManagedModel['status']>;

interface ManagedModelItem {
  id: string;
  modelId: string;
  displayName: string;
  provider: string;
  status: ManagedModelStatus;
  isDefault: boolean;
  lastTestedAt?: string | null;
  lastTestResult?: string | null;
  costHint?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Keep only text-capable, active foundation models. */
function isTextModel(summary: FoundationModelSummary): boolean {
  const outputs = summary.outputModalities ?? [];
  const inputs = summary.inputModalities ?? [];
  const lifecycle = summary.modelLifecycle?.status;
  const isActive = lifecycle === undefined || lifecycle === 'ACTIVE';
  return outputs.includes('TEXT') && inputs.includes('TEXT') && isActive;
}

/** Read all current ManagedModel rows; returns [] on read failure. */
async function readExisting(tableName: string): Promise<ManagedModelItem[]> {
  const items: ManagedModelItem[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await ddbDocClient.send(
      new ScanCommand({ TableName: tableName, ExclusiveStartKey: lastKey }),
    );
    for (const item of result.Items ?? []) {
      items.push(item as ManagedModelItem);
    }
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return items;
}

export const handler: Schema['listFoundationModels']['functionHandler'] = async (
  event,
) => {
  const tableName = process.env.MANAGED_MODEL_TABLE_NAME;
  if (!tableName) {
    console.error('MANAGED_MODEL_TABLE_NAME is not configured');
    return [];
  }

  // Boundary validation: refresh is an optional boolean.
  const refreshArg = event.arguments?.refresh;
  if (refreshArg !== undefined && refreshArg !== null && typeof refreshArg !== 'boolean') {
    console.error('Invalid "refresh" argument; expected boolean');
    return [];
  }
  const refresh = refreshArg === true;

  // Always start from the current persisted state so we can return it on error
  // and preserve existing statuses.
  let existing: ManagedModelItem[];
  try {
    existing = await readExisting(tableName);
  } catch (error) {
    console.error('Failed to read ManagedModel table:', error);
    return [];
  }

  if (!refresh) {
    return existing as unknown as ManagedModel[];
  }

  let summaries: FoundationModelSummary[];
  try {
    const response = await bedrockClient.send(new ListFoundationModelsCommand({}));
    summaries = response.modelSummaries ?? [];
  } catch (error) {
    // Non-destructive: keep what we have, surface nothing to write.
    console.error('Bedrock ListFoundationModels failed; returning existing records:', error);
    return existing as unknown as ManagedModel[];
  }

  const existingByModelId = new Map<string, ManagedModelItem>();
  for (const item of existing) {
    existingByModelId.set(item.modelId, item);
  }

  const nowIso = new Date().toISOString();
  const upserted: ManagedModelItem[] = [...existing];

  for (const summary of summaries) {
    const modelId = summary.modelId;
    if (!modelId || !isTextModel(summary)) {
      continue;
    }

    const { provider, displayName } = deriveModelMetadata(modelId);
    const prior = existingByModelId.get(modelId);

    try {
      if (!prior) {
        // New discovery -> PENDING (hidden until approved).
        const item: ManagedModelItem = {
          id: randomUUID(),
          modelId,
          displayName,
          provider,
          status: 'PENDING',
          isDefault: false,
        };
        await ddbDocClient.send(
          new PutCommand({
            TableName: tableName,
            Item: { ...item, createdAt: nowIso, updatedAt: nowIso },
            // Idempotent guard against a racing insert of the same modelId.
            ConditionExpression: 'attribute_not_exists(id)',
          }),
        );
        existingByModelId.set(modelId, item);
        upserted.push(item);
      } else {
        // Existing -> refresh derived metadata only, PRESERVE status/isDefault.
        await ddbDocClient.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { id: prior.id },
            UpdateExpression:
              'SET displayName = :displayName, provider = :provider, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
              ':displayName': displayName,
              ':provider': provider,
              ':updatedAt': nowIso,
            },
          }),
        );
        prior.displayName = displayName;
        prior.provider = provider;
      }
    } catch (error) {
      // Per-model failure must not abort the batch; the row is simply skipped
      // and the existing catalog is preserved.
      console.error(`Upsert failed for model ${modelId}:`, error);
    }
  }

  return upserted as unknown as ManagedModel[];
};

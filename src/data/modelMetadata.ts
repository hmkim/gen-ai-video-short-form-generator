// modelMetadata.ts
//
// U3 model management (ADR-2): derive a human display name and provider label
// from a Bedrock model / inference-profile id, with a small correction map for
// irregular ids that the heuristic cannot reconstruct.
//
// Pure module — NO React, NO Node, NO AWS imports. It is the single source of
// truth shared by the frontend, the `listFoundationModels` resolver Lambda
// (`amplify/data/listFoundationModels.ts`), and the unit test
// (`src/data/__tests__/modelMetadata.test.ts`).

/** Cross-region inference prefixes that precede the provider segment. */
const REGION_PREFIXES: ReadonlySet<string> = new Set([
  'us',
  'eu',
  'apac',
  'us-gov',
]);

/** provider key (lowercase, as it appears in the model id) -> display label. */
export const PROVIDER_NAMES: Readonly<Record<string, string>> = {
  anthropic: 'Anthropic',
  amazon: 'Amazon',
  meta: 'Meta',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  cohere: 'Cohere',
  ai21: 'AI21 Labs',
  stability: 'Stability AI',
};

/**
 * Display-name corrections keyed by the cleaned model "core" (the id with the
 * region prefix, provider segment, version suffix and date stamp removed).
 * Only ids whose marketing name the generic heuristic cannot reconstruct need
 * an entry here — keep this map small (ADR-2).
 */
export const DISPLAY_NAME_CORRECTIONS: Readonly<Record<string, string>> = {
  'llama4-maverick-17b-instruct': 'Llama 4 Maverick 17B',
  'llama4-scout-17b-instruct': 'Llama 4 Scout 17B',
  'llama3-3-70b-instruct': 'Llama 3.3 70B',
  r1: 'DeepSeek R1',
  'v3.2': 'DeepSeek V3.2',
};

export interface ModelMetadata {
  provider: string;
  displayName: string;
}

/** Strip the version suffix (`-v1:0`), trailing/inner date stamps, etc. */
function cleanCore(core: string): string {
  let c = core.toLowerCase();
  c = c.replace(/:\d+$/, ''); // ":0"            -> ""
  c = c.replace(/-v\d+(\.\d+)?$/, ''); // "-v1" / "-v2.1" -> ""
  c = c.replace(/-\d{8}$/, ''); // trailing "-20250929"
  c = c.replace(/-\d{8}(?=-)/g, ''); // inner "-20250929-"
  c = c.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return c;
}

/** Title-case a single token; uppercase numeric/version-ish tokens. */
function titleToken(token: string): string {
  if (/^\d/.test(token)) {
    // "4.5" -> "4.5", "17b" -> "17B"
    return token.toUpperCase();
  }
  return token.charAt(0).toUpperCase() + token.slice(1);
}

/**
 * Build a display name from the cleaned core via a deterministic heuristic:
 * split on "-", merge adjacent numeric tokens into a dotted version
 * ("4","5" -> "4.5"), then title-case each token.
 */
function heuristicDisplayName(core: string): string {
  const rawTokens = core.split('-').filter(Boolean);
  const merged: string[] = [];
  for (const token of rawTokens) {
    const prev = merged[merged.length - 1];
    if (/^\d+$/.test(token) && prev !== undefined && /^\d/.test(prev)) {
      merged[merged.length - 1] = `${prev}.${token}`;
    } else {
      merged.push(token);
    }
  }
  return merged.map(titleToken).join(' ');
}

/**
 * Derive `{ provider, displayName }` from a Bedrock model id or inference
 * profile id. Handles both base ids (`anthropic.claude-3-5-sonnet-...`) and
 * cross-region inference-profile ids (`us.anthropic.claude-sonnet-4-5-...`).
 *
 * Defensive by design: an empty / malformed id yields a `Unknown` provider and
 * echoes the input as the display name rather than throwing — callers run at a
 * trust boundary (Bedrock API response) and must not crash on surprises.
 */
export function deriveModelMetadata(modelId: string): ModelMetadata {
  if (typeof modelId !== 'string' || modelId.trim() === '') {
    return { provider: 'Unknown', displayName: String(modelId ?? '') };
  }

  const id = modelId.trim();
  const parts = id.split('.');

  let providerIndex = 0;
  if (parts.length > 2 && REGION_PREFIXES.has(parts[0].toLowerCase())) {
    providerIndex = 1;
  }

  const providerKey = parts[providerIndex].toLowerCase();
  const provider =
    PROVIDER_NAMES[providerKey] ??
    providerKey.charAt(0).toUpperCase() + providerKey.slice(1);

  const core = parts.slice(providerIndex + 1).join('.');
  if (core === '') {
    return { provider, displayName: provider };
  }

  const cleaned = cleanCore(core);
  const corrected = DISPLAY_NAME_CORRECTIONS[cleaned];
  const displayName = corrected ?? heuristicDisplayName(cleaned);

  return { provider, displayName: displayName || provider };
}

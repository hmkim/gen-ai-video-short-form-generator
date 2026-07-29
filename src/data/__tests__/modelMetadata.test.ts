// Unit tests for the U3 model-metadata derivation (ADR-2).
// Pure function — no AWS / React mocks needed.

import { describe, it, expect } from 'vitest';
import {
  deriveModelMetadata,
  DISPLAY_NAME_CORRECTIONS,
  PROVIDER_NAMES,
} from '../modelMetadata';

describe('deriveModelMetadata — provider derivation', () => {
  it('reads the provider from a cross-region inference-profile id', () => {
    expect(deriveModelMetadata('us.anthropic.claude-sonnet-4-5-20250929-v1:0').provider).toBe(
      'Anthropic',
    );
    expect(deriveModelMetadata('us.amazon.nova-pro-v1:0').provider).toBe('Amazon');
    expect(deriveModelMetadata('us.meta.llama4-scout-17b-instruct-v1:0').provider).toBe('Meta');
    expect(deriveModelMetadata('us.deepseek.r1-v1:0').provider).toBe('DeepSeek');
  });

  it('reads the provider from a base (non-region-prefixed) id', () => {
    expect(deriveModelMetadata('anthropic.claude-3-5-sonnet-20241022-v2:0').provider).toBe(
      'Anthropic',
    );
    expect(deriveModelMetadata('amazon.titan-text-express-v1').provider).toBe('Amazon');
  });

  it('title-cases an unknown provider key as a fallback', () => {
    expect(deriveModelMetadata('cohere.command-r-v1:0').provider).toBe('Cohere');
    expect(deriveModelMetadata('writer.palmyra-x5-v1:0').provider).toBe('Writer');
  });
});

describe('deriveModelMetadata — display-name heuristic', () => {
  it('merges adjacent numeric tokens into a dotted version', () => {
    expect(deriveModelMetadata('us.anthropic.claude-sonnet-4-5-20250929-v1:0').displayName).toBe(
      'Claude Sonnet 4.5',
    );
    expect(deriveModelMetadata('anthropic.claude-3-5-sonnet-20241022-v2:0').displayName).toBe(
      'Claude 3.5 Sonnet',
    );
  });

  it('strips version suffixes and date stamps', () => {
    expect(deriveModelMetadata('us.amazon.nova-pro-v1:0').displayName).toBe('Nova Pro');
    expect(deriveModelMetadata('us.amazon.nova-micro-v1:0').displayName).toBe('Nova Micro');
  });

  it('reconstructs a reasonable name for unknown providers', () => {
    expect(deriveModelMetadata('cohere.command-r-v1:0').displayName).toBe('Command R');
  });
});

describe('deriveModelMetadata — correction map', () => {
  it('applies the small correction map for irregular ids', () => {
    expect(deriveModelMetadata('us.meta.llama4-maverick-17b-instruct-v1:0').displayName).toBe(
      'Llama 4 Maverick 17B',
    );
    expect(deriveModelMetadata('us.meta.llama4-scout-17b-instruct-v1:0').displayName).toBe(
      'Llama 4 Scout 17B',
    );
    expect(deriveModelMetadata('us.meta.llama3-3-70b-instruct-v1:0').displayName).toBe(
      'Llama 3.3 70B',
    );
    expect(deriveModelMetadata('us.deepseek.r1-v1:0').displayName).toBe('DeepSeek R1');
    expect(deriveModelMetadata('deepseek.v3.2').displayName).toBe('DeepSeek V3.2');
  });

  it('keeps the correction map small and well-formed', () => {
    for (const [key, value] of Object.entries(DISPLAY_NAME_CORRECTIONS)) {
      expect(key.trim()).not.toBe('');
      expect(value.trim()).not.toBe('');
    }
  });
});

describe('deriveModelMetadata — defensive boundaries', () => {
  it('does not throw on empty or malformed input', () => {
    expect(deriveModelMetadata('').provider).toBe('Unknown');
    expect(deriveModelMetadata('   ').provider).toBe('Unknown');
    // @ts-expect-error — deliberately passing a non-string to assert runtime safety
    expect(deriveModelMetadata(undefined).provider).toBe('Unknown');
  });

  it('exposes a non-empty provider label map', () => {
    expect(PROVIDER_NAMES.anthropic).toBe('Anthropic');
    expect(Object.keys(PROVIDER_NAMES).length).toBeGreaterThan(0);
  });
});

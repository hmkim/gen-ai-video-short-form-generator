// useApprovedModels.ts
//
// U3 (F3): shared hook that feeds the LLM `ModelSelect` dropdowns from the
// dynamic ManagedModel catalog (status = APPROVED), replacing the static
// `modelList.tsx` import at the call sites.
//
// Seed migration (US-5): if the catalog is completely empty on first run, the
// static `modelList.tsx` entries are upserted as APPROVED with a single
// `isDefault`. The seed is guarded by a module-level promise so concurrent hook
// mounts in one session seed at most once, and only runs when the catalog has
// zero rows (idempotent for the steady state). `modelList.tsx` is retained as
// the seed source of truth.
//
// Non-breaking: any query/seed failure (or an empty APPROVED set) leaves the
// hook on the static fallback list so existing upload flows keep working.

import { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { modelOptions } from './modelList';

const client = generateClient<Schema>({ authMode: 'userPool' });

export interface ModelSelectOption {
  label: string;
  value: string;
}

export interface UseApprovedModelsResult {
  /** APPROVED models as Cloudscape Select options (falls back to static list). */
  options: ModelSelectOption[];
  /** The default option to preselect. */
  defaultOption: ModelSelectOption;
  /** True until the first catalog load (incl. any seed) settles. */
  loading: boolean;
  /** True when serving the static fallback rather than the dynamic catalog. */
  usingFallback: boolean;
}

// The modelId promoted to default during seed migration — matches the prior
// hardcoded default in the upload components.
const SEED_DEFAULT_MODEL_ID = 'us.anthropic.claude-opus-4-7';

const FALLBACK_OPTIONS: ModelSelectOption[] = modelOptions.map((model) => ({
  label: model.name,
  value: model.modelId,
}));

const FALLBACK_DEFAULT: ModelSelectOption =
  FALLBACK_OPTIONS.find((option) => option.value === SEED_DEFAULT_MODEL_ID) ??
  FALLBACK_OPTIONS[0];

// Session-scoped guard: ensures the seed runs at most once per page session.
let seedPromise: Promise<void> | null = null;

async function seedFromStaticListIfEmpty(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const { data: existing } = await client.models.ManagedModel.list();
      if (existing.length > 0) {
        return;
      }
      for (const model of modelOptions) {
        await client.models.ManagedModel.create({
          modelId: model.modelId,
          displayName: model.name,
          provider: model.provider,
          status: 'APPROVED',
          isDefault: model.modelId === SEED_DEFAULT_MODEL_ID,
        });
      }
    })();
  }
  return seedPromise;
}

export function useApprovedModels(): UseApprovedModelsResult {
  const [options, setOptions] = useState<ModelSelectOption[]>(FALLBACK_OPTIONS);
  const [defaultOption, setDefaultOption] =
    useState<ModelSelectOption>(FALLBACK_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        await seedFromStaticListIfEmpty();
        const { data: approved } = await client.models.ManagedModel.list({
          filter: { status: { eq: 'APPROVED' } },
        });
        if (cancelled) {
          return;
        }
        if (approved.length === 0) {
          setUsingFallback(true);
          return;
        }
        const mapped = approved.map((model) => ({
          label: model.displayName,
          value: model.modelId,
        }));
        const chosenDefault =
          approved.find((model) => model.isDefault) ?? approved[0];
        setOptions(mapped);
        setDefaultOption({
          label: chosenDefault.displayName,
          value: chosenDefault.modelId,
        });
        setUsingFallback(false);
      } catch (error) {
        // Reset the guard so a later mount can retry the seed.
        seedPromise = null;
        console.error('useApprovedModels: using static fallback list:', error);
        if (!cancelled) {
          setUsingFallback(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { options, defaultOption, loading, usingFallback };
}

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { CliRuntime, ProviderModelGroup } from '@/types';

// Default Claude model options — used as fallback when API is unavailable
export const DEFAULT_MODEL_OPTIONS = [
  { value: 'sonnet', label: 'Sonnet 4.6' },
  { value: 'opus', label: 'Opus 4.6' },
  { value: 'haiku', label: 'Haiku 4.5' },
];

export interface UseProviderModelsReturn {
  providerGroups: ProviderModelGroup[];
  currentProviderIdValue: string;
  modelOptions: typeof DEFAULT_MODEL_OPTIONS;
  currentModelOption: (typeof DEFAULT_MODEL_OPTIONS)[number];
}

function buildFallbackGroup(runtime: CliRuntime): ProviderModelGroup {
  const codebuddyDefaultModel = 'gpt-5.3-codex';
  return runtime === 'codebuddy'
    ? {
        provider_id: 'env',
        provider_name: 'CodeBuddy CLI',
        provider_type: 'anthropic',
        models: [{ value: codebuddyDefaultModel, label: codebuddyDefaultModel }],
      }
    : {
        provider_id: 'env',
        provider_name: 'Anthropic',
        provider_type: 'anthropic',
        models: DEFAULT_MODEL_OPTIONS,
      };
}

async function fetchCurrentRuntime(): Promise<CliRuntime> {
  try {
    const res = await fetch('/api/claude-status');
    if (!res.ok) return 'claude';
    const data = await res.json();
    return data.runtime === 'codebuddy' ? 'codebuddy' : 'claude';
  } catch {
    return 'claude';
  }
}

export function useProviderModels(
  providerId?: string,
  modelName?: string,
): UseProviderModelsReturn {
  const [providerGroups, setProviderGroups] = useState<ProviderModelGroup[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState<string>('');

  const fetchProviderModels = useCallback(async () => {
    const runtime = await fetchCurrentRuntime();
    fetch(`/api/providers/models?runtime=${runtime}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.groups && data.groups.length > 0) {
          setProviderGroups(data.groups);
        } else {
          setProviderGroups([buildFallbackGroup(runtime)]);
        }
        setDefaultProviderId(data.default_provider_id || '');
      })
      .catch(() => {
        setProviderGroups([buildFallbackGroup(runtime)]);
        setDefaultProviderId('');
      });
  }, []);

  // Load models on mount and listen for provider changes
  useEffect(() => {
    fetchProviderModels();
    const handler = () => fetchProviderModels();
    window.addEventListener('provider-changed', handler);
    return () => window.removeEventListener('provider-changed', handler);
  }, [fetchProviderModels]);

  // Derive flat model list for current provider
  const currentProviderIdValue = providerId || defaultProviderId || (providerGroups[0]?.provider_id ?? '');
  const currentGroup = providerGroups.find(g => g.provider_id === currentProviderIdValue) || providerGroups[0];
  const modelOptions = (currentGroup?.models && currentGroup.models.length > 0)
    ? currentGroup.models
    : DEFAULT_MODEL_OPTIONS;

  const currentModelValue = modelName || 'sonnet';
  const currentModelOption = useMemo(
    () => modelOptions.find((m) => m.value === currentModelValue) || modelOptions[0],
    [modelOptions, currentModelValue],
  );

  return {
    providerGroups,
    currentProviderIdValue,
    modelOptions,
    currentModelOption,
  };
}

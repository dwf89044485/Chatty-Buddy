import { NextResponse } from 'next/server';
import { getAllProviders, getDefaultProviderId, setDefaultProviderId, getProvider, getModelsForProvider, getSetting } from '@/lib/db';
import { getContextWindow } from '@/lib/model-context';
import { getDefaultModelsForProvider, inferProtocolFromLegacy, findPresetForLegacy } from '@/lib/provider-catalog';
import type { Protocol } from '@/lib/provider-catalog';
import type { ErrorResponse, ProviderModelGroup } from '@/types';
import { findCodeBuddyBinary } from '@/lib/platform'; // [CodeBuddy]
import { getCliRuntime } from '@/lib/cli-runtime'; // [CodeBuddy]

// Default Claude model options (for the built-in 'env' provider)
const DEFAULT_MODELS = [
  { value: 'sonnet', label: 'Sonnet 4.6' },
  { value: 'opus', label: 'Opus 4.6' },
  { value: 'haiku', label: 'Haiku 4.5' },
];

interface ModelEntry {
  value: string;
  label: string;
  upstreamModelId?: string;
  capabilities?: Record<string, unknown>;
  variants?: Record<string, unknown>;
}

/**
 * Deduplicate models: if multiple aliases map to the same label, keep only the first one.
 */
function deduplicateModels(models: ModelEntry[]): ModelEntry[] {
  const seen = new Set<string>();
  const result: ModelEntry[] = [];
  for (const m of models) {
    if (!seen.has(m.label)) {
      seen.add(m.label);
      result.push(m);
    }
  }
  return result;
}

/** Media-only provider protocols — skip in chat model selector */
const MEDIA_PROTOCOLS = new Set<string>(['gemini-image']);
const MEDIA_PROVIDER_TYPES = new Set(['gemini-image']);

export async function GET() {
  try {
    const providers = getAllProviders();
    const groups: ProviderModelGroup[] = [];
    const cliRuntime = getCliRuntime(); // [CodeBuddy]

    // [CodeBuddy] Show the built-in CLI provider group based on the active runtime.
    // Only one virtual provider is shown at a time — the active one.
    if (cliRuntime === 'codebuddy') {
      // CodeBuddy SDK provider group — full model list from CLI --help (IOA environment)
      const CODEBUDDY_DEFAULT_MODELS = [
        // Claude models
        { value: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
        { value: 'claude-4.5', label: 'Claude Sonnet 4.5' },
        { value: 'claude-opus-4.6', label: 'Claude Opus 4.6' },
        { value: 'claude-opus-4.5', label: 'Claude Opus 4.5' },
        { value: 'claude-haiku-4.5', label: 'Claude Haiku 4.5' },
        // GPT models
        { value: 'gpt-5.4', label: 'GPT-5.4' },
        { value: 'gpt-5.3-codex', label: 'GPT-5.3-Codex' },
        { value: 'gpt-5.2', label: 'GPT-5.2' },
        { value: 'gpt-5.2-codex', label: 'GPT-5.2-Codex' },
        { value: 'gpt-5.1', label: 'GPT-5.1' },
        { value: 'gpt-5.1-codex', label: 'GPT-5.1-Codex' },
        { value: 'gpt-5.1-codex-max', label: 'GPT-5.1-Codex-Max' },
        { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1-Codex-Mini' },
        // Gemini models
        { value: 'gemini-3.1-pro', label: 'Gemini-3.1-Pro' },
        { value: 'gemini-3.0-flash', label: 'Gemini-3.0-Flash' },
        { value: 'gemini-2.5-pro', label: 'Gemini-2.5-Pro' },
        { value: 'gemini-3.1-flash-lite', label: 'Gemini-3.1-Flash-Lite' },
        // GLM models (IOA)
        { value: 'glm-5.0-turbo-ioa', label: 'GLM-5.0-Turbo' },
        { value: 'glm-5.0-ioa', label: 'GLM-5.0' },
        { value: 'glm-4.7-ioa', label: 'GLM-4.7' },
        // MiniMax models (IOA)
        { value: 'minimax-m2.7-ioa', label: 'MiniMax-M2.7' },
        { value: 'minimax-m2.5-ioa', label: 'MiniMax-M2.5' },
        // Kimi (IOA)
        { value: 'kimi-k2.5-ioa', label: 'Kimi-K2.5' },
        // DeepSeek (IOA)
        { value: 'deepseek-v3-2-volc-ioa', label: 'DeepSeek-V3.2' },
        // Hunyuan (IOA)
        { value: 'hunyuan-2.0-thinking-ioa', label: 'Hunyuan-2.0-Thinking' },
      ];
      groups.push({
        provider_id: 'codebuddy',
        provider_name: 'CodeBuddy SDK',
        provider_type: 'codebuddy',
        sdkProxyOnly: true,
        models: CODEBUDDY_DEFAULT_MODELS.map(m => {
          const cw = getContextWindow(m.value);
          return cw != null ? { ...m, contextWindow: cw } : m;
        }),
      });
    } else {
      // Claude Code provider group (default)
      const envHasDirectCredentials = !!(
        process.env.ANTHROPIC_API_KEY ||
        process.env.ANTHROPIC_AUTH_TOKEN ||
        getSetting('anthropic_auth_token')
      );
      groups.push({
        provider_id: 'env',
        provider_name: 'Claude Code',
        provider_type: 'anthropic',
        ...(!envHasDirectCredentials ? { sdkProxyOnly: true } : {}),
        models: DEFAULT_MODELS.map(m => {
          const cw = getContextWindow(m.value);
          return cw != null ? { ...m, contextWindow: cw } : m;
        }),
      });
    }

    // If SDK has discovered models, override hardcoded defaults with live data
    try {
      const { getCachedModels } = await import('@/lib/agent-sdk-capabilities');

      if (cliRuntime === 'codebuddy') {
        const cbSdkModels = getCachedModels('codebuddy');
        if (cbSdkModels.length > 0) {
          groups[0].models = cbSdkModels.map(m => {
            const cw = getContextWindow(m.value);
            return {
              value: m.value,
              label: m.displayName,
              description: m.description,
              supportsEffort: m.supportsEffort,
              supportedEffortLevels: m.supportedEffortLevels,
              supportsAdaptiveThinking: m.supportsAdaptiveThinking,
              ...(cw != null ? { contextWindow: cw } : {}),
            };
          });
        }
      } else {
        const sdkModels = getCachedModels('env');
        if (sdkModels.length > 0) {
          groups[0].models = sdkModels.map(m => {
            const cw = getContextWindow(m.value);
            return {
              value: m.value,
              label: m.displayName,
              description: m.description,
              supportsEffort: m.supportsEffort,
              supportedEffortLevels: m.supportedEffortLevels,
              supportsAdaptiveThinking: m.supportsAdaptiveThinking,
              ...(cw != null ? { contextWindow: cw } : {}),
            };
          });
        }
      }
    } catch {
      // SDK capabilities not available, keep defaults
    }

    // Build a group for each configured provider
    for (const provider of providers) {
      // Determine protocol — use new field if present, otherwise infer from legacy
      const protocol: Protocol = (provider.protocol as Protocol) ||
        inferProtocolFromLegacy(provider.provider_type, provider.base_url);

      // Skip media-only providers in chat model selector
      if (MEDIA_PROTOCOLS.has(protocol) || MEDIA_PROVIDER_TYPES.has(provider.provider_type)) continue;

      // Get models: DB provider_models first, then catalog defaults, then env fallback
      let rawModels: ModelEntry[];

      // 1) Check DB provider_models table
      let dbModels: { value: string; label: string; upstreamModelId?: string; capabilities?: Record<string, unknown> }[] = [];
      try {
        const provModels = getModelsForProvider(provider.id);
        if (provModels.length > 0) {
          dbModels = provModels.map(m => {
            let caps: Record<string, unknown> | undefined;
            let vars: Record<string, unknown> | undefined;
            try { const p = JSON.parse(m.capabilities_json || '{}'); if (Object.keys(p).length > 0) caps = p; } catch { /* ignore */ }
            try { const v = JSON.parse(m.variants_json || '{}'); if (Object.keys(v).length > 0) vars = v; } catch { /* ignore */ }
            return {
              value: m.model_id,
              label: m.display_name || m.model_id,
              upstreamModelId: m.upstream_model_id || undefined,
              capabilities: caps,
              variants: vars,
            };
          });
        }
      } catch { /* table may not exist in old DBs */ }

      // 2) Catalog defaults
      const catalogModels = getDefaultModelsForProvider(protocol, provider.base_url);
      const catalogRaw = catalogModels.map(m => ({
        value: m.modelId,
        label: m.displayName,
        upstreamModelId: m.upstreamModelId,
        capabilities: m.capabilities as Record<string, unknown> | undefined,
      }));

      // Start with DB models + catalog defaults.
      // If both are empty (e.g. Volcengine where user must specify model names),
      // leave rawModels empty — do NOT fall back to DEFAULT_MODELS (Sonnet/Opus/Haiku).
      if (dbModels.length > 0) {
        const dbIds = new Set(dbModels.map(m => m.value));
        rawModels = [...dbModels, ...catalogRaw.filter(m => !dbIds.has(m.value))];
      } else {
        rawModels = [...catalogRaw];
      }

      // Inject models from role_models_json into the list if not already present
      // (e.g. user configured "ark-code-latest" for a Volcengine or anthropic-thirdparty provider)
      try {
        const rm = JSON.parse(provider.role_models_json || '{}');
        // Collect unique model IDs from all role fields (default, reasoning, small, haiku, sonnet, opus)
        const roleEntries: { id: string; role: string }[] = [];
        for (const role of ['default', 'reasoning', 'small', 'haiku', 'sonnet', 'opus'] as const) {
          if (rm[role] && !roleEntries.some(e => e.id === rm[role])) {
            roleEntries.push({ id: rm[role], role });
          }
        }
        // Add each role model to the list (default role first, so it appears at the top)
        for (const entry of roleEntries) {
          if (!rawModels.some(m => m.value === entry.id || m.upstreamModelId === entry.id)) {
            const label = entry.role === 'default' ? entry.id : `${entry.id} (${entry.role})`;
            rawModels.unshift({ value: entry.id, label });
          }
        }
      } catch { /* ignore */ }

      // Legacy: inject ANTHROPIC_MODEL from env overrides if not already present
      // Also check upstreamModelId to avoid duplicates (e.g. catalog has modelId='sonnet'
      // with upstreamModelId='mimo-v2-pro', and env has ANTHROPIC_MODEL='mimo-v2-pro')
      try {
        const envOverrides = provider.env_overrides_json || provider.extra_env || '{}';
        const envObj = JSON.parse(envOverrides);
        if (envObj.ANTHROPIC_MODEL && !rawModels.some(m => m.value === envObj.ANTHROPIC_MODEL || m.upstreamModelId === envObj.ANTHROPIC_MODEL)) {
          rawModels.unshift({ value: envObj.ANTHROPIC_MODEL, label: envObj.ANTHROPIC_MODEL });
        }
      } catch { /* ignore */ }

      const models = deduplicateModels(rawModels).map(m => {
        const cw = getContextWindow(m.value);
        return {
          ...m,
          ...(cw != null ? { contextWindow: cw } : {}),
        };
      });

      // Detect SDK-proxy-only providers via preset match
      const preset = findPresetForLegacy(provider.base_url, provider.provider_type, protocol);
      const sdkProxyOnly = preset?.sdkProxyOnly === true;

      groups.push({
        provider_id: provider.id,
        provider_name: provider.name,
        provider_type: provider.provider_type,
        ...(sdkProxyOnly ? { sdkProxyOnly: true } : {}),
        models,
      });
    }

    // Determine default provider — auto-heal stale references on read
    let defaultProviderId = getDefaultProviderId();
    if (defaultProviderId && !getProvider(defaultProviderId)) {
      // Stale default (provider was deleted). Fix it now.
      const firstValid = groups.find(g => g.provider_id !== 'env');
      defaultProviderId = firstValid?.provider_id || '';
      setDefaultProviderId(defaultProviderId);
    }
    defaultProviderId = defaultProviderId || groups[0]?.provider_id || '';

    return NextResponse.json({
      groups,
      default_provider_id: defaultProviderId,
    });
  } catch (error) {
    return NextResponse.json<ErrorResponse>(
      { error: error instanceof Error ? error.message : 'Failed to get models' },
      { status: 500 }
    );
  }
}

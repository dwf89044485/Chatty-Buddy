"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SpinnerGap, PencilSimple, Stethoscope } from "@/components/ui/icon";
import { ProviderForm } from "./ProviderForm";
import { ProviderDoctorDialog } from "./ProviderDoctorDialog";
import type { ProviderFormData } from "./ProviderForm";
import { PresetConnectDialog } from "./PresetConnectDialog";
import {
  QUICK_PRESETS,
  GEMINI_IMAGE_MODELS,
  getGeminiImageModel,
  getProviderIcon,
  findMatchingPreset,
  type QuickPreset,
} from "./provider-presets";
import type { ApiProvider } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import Anthropic from "@lobehub/icons/es/Anthropic";
import { ProviderOptionsSection } from "./ProviderOptionsSection";

type CliRuntime = 'claude' | 'codebuddy';

interface RuntimeInstallInfo {
  path: string;
  version: string | null;
  type: string;
}

interface RuntimeStatusDetail {
  connected: boolean;
  version: string | null;
  binaryPath?: string | null;
  installType?: string | null;
  otherInstalls?: RuntimeInstallInfo[];
  missingGit?: boolean;
  warnings?: string[];
}

interface RuntimeStatusResponse {
  runtime: CliRuntime;
  runtimes: {
    claude: RuntimeStatusDetail;
    codebuddy: RuntimeStatusDetail;
  };
}

const RUNTIME_META: Record<CliRuntime, { title: string; subtitleZh: string; subtitleEn: string }> = {
  claude: {
    title: 'Claude Code',
    subtitleZh: '兼容当前主链，能力最完整',
    subtitleEn: 'Best compatibility with the current mainline',
  },
  codebuddy: {
    title: 'CodeBuddy CLI',
    subtitleZh: '复用已登录 CLI，直接切换运行时',
    subtitleEn: 'Reuse the authenticated CLI and switch instantly',
  },
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProviderManager() {
  const [providers, setProviders] = useState<ApiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [envDetected, setEnvDetected] = useState<Record<string, string>>({});
  const { t } = useTranslation();
  const isZh = t('nav.chats') === '对话';
  const [cliRuntime, setCliRuntime] = useState<CliRuntime>('claude');
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusResponse | null>(null);
  const [runtimeSaving, setRuntimeSaving] = useState<CliRuntime | null>(null);

  // Edit dialog state — fallback ProviderForm for providers that don't match any preset
  const [formOpen, setFormOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ApiProvider | null>(null);

  // Preset connect/edit dialog state
  const [connectPreset, setConnectPreset] = useState<QuickPreset | null>(null);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [presetEditProvider, setPresetEditProvider] = useState<ApiProvider | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<ApiProvider | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Doctor dialog state
  const [doctorOpen, setDoctorOpen] = useState(false);

  const fetchProviders = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/providers");
      if (!res.ok) throw new Error("Failed to load providers");
      const data = await res.json();
      setProviders(data.providers || []);
      setEnvDetected(data.env_detected || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRuntimeStatus = useCallback(async () => {
    const [settingsRes, statusRes] = await Promise.all([
      fetch('/api/settings/app'),
      fetch('/api/claude-status'),
    ]);

    if (settingsRes.ok) {
      const settingsData = await settingsRes.json();
      const nextRuntime = settingsData.settings?.cli_runtime === 'codebuddy' ? 'codebuddy' : 'claude';
      setCliRuntime(nextRuntime);
    }

    if (statusRes.ok) {
      const statusData: RuntimeStatusResponse = await statusRes.json();
      setRuntimeStatus(statusData);
      setCliRuntime(statusData.runtime === 'codebuddy' ? 'codebuddy' : 'claude');
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchProviders(), fetchRuntimeStatus()]);
  }, [fetchProviders, fetchRuntimeStatus]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const handleRuntimeSwitch = useCallback(async (nextRuntime: CliRuntime) => {
    if (nextRuntime === cliRuntime) return;
    setRuntimeSaving(nextRuntime);
    try {
      const res = await fetch('/api/settings/app', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { cli_runtime: nextRuntime } }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to switch CLI runtime');
      }

      await fetch('/api/claude-status/invalidate', { method: 'POST' }).catch(() => null);
      setCliRuntime(nextRuntime);
      await fetchRuntimeStatus();
      window.dispatchEvent(new Event('provider-changed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch CLI runtime');
    } finally {
      setRuntimeSaving(null);
    }
  }, [cliRuntime, fetchRuntimeStatus]);

  const handleEdit = (provider: ApiProvider) => {
    // Try to match provider to a quick preset for a cleaner edit experience
    const matchedPreset = findMatchingPreset(provider);
    if (matchedPreset) {
      // Clear stale generic-form state to prevent handleEditSave picking the wrong target
      setEditingProvider(null);
      setConnectPreset(matchedPreset);
      setPresetEditProvider(provider);
      setConnectDialogOpen(true);
    } else {
      // Clear stale preset-edit state
      setPresetEditProvider(null);
      setEditingProvider(provider);
      setFormOpen(true);
    }
  };

  const handleEditSave = async (data: ProviderFormData) => {
    const target = presetEditProvider || editingProvider;
    if (!target) return;
    const res = await fetch(`/api/providers/${target.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to update provider");
    }
    const result = await res.json();
    setProviders((prev) => prev.map((p) => (p.id === target.id ? result.provider : p)));
    window.dispatchEvent(new Event("provider-changed"));
  };

  const handlePresetAdd = async (data: ProviderFormData) => {
    const res = await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to create provider");
    }
    const result = await res.json();
    const newProvider: ApiProvider = result.provider;
    setProviders((prev) => [...prev, newProvider]);

    // Auto-set as default if this is the first provider
    // Otherwise ask the user if they want to switch
    if (newProvider.id) {
      const isFirst = providers.length === 0;
      const shouldSwitch = isFirst || window.confirm(
        isZh
          ? `已添加「${newProvider.name}」。是否将其设为默认服务商？\n（当前新对话将使用此服务商）`
          : `Added "${newProvider.name}". Set as default provider?\n(New conversations will use this provider)`
      );
      if (shouldSwitch) {
        try {
          await fetch('/api/providers/set-default', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider_id: newProvider.id }),
          });
          localStorage.setItem('codepilot:last-provider-id', newProvider.id);
        } catch { /* best effort */ }
      }
    }

    window.dispatchEvent(new Event("provider-changed"));
  };

  const handleOpenPresetDialog = (preset: QuickPreset) => {
    setConnectPreset(preset);
    setPresetEditProvider(null); // ensure create mode
    setConnectDialogOpen(true);
  };

  const handleDisconnect = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/providers/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        setProviders((prev) => prev.filter((p) => p.id !== deleteTarget.id));
        window.dispatchEvent(new Event("provider-changed"));
      }
    } catch { /* ignore */ } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleImageModelChange = useCallback(async (provider: ApiProvider, model: string) => {
    try {
      const env = JSON.parse(provider.extra_env || '{}');
      env.GEMINI_IMAGE_MODEL = model;
      const newExtraEnv = JSON.stringify(env);
      const res = await fetch(`/api/providers/${provider.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: provider.name,
          provider_type: provider.provider_type,
          base_url: provider.base_url,
          api_key: provider.api_key,
          extra_env: newExtraEnv,
          notes: provider.notes,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setProviders(prev => prev.map(p => p.id === provider.id ? result.provider : p));
        window.dispatchEvent(new Event('provider-changed'));
      }
    } catch { /* ignore */ }
  }, []);

  const sorted = [...providers].sort((a, b) => a.sort_order - b.sort_order);

  const renderRuntimeCard = (runtime: CliRuntime) => {
    const status = runtimeStatus?.runtimes?.[runtime];
    const active = cliRuntime === runtime;
    const connected = status?.connected ?? false;
    const warnings = status?.warnings || [];
    const hasWarnings = warnings.length > 0 || !!status?.missingGit;
    const meta = RUNTIME_META[runtime];

    return (
      <div
        key={runtime}
        className={[
          'group relative overflow-hidden rounded-2xl border p-4 transition-all duration-200',
          active
            ? 'border-primary/40 bg-gradient-to-br from-primary/10 via-background to-background shadow-lg shadow-primary/10'
            : 'border-border/60 bg-gradient-to-br from-muted/30 via-background to-background hover:border-primary/20 hover:shadow-md',
        ].join(' ')}
      >
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_35%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_35%)]" />
        <div className="relative space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold tracking-tight">{meta.title}</span>
                {active && (
                  <Badge className="border-primary/30 bg-primary/15 text-primary hover:bg-primary/15">
                    {isZh ? '当前使用中' : 'Active Runtime'}
                  </Badge>
                )}
                {!connected && (
                  <Badge variant="outline" className="text-[10px] border-status-error/40 text-status-error-foreground">
                    {isZh ? '未检测到' : 'Not detected'}
                  </Badge>
                )}
                {connected && hasWarnings && (
                  <Badge variant="outline" className="text-[10px] border-status-warning/40 text-status-warning-foreground">
                    {isZh ? '需关注' : 'Needs attention'}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {isZh ? meta.subtitleZh : meta.subtitleEn}
              </p>
            </div>
            <div className={[
              'mt-0.5 h-2.5 w-2.5 rounded-full shrink-0 transition-colors',
              connected
                ? hasWarnings
                  ? 'bg-status-warning shadow-[0_0_0_4px_rgba(245,158,11,0.12)]'
                  : 'bg-status-success shadow-[0_0_0_4px_rgba(34,197,94,0.12)]'
                : 'bg-status-error shadow-[0_0_0_4px_rgba(239,68,68,0.12)]',
            ].join(' ')} />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-border/50 bg-background/80 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/80">
                {isZh ? '状态' : 'Status'}
              </p>
              <p className="mt-1 text-sm font-medium">
                {connected
                  ? hasWarnings
                    ? (isZh ? '可用但需关注' : 'Ready with warnings')
                    : (isZh ? '已就绪' : 'Ready')
                  : (isZh ? '等待安装 / 登录' : 'Waiting for install / auth')}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-background/80 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/80">
                {isZh ? '版本' : 'Version'}
              </p>
              <p className="mt-1 text-sm font-medium">{status?.version || '—'}</p>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-border/60 bg-background/70 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/80">
              {isZh ? '可执行路径' : 'Binary Path'}
            </p>
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
              {status?.binaryPath || (isZh ? '暂未发现二进制文件' : 'Binary not detected yet')}
            </p>
          </div>

          {warnings.length > 0 && (
            <div className="space-y-1 rounded-xl border border-status-warning/20 bg-status-warning-muted/60 px-3 py-2">
              {warnings.slice(0, 2).map((warning, index) => (
                <p key={index} className="text-[11px] leading-relaxed text-status-warning-foreground/90">
                  {warning}
                </p>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-muted-foreground">
              {active
                ? (isZh ? '新的对话与桥接消息将走此运行时。' : 'New chats and bridge messages will use this runtime.')
                : (isZh ? '点击即可切换，不会影响已存在会话记录。' : 'Switch instantly without affecting existing chat history.')}
            </p>
            <Button
              size="sm"
              variant={active ? 'secondary' : 'default'}
              className={active ? 'shrink-0' : 'shrink-0 shadow-sm'}
              disabled={runtimeSaving !== null || !connected}
              onClick={() => handleRuntimeSwitch(runtime)}
            >
              {runtimeSaving === runtime
                ? (isZh ? '切换中...' : 'Switching...')
                : active
                  ? (isZh ? '当前运行时' : 'Current')
                  : (isZh ? '切换到这里' : 'Use This Runtime')}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Error */}
      {error && (
        <div className="rounded-md bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* ─── Section 0: CLI Runtime Switch ─── */}
      {!loading && (
        <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-muted/30 p-4 md:p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">
                {isZh ? 'CLI 运行时切换' : 'CLI Runtime Switch'}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground max-w-2xl">
                {isZh
                  ? '保留原有 Claude Code，同时接入 CodeBuddy CLI。这里决定新的聊天与桥接消息走哪一个本地 CLI 运行时。'
                  : 'Keep Claude Code and add CodeBuddy CLI side by side. This switch decides which local CLI runtime powers new chats and bridge messages.'}
              </p>
            </div>
            <Badge variant="outline" className="w-fit border-primary/25 bg-primary/10 text-primary">
              {isZh ? `当前：${RUNTIME_META[cliRuntime].title}` : `Current: ${RUNTIME_META[cliRuntime].title}`}
            </Badge>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {renderRuntimeCard('claude')}
            {renderRuntimeCard('codebuddy')}
          </div>
        </div>
      )}

      {/* ─── Section 0.5: Troubleshooting ─── */}
      <div className="rounded-lg border border-border/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">{isZh ? '连接诊断' : 'Connection Diagnostics'}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isZh
                ? '检查 CLI、认证、模型兼容性和网络连接是否正常'
                : 'Check CLI, auth, model compatibility, and network connectivity'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => setDoctorOpen(true)}
          >
            <Stethoscope size={14} />
            {isZh ? '运行诊断' : 'Run Diagnostics'}
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <SpinnerGap size={16} className="animate-spin" />
          <p className="text-sm">{t('common.loading')}</p>
        </div>
      )}

      {/* ─── Section 1: Connected Providers ─── */}
      {!loading && (
        <div className="rounded-lg border border-border/50 p-4 space-y-2">
          <h3 className="text-sm font-medium mb-1">{t('provider.connectedProviders')}</h3>

          {/* Claude Code default config */}
          <div className="border-b border-border/30 pb-2">
            <div className="flex items-center gap-3 py-2.5 px-1">
              <div className="shrink-0 w-[22px] flex justify-center">
                <Anthropic size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Claude Code</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {t('provider.default')}
                  </Badge>
                  {Object.keys(envDetected).length > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-status-success-foreground border-status-success-border">
                      ENV
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground ml-[34px] leading-relaxed">
              {t('provider.ccSwitchHint')}
            </p>
            <ProviderOptionsSection providerId="env" />
          </div>

          {/* Connected provider list */}
          {sorted.length > 0 ? (
            sorted.map((provider) => (
              <div
                key={provider.id}
                className="py-2.5 px-1 border-b border-border/30 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <div className="shrink-0 w-[22px] flex justify-center">
                    {getProviderIcon(provider.name, provider.base_url)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{provider.name}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {provider.api_key
                          ? (provider.extra_env?.includes("ANTHROPIC_AUTH_TOKEN") ? "Auth Token" : "API Key")
                          : t('provider.configured')}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Edit"
                      onClick={() => handleEdit(provider)}
                    >
                      <PencilSimple size={12} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(provider)}
                    >
                      {t('provider.disconnect')}
                    </Button>
                  </div>
                </div>
                {/* Provider options (thinking mode + 1M context) — only for official Anthropic */}
                {provider.base_url === 'https://api.anthropic.com' && (
                  <ProviderOptionsSection providerId={provider.id} />
                )}
                {/* Gemini Image model selector — capsule buttons */}
                {provider.provider_type === 'gemini-image' && (
                  <div className="ml-[34px] mt-2 flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground mr-1">{isZh ? '模型' : 'Model'}:</span>
                    {GEMINI_IMAGE_MODELS.map((m) => {
                      const isActive = getGeminiImageModel(provider) === m.value;
                      return (
                        <Button
                          key={m.value}
                          variant="ghost"
                          size="sm"
                          onClick={() => handleImageModelChange(provider, m.value)}
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border h-auto ${
                            isActive
                              ? 'bg-primary/10 text-primary border-primary/30'
                              : 'text-muted-foreground border-border/60 hover:text-foreground hover:border-foreground/30 hover:bg-accent/50'
                          }`}
                        >
                          {m.label}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          ) : (
            Object.keys(envDetected).length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">
                {t('provider.noConnected')}
              </p>
            )
          )}
        </div>
      )}

      {/* ─── Section 2: Add Provider (Quick Presets) ─── */}
      {!loading && (
        <div className="rounded-lg border border-border/50 p-4">
          <h3 className="text-sm font-medium mb-1">{t('provider.addProviderSection')}</h3>
          <p className="text-xs text-muted-foreground mb-3">
            {t('provider.addProviderDesc')}
          </p>

          {/* Chat Providers */}
          <div className="mb-1">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {t('provider.chatProviders')}
            </h4>
            {QUICK_PRESETS.filter((p) => p.category !== "media").map((preset) => (
              <div
                key={preset.key}
                className="flex items-center gap-3 py-2.5 px-1 border-b border-border/30 last:border-b-0"
              >
                <div className="shrink-0 w-[22px] flex justify-center">{preset.icon}</div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{preset.name}</span>
                  <p className="text-xs text-muted-foreground truncate">
                    {isZh ? preset.descriptionZh : preset.description}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="xs"
                  className="shrink-0 gap-1"
                  onClick={() => handleOpenPresetDialog(preset)}
                >
                  + {t('provider.connect')}
                </Button>
              </div>
            ))}
          </div>

          {/* Media Providers */}
          <div className="mt-4 pt-3 border-t border-border/30">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {t('provider.mediaProviders')}
            </h4>
            {QUICK_PRESETS.filter((p) => p.category === "media").map((preset) => (
              <div
                key={preset.key}
                className="flex items-center gap-3 py-2.5 px-1 border-b border-border/30 last:border-b-0"
              >
                <div className="shrink-0 w-[22px] flex justify-center">{preset.icon}</div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{preset.name}</span>
                  <p className="text-xs text-muted-foreground truncate">
                    {isZh ? preset.descriptionZh : preset.description}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="xs"
                  className="shrink-0 gap-1"
                  onClick={() => handleOpenPresetDialog(preset)}
                >
                  + {t('provider.connect')}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit dialog (full form for editing existing providers) */}
      <ProviderForm
        open={formOpen}
        onOpenChange={setFormOpen}
        mode="edit"
        provider={editingProvider}
        onSave={handleEditSave}
        initialPreset={null}
      />

      {/* Preset connect/edit dialog */}
      <PresetConnectDialog
        preset={connectPreset}
        open={connectDialogOpen}
        onOpenChange={(open) => {
          setConnectDialogOpen(open);
          if (!open) setPresetEditProvider(null);
        }}
        onSave={presetEditProvider ? handleEditSave : handlePresetAdd}
        editProvider={presetEditProvider}
      />

      {/* Provider Doctor dialog */}
      <ProviderDoctorDialog open={doctorOpen} onOpenChange={setDoctorOpen} />

      {/* Disconnect confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('provider.disconnectProvider')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('provider.disconnectConfirm', { name: deleteTarget?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? t('provider.disconnecting') : t('provider.disconnect')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
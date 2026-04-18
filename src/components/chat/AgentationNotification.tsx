"use client";

import { Warning, Check, Info, Sparkle, Eye, ArrowRight } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { usePanel } from "@/hooks/usePanel";
import { useTranslation } from "@/hooks/useTranslation";
import type { AgentationAnnotation } from "@/lib/agentation-bridge";
import { cn } from "@/lib/utils";

const SEVERITY_CONFIG = {
  error: {
    icon: Warning,
    color: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/20",
    label: "Error",
  },
  warning: {
    icon: Warning,
    color: "text-status-warning-foreground",
    bg: "bg-status-warning/10",
    border: "border-status-warning/20",
    label: "Warning",
  },
  info: {
    icon: Info,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    label: "Info",
  },
  suggestion: {
    icon: Sparkle,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    label: "Suggestion",
  },
} as const;

interface AgentationNotificationProps {
  annotation: AgentationAnnotation;
  onLetAgentHandle?: (annotation: AgentationAnnotation) => void;
  onView?: (annotation: AgentationAnnotation) => void;
  onDismiss?: (annotation: AgentationAnnotation) => void;
}

/**
 * Inline notification card shown in the chat message stream
 * when a user creates an annotation in the browser panel.
 */
export function AgentationNotification({
  annotation,
  onLetAgentHandle,
  onView,
  onDismiss,
}: AgentationNotificationProps) {
  const { setBrowserOpen } = usePanel();
  const { t } = useTranslation();
  const config = SEVERITY_CONFIG[annotation.severity] || SEVERITY_CONFIG.info;
  const Icon = config.icon;

  const handleView = () => {
    setBrowserOpen(true);
    onView?.(annotation);
  };

  const isResolved = annotation.status === 'resolved';

  return (
    <div
      className={cn(
        "mx-4 my-2 rounded-lg border p-3 transition-opacity",
        config.bg,
        config.border,
        isResolved && "opacity-60"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={14} className={config.color} weight="fill" />
        <span className={cn("text-xs font-medium", config.color)}>
          {config.label}
        </span>
        {annotation.elementName && (
          <code className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono">
            {annotation.elementName}
          </code>
        )}
        {isResolved && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-status-success-foreground">
            <Check size={10} />
            Resolved
          </span>
        )}
      </div>

      {/* Feedback content */}
      <p className="text-sm text-foreground/90 mb-2 leading-relaxed">
        {annotation.feedback}
      </p>

      {/* Element path */}
      {annotation.xpath && (
        <p className="text-[10px] text-muted-foreground/50 mb-2 font-mono truncate">
          {annotation.xpath}
        </p>
      )}

      {/* Action buttons */}
      {!isResolved && (
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onLetAgentHandle?.(annotation)}
          >
            <Sparkle size={12} className="mr-1" />
            Let Agent Handle
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={handleView}
          >
            <Eye size={12} className="mr-1" />
            View
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => onDismiss?.(annotation)}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Compact badge showing pending annotation count.
 * Used in the NavRail browser button.
 */
export function AgentationBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}

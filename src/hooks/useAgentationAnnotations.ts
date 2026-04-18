"use client";

import { useState, useEffect, useCallback } from "react";
import {
  agentationBridge,
  type AgentationAnnotation,
  type AgentationEvent,
} from "@/lib/agentation-bridge";

export interface UseAgentationAnnotationsReturn {
  /** All current annotations */
  annotations: AgentationAnnotation[];
  /** Number of pending (unresolved) annotations */
  pendingCount: number;
  /** Whether we're connected to the agentation server */
  connected: boolean;
  /** Acknowledge an annotation (mark as seen) */
  acknowledge: (id: string) => void;
  /** Mark an annotation as resolved */
  resolve: (id: string) => void;
  /** Clear all annotations */
  clearAll: () => void;
}

/**
 * Hook to subscribe to agentation annotation events.
 * Maintains a list of annotations and provides helper methods.
 */
export function useAgentationAnnotations(): UseAgentationAnnotationsReturn {
  const [annotations, setAnnotations] = useState<AgentationAnnotation[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const unsubscribe = agentationBridge.subscribe((event: AgentationEvent) => {
      switch (event.type) {
        case 'connected':
          setConnected(true);
          break;

        case 'disconnected':
          setConnected(false);
          break;

        case 'annotation.created':
          if (event.annotation) {
            setAnnotations((prev) => {
              // Deduplicate
              if (prev.some((a) => a.id === event.annotation!.id)) return prev;
              return [...prev, event.annotation!];
            });
          }
          break;

        case 'annotation.updated':
          if (event.annotation) {
            setAnnotations((prev) =>
              prev.map((a) =>
                a.id === event.annotation!.id ? { ...a, ...event.annotation! } : a
              )
            );
          }
          break;

        case 'annotation.resolved':
          if (event.annotation) {
            setAnnotations((prev) =>
              prev.map((a) =>
                a.id === event.annotation!.id
                  ? { ...a, status: 'resolved' as const }
                  : a
              )
            );
          }
          break;

        case 'annotation.deleted':
          if (event.annotation) {
            setAnnotations((prev) =>
              prev.filter((a) => a.id !== event.annotation!.id)
            );
          }
          break;
      }
    });

    return unsubscribe;
  }, []);

  const pendingCount = annotations.filter((a) => a.status === 'pending').length;

  const acknowledge = useCallback((id: string) => {
    setAnnotations((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: 'acknowledged' as const } : a
      )
    );
  }, []);

  const resolve = useCallback((id: string) => {
    setAnnotations((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: 'resolved' as const } : a
      )
    );
  }, []);

  const clearAll = useCallback(() => {
    setAnnotations([]);
  }, []);

  return {
    annotations,
    pendingCount,
    connected,
    acknowledge,
    resolve,
    clearAll,
  };
}

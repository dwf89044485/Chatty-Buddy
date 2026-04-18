/**
 * Agentation bridge — connects to the agentation-mcp SSE event stream
 * and forwards annotation events to the CodePilot UI.
 *
 * This is a CLIENT-SIDE module. It must NOT import any Node.js modules.
 * Server status is fetched via the /api/agentation endpoint instead.
 */

export interface AgentationAnnotation {
  id: string;
  elementSelector: string;
  elementName: string;
  xpath: string;
  feedback: string;
  severity: 'info' | 'warning' | 'error' | 'suggestion';
  status: 'pending' | 'acknowledged' | 'resolved';
  screenshotUrl?: string;
  createdAt: string;
  updatedAt?: string;
}

export type AgentationEventType =
  | 'annotation.created'
  | 'annotation.updated'
  | 'annotation.deleted'
  | 'annotation.resolved'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface AgentationEvent {
  type: AgentationEventType;
  annotation?: AgentationAnnotation;
  message?: string;
}

type EventHandler = (event: AgentationEvent) => void;

class AgentationBridge {
  private handlers: Set<EventHandler> = new Set();
  private eventSource: EventSource | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnected = false;

  /**
   * Subscribe to agentation events.
   * Returns an unsubscribe function.
   */
  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);

    // Auto-connect on first subscriber
    if (this.handlers.size === 1) {
      this.connect();
    }

    return () => {
      this.handlers.delete(handler);
      // Auto-disconnect when no subscribers
      if (this.handlers.size === 0) {
        this.disconnect();
      }
    };
  }

  /**
   * Connect to the agentation-mcp SSE stream.
   * Fetches the server port from the API (avoids importing Node.js modules).
   */
  private async connect() {
    let port: number | null = null;
    try {
      const res = await fetch('/api/agentation');
      if (res.ok) {
        const status = await res.json();
        if (status.running && status.port) {
          port = status.port;
        }
      }
    } catch {
      // API not reachable
    }

    if (!port) {
      // Retry after a delay — server might still be starting
      this.scheduleReconnect(3000);
      return;
    }

    try {
      this.eventSource = new EventSource(`http://127.0.0.1:${port}/events`);

      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.emit({ type: 'connected' });
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.emit(data as AgentationEvent);
        } catch {
          // Ignore malformed events
        }
      };

      this.eventSource.addEventListener('annotation.created', (event) => {
        try {
          const annotation = JSON.parse((event as MessageEvent).data);
          this.emit({ type: 'annotation.created', annotation });
        } catch { /* ignore */ }
      });

      this.eventSource.addEventListener('annotation.updated', (event) => {
        try {
          const annotation = JSON.parse((event as MessageEvent).data);
          this.emit({ type: 'annotation.updated', annotation });
        } catch { /* ignore */ }
      });

      this.eventSource.addEventListener('annotation.resolved', (event) => {
        try {
          const annotation = JSON.parse((event as MessageEvent).data);
          this.emit({ type: 'annotation.resolved', annotation });
        } catch { /* ignore */ }
      });

      this.eventSource.onerror = () => {
        this.isConnected = false;
        this.emit({ type: 'disconnected' });
        this.eventSource?.close();
        this.eventSource = null;
        this.scheduleReconnect(5000);
      };
    } catch (err) {
      this.emit({
        type: 'error',
        message: err instanceof Error ? err.message : 'Connection failed',
      });
      this.scheduleReconnect(5000);
    }
  }

  /**
   * Disconnect from the SSE stream.
   */
  private disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.isConnected = false;
  }

  /**
   * Schedule a reconnection attempt.
   */
  private scheduleReconnect(delay: number) {
    if (this.reconnectTimer) return;
    if (this.handlers.size === 0) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.handlers.size > 0) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Emit an event to all subscribers.
   */
  private emit(event: AgentationEvent) {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('[agentation-bridge] Handler error:', err);
      }
    }
  }

  /**
   * Get the current connection status.
   */
  getStatus(): { connected: boolean } {
    return { connected: this.isConnected };
  }
}

// Singleton instance
export const agentationBridge = new AgentationBridge();

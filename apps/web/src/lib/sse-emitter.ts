// ============================================================
// In-process SSE event emitter
// Maps sessionId → list of listeners.
// Production: swap for Redis pub/sub.
// ============================================================

import type { AgentStreamEvent } from '@lifeos/shared';

type Listener = (event: AgentStreamEvent) => void;

/** Upper bound on replayed events per session, to bound memory. */
const MAX_BACKLOG = 200;

/** How long a finished session stays replayable for a late subscriber. */
const BACKLOG_TTL_MS = 5 * 60 * 1000;

/** Events that end a session — nothing may follow them. */
function isTerminal(event: AgentStreamEvent): boolean {
  return event.type === 'session_complete' || event.type === 'session_error';
}

export class SSEEmitter {
  private channels = new Map<string, Set<Listener>>();
  // Events emitted before (or while absent) a subscriber was attached. The
  // chat route returns the sessionId before the browser opens its
  // EventSource, so the agent routinely emits its first events into the void.
  private backlogs = new Map<string, AgentStreamEvent[]>();
  private expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  on(sessionId: string, listener: Listener) {
    let channel = this.channels.get(sessionId);
    if (!channel) {
      channel = new Set<Listener>();
      this.channels.set(sessionId, channel);
    }
    // Registered before replay so a listener that unsubscribes itself on a
    // terminal event is correctly removed.
    channel.add(listener);

    // Replay anything emitted before this subscriber attached. Without this the
    // UI silently misses every event up to the point of subscription — which,
    // for a fast agent run, is the entire run.
    const backlog = this.backlogs.get(sessionId);
    if (backlog) {
      for (const event of backlog) {
        try {
          listener(event);
        } catch {
          // listener may have thrown (e.g. it closed the stream on a terminal
          // event); stop replaying at that point.
          break;
        }
        if (isTerminal(event)) break;
      }
    }
  }

  off(sessionId: string, listener: Listener) {
    this.channels.get(sessionId)?.delete(listener);
    if (this.channels.get(sessionId)?.size === 0) {
      this.channels.delete(sessionId);
    }
  }

  emit(sessionId: string, event: AgentStreamEvent) {
    const backlog = this.backlogs.get(sessionId) ?? [];
    backlog.push(event);
    if (backlog.length > MAX_BACKLOG) {
      backlog.splice(0, backlog.length - MAX_BACKLOG);
    }
    this.backlogs.set(sessionId, backlog);

    const listeners = this.channels.get(sessionId);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // listener may have thrown due to client disconnect
        }
      }
    }

    if (isTerminal(event)) this.scheduleExpiry(sessionId);
  }

  /**
   * Drop a finished session's backlog once no subscriber can still need it,
   * so long-lived processes don't accumulate replay buffers.
   */
  private scheduleExpiry(sessionId: string) {
    if (this.expiryTimers.has(sessionId)) return;
    const timer = setTimeout(() => {
      this.expiryTimers.delete(sessionId);
      this.backlogs.delete(sessionId);
    }, BACKLOG_TTL_MS);
    // Don't hold the process open just for cleanup.
    if (typeof timer.unref === 'function') timer.unref();
    this.expiryTimers.set(sessionId, timer);
  }
}

// Singleton — shared across API routes in the same Node.js process
declare global {
  // eslint-disable-next-line no-var
  var __sseEmitter: SSEEmitter | undefined;
}

export const sseEmitter: SSEEmitter =
  globalThis.__sseEmitter ?? (globalThis.__sseEmitter = new SSEEmitter());

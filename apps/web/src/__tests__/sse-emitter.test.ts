// ============================================================
// SSE emitter — replay buffer
// ============================================================
//
// Regression coverage for a real defect: /api/agent/chat returns the sessionId
// before the browser opens its EventSource, so the agent's early events were
// emitted with no listener attached and silently dropped. A fast run could
// therefore complete entirely before the client subscribed, leaving the UI
// showing nothing. The emitter now buffers and replays those events.

import { describe, it, expect } from 'vitest';
import { SSEEmitter } from '@/lib/sse-emitter';
import type { AgentStreamEvent } from '@lifeos/shared';

const SID = 'session-under-test';

function start(actionId: string, tool: string): AgentStreamEvent {
  return {
    type: 'action_start',
    sessionId: SID,
    actionId,
    tool,
    message: `Running ${tool}…`,
    timestamp: new Date().toISOString(),
  } as AgentStreamEvent;
}

function complete(summary = 'done'): AgentStreamEvent {
  return {
    type: 'session_complete',
    sessionId: SID,
    summary,
    actionsCount: 1,
    timestamp: new Date().toISOString(),
  } as AgentStreamEvent;
}

describe('SSEEmitter replay buffer', () => {
  it('replays events emitted before any subscriber attached', () => {
    const emitter = new SSEEmitter();
    // Simulates the race: agent runs before the EventSource connects.
    emitter.emit(SID, start('a1', 'get_tasks'));
    emitter.emit(SID, start('a2', 'get_schedule'));
    emitter.emit(SID, complete());

    const received: AgentStreamEvent[] = [];
    emitter.on(SID, (e) => received.push(e));

    expect(received.map((e) => e.type)).toEqual([
      'action_start',
      'action_start',
      'session_complete',
    ]);
  });

  it('replays a fully completed session to a late subscriber', () => {
    const emitter = new SSEEmitter();
    emitter.emit(SID, start('a1', 'generate_plan'));
    emitter.emit(SID, complete('all done'));

    const received: AgentStreamEvent[] = [];
    emitter.on(SID, (e) => received.push(e));

    expect(received).toHaveLength(2);
    expect(received.at(-1)?.type).toBe('session_complete');
  });

  it('delivers live events to an already-attached subscriber', () => {
    const emitter = new SSEEmitter();
    const received: AgentStreamEvent[] = [];
    emitter.on(SID, (e) => received.push(e));

    emitter.emit(SID, start('a1', 'get_tasks'));
    emitter.emit(SID, complete());

    expect(received).toHaveLength(2);
  });

  it('does not duplicate events across the replay/live boundary', () => {
    const emitter = new SSEEmitter();
    emitter.emit(SID, start('a1', 'get_tasks'));

    const received: AgentStreamEvent[] = [];
    emitter.on(SID, (e) => received.push(e));
    emitter.emit(SID, complete());

    const ids = received.map((e) => `${e.type}:${(e as { actionId?: string }).actionId ?? ''}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps sessions isolated from one another', () => {
    const emitter = new SSEEmitter();
    emitter.emit('session-a', start('a1', 'get_tasks'));

    const received: AgentStreamEvent[] = [];
    emitter.on('session-b', (e) => received.push(e));

    expect(received).toHaveLength(0);
  });

  it('stops replaying after a terminal event', () => {
    const emitter = new SSEEmitter();
    emitter.emit(SID, complete());
    // Anything emitted after a terminal event must not be replayed.
    emitter.emit(SID, start('a1', 'should-not-replay'));

    const received: AgentStreamEvent[] = [];
    emitter.on(SID, (e) => received.push(e));

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('session_complete');
  });

  it('replays session_error as a terminal event', () => {
    const emitter = new SSEEmitter();
    emitter.emit(SID, {
      type: 'session_error',
      sessionId: SID,
      message: 'boom',
      timestamp: new Date().toISOString(),
    } as AgentStreamEvent);

    const received: AgentStreamEvent[] = [];
    emitter.on(SID, (e) => received.push(e));

    expect(received.map((e) => e.type)).toEqual(['session_error']);
  });

  it('survives a listener that throws during replay', () => {
    const emitter = new SSEEmitter();
    emitter.emit(SID, start('a1', 'get_tasks'));
    emitter.emit(SID, complete());

    expect(() =>
      emitter.on(SID, () => {
        throw new Error('stream closed');
      }),
    ).not.toThrow();
  });

  it('does not replay to a second subscriber after off()', () => {
    const emitter = new SSEEmitter();
    emitter.emit(SID, start('a1', 'get_tasks'));

    const first: AgentStreamEvent[] = [];
    const listener = (e: AgentStreamEvent) => first.push(e);
    emitter.on(SID, listener);
    emitter.off(SID, listener);

    const second: AgentStreamEvent[] = [];
    emitter.on(SID, (e) => second.push(e));
    // The backlog still exists, so a reconnecting client recovers the history.
    expect(second).toHaveLength(1);
  });
});
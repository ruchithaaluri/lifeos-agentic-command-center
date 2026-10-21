'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useAgentStore } from '@/store/agent';
import { useDashboardStore } from '@/store/dashboard';
import type { AgentStreamEvent } from '@lifeos/shared';

export function useAgent() {
  const store = useAgentStore();
  const dashStore = useDashboardStore();
  const eventSourceRef = useRef<EventSource | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const submit = useCallback(
    async (goal: string) => {
      // Close any existing stream
      eventSourceRef.current?.close();

      // Start agent
      let sessionId: string;
      try {
        const res = await fetch('/api/agent/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal }),
        });
        if (!res.ok) {
          const body = (await res.json()) as { error?: { message?: string } };
          store.failSession(body.error?.message ?? 'Failed to start agent');
          return;
        }
        const data = (await res.json()) as { sessionId: string; goal: string };
        sessionId = data.sessionId;
      } catch {
        store.failSession('Could not connect to agent. Please try again.');
        return;
      }

      store.startSession(sessionId, goal);

      // Open SSE stream
      const es = new EventSource(`/api/agent/stream/${sessionId}`);
      eventSourceRef.current = es;

      es.onmessage = (e: MessageEvent<string>) => {
        let event: AgentStreamEvent | { type: 'connected' };
        try {
          event = JSON.parse(e.data) as AgentStreamEvent | { type: 'connected' };
        } catch {
          return;
        }

        if (event.type === 'connected') return;

        const agentEvent: AgentStreamEvent = event;

        if (agentEvent.type === 'action_start') {
          store.addAction({
            id: agentEvent.actionId,
            tool: agentEvent.tool,
            message: agentEvent.message,
            status: 'running',
            timestamp: agentEvent.timestamp,
          });
        } else if (agentEvent.type === 'action_complete') {
          store.updateAction(agentEvent.actionId, {
            status: 'success',
            message: agentEvent.message,
            latencyMs: agentEvent.latencyMs,
          });
        } else if (agentEvent.type === 'action_failed') {
          store.updateAction(agentEvent.actionId, {
            status: 'failed',
            message: agentEvent.message,
          });
        } else if (agentEvent.type === 'plan_ready') {
          store.setPlan(agentEvent.plan);
        } else if (agentEvent.type === 'session_complete') {
          store.completeSession(agentEvent.summary);
          es.close();
          // Refresh dashboard data
          void refreshDashboard();
        } else if (agentEvent.type === 'session_error') {
          store.failSession(agentEvent.message);
          es.close();
        }
      };

      es.onerror = () => {
        store.failSession('Lost connection to agent stream.');
        es.close();
      };
    },
    [store],
  );

  async function refreshDashboard() {
    dashStore.setLoading(true);
    try {
      const [tasksRes, eventsRes, projectsRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/events'),
        fetch('/api/projects'),
      ]);
      if (tasksRes.ok) {
        const data = (await tasksRes.json()) as { tasks: typeof dashStore.tasks };
        dashStore.setTasks(data.tasks);
      }
      if (eventsRes.ok) {
        const data = (await eventsRes.json()) as { events: typeof dashStore.events; timezone?: string };
        dashStore.setEvents(data.events);
        if (data.timezone) {
          dashStore.setTimezone(data.timezone);
        }
      }
      if (projectsRes.ok) {
        const data = (await projectsRes.json()) as { projects: typeof dashStore.projects };
        dashStore.setProjects(data.projects);
      }
      dashStore.markRefreshed();
    } finally {
      dashStore.setLoading(false);
    }
  }

  const reset = useCallback(async () => {
    eventSourceRef.current?.close();
    store.reset();
    try {
      await fetch('/api/demo/reset', { method: 'POST' });
      await refreshDashboard();
    } catch {
      // ignore
    }
  }, [store]);

  return { submit, reset };
}

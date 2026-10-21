'use client';

import { useEffect, useCallback } from 'react';
import { useDashboardStore, type DashboardState } from '@/store/dashboard';

export function useDashboardData(date?: string): DashboardState & { refresh: () => Promise<void> } {
  const store = useDashboardStore();

  const load = useCallback(async () => {
    store.setLoading(true);
    try {
      const eventsUrl = date ? `/api/events?date=${encodeURIComponent(date)}` : '/api/events';
      const [tasksRes, eventsRes, projectsRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch(eventsUrl),
        fetch('/api/projects'),
      ]);

      if (tasksRes.ok) {
        const data = (await tasksRes.json()) as { tasks: typeof store.tasks };
        store.setTasks(data.tasks);
      }
      if (eventsRes.ok) {
        const data = (await eventsRes.json()) as { events: typeof store.events; timezone?: string };
        store.setEvents(data.events);
        if (data.timezone) store.setTimezone(data.timezone);
      }
      if (projectsRes.ok) {
        const data = (await projectsRes.json()) as { projects: typeof store.projects };
        store.setProjects(data.projects);
      }
      store.markRefreshed();
    } finally {
      store.setLoading(false);
    }
  }, [date, store]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    ...store,
    refresh: load,
  };
}

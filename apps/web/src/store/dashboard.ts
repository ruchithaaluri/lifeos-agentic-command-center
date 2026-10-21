// ============================================================
// Dashboard Zustand Store
// Holds tasks, events, projects — refreshed after agent actions.
// ============================================================

import { create } from 'zustand';

export interface TaskUI {
  id: string;
  title: string;
  status: string;
  priority: string;
  projectId: string | null;
  dueDate: string | null;
  estimatedMinutes: number | null;
  updatedAt: string;
}

export interface EventUI {
  id: string;
  title: string;
  start: string;
  end: string;
  type: string;
  location: string | null;
  projectId: string | null;
}

export interface ProjectUI {
  id: string;
  name: string;
  color: string;
  status: string;
  taskCount: number;
  completedTaskCount: number;
  progressPercent: number;
  urgentTaskCount: number;
  nextDueDate: string | null;
}

export interface DashboardState {
  tasks: TaskUI[];
  events: EventUI[];
  projects: ProjectUI[];
  timezone: string;
  isLoading: boolean;
  lastRefreshed: string | null;

  setTasks: (tasks: TaskUI[]) => void;
  addTask: (task: TaskUI) => void;
  updateTask: (id: string, updates: Partial<TaskUI>) => void;
  removeTask: (id: string) => void;

  setEvents: (events: EventUI[]) => void;
  addEvent: (event: EventUI) => void;
  updateEvent: (id: string, updates: Partial<EventUI>) => void;
  removeEvent: (id: string) => void;

  setProjects: (projects: ProjectUI[]) => void;
  addProject: (project: ProjectUI) => void;

  setTimezone: (tz: string) => void;
  setLoading: (loading: boolean) => void;
  markRefreshed: () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  tasks: [],
  events: [],
  projects: [],
  timezone: 'UTC',
  isLoading: false,
  lastRefreshed: null,

  setTasks: (tasks) => set({ tasks }),
  addTask: (task) =>
    set((state) => ({
      tasks: [task, ...state.tasks.filter((t) => t.id !== task.id)],
    })),
  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  removeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    })),

  setEvents: (events) => set({ events }),
  addEvent: (event) =>
    set((state) => ({
      events: [...state.events.filter((e) => e.id !== event.id), event].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      ),
    })),
  updateEvent: (id, updates) =>
    set((state) => ({
      events: state.events
        .map((e) => (e.id === id ? { ...e, ...updates } : e))
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    })),
  removeEvent: (id) =>
    set((state) => ({
      events: state.events.filter((e) => e.id !== id),
    })),

  setProjects: (projects) => set({ projects }),
  addProject: (project) =>
    set((state) => ({
      projects: [...state.projects.filter((p) => p.id !== project.id), project],
    })),

  setTimezone: (timezone) => set({ timezone }),
  setLoading: (isLoading) => set({ isLoading }),
  markRefreshed: () => set({ lastRefreshed: new Date().toISOString() }),
}));

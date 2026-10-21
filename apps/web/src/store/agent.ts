// ============================================================
// Agent Zustand Store
// Central state for agent sessions, actions, and plans.
// ============================================================

import { create } from 'zustand';
import type { Plan } from '@lifeos/shared';

export interface AgentActionUI {
  id: string;
  tool: string;
  message: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  latencyMs?: number;
  timestamp: string;
}

interface AgentState {
  // Current session
  sessionId: string | null;
  isRunning: boolean;
  goal: string | null;

  // Action log (visible in UI)
  actions: AgentActionUI[];

  // Current plan
  currentPlan: Plan | null;

  // Summary of last execution
  lastSummary: string | null;

  // Error state
  error: string | null;

  // Actions
  startSession: (sessionId: string, goal: string) => void;
  addAction: (action: AgentActionUI) => void;
  updateAction: (id: string, updates: Partial<AgentActionUI>) => void;
  setPlan: (plan: Plan) => void;
  completeSession: (summary: string) => void;
  failSession: (error: string) => void;
  reset: () => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  sessionId: null,
  isRunning: false,
  goal: null,
  actions: [],
  currentPlan: null,
  lastSummary: null,
  error: null,

  startSession: (sessionId, goal) =>
    set({
      sessionId,
      goal,
      isRunning: true,
      actions: [],
      currentPlan: null,
      lastSummary: null,
      error: null,
    }),

  addAction: (action) =>
    set((state) => {
      const idx = state.actions.findIndex((a) => a.id === action.id);
      if (idx >= 0) {
        const existing = state.actions[idx];
        if (existing && (existing.status === 'success' || existing.status === 'failed')) {
          return state;
        }
        const updated = [...state.actions];
        if (existing) {
          updated[idx] = { ...existing, ...action };
        }
        return { actions: updated };
      }
      return { actions: [...state.actions, action] };
    }),

  updateAction: (id, updates) =>
    set((state) => {
      const idx = state.actions.findIndex((a) => a.id === id);
      if (idx >= 0) {
        const updated = [...state.actions];
        const existing = updated[idx];
        if (existing) {
          updated[idx] = { ...existing, ...updates };
        }
        return { actions: updated };
      }
      return {
        actions: [
          ...state.actions,
          {
            id,
            tool: updates.tool || 'unknown',
            message: updates.message || '',
            status: updates.status || 'running',
            latencyMs: updates.latencyMs,
            timestamp: updates.timestamp || new Date().toISOString(),
          },
        ],
      };
    }),

  setPlan: (plan) => set({ currentPlan: plan }),

  completeSession: (summary) =>
    set((state) => ({
      isRunning: false,
      lastSummary: summary,
      actions: state.actions.map((a) =>
        a.status === 'running' || a.status === 'pending' ? { ...a, status: 'success' as const } : a,
      ),
    })),

  failSession: (error) =>
    set((state) => ({
      isRunning: false,
      error,
      actions: state.actions.map((a) =>
        a.status === 'running' || a.status === 'pending' ? { ...a, status: 'failed' as const } : a,
      ),
    })),

  reset: () =>
    set({
      sessionId: null,
      isRunning: false,
      goal: null,
      actions: [],
      currentPlan: null,
      lastSummary: null,
      error: null,
    }),
}));

'use client';

import { useState } from 'react';
import { Plus, CheckSquare } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { TaskCard } from '@/components/dashboard/TaskCard';
import { AddTaskModal } from '@/components/dashboard/AddTaskModal';
import { useDashboardData } from '@/hooks/useDashboardData';
import { Badge } from '@/components/ui/badge';

export default function TasksPage() {
  const [showAddTask, setShowAddTask] = useState(false);
  const { tasks, isLoading, refresh } = useDashboardData();

  const grouped = {
    urgent: tasks.filter((t) => t.priority === 'urgent' && t.status !== 'completed'),
    high: tasks.filter((t) => t.priority === 'high' && t.status !== 'completed'),
    medium: tasks.filter((t) => t.priority === 'medium' && t.status !== 'completed'),
    low: tasks.filter((t) => t.priority === 'low' && t.status !== 'completed'),
    completed: tasks.filter((t) => t.status === 'completed'),
  };

  const openCount = tasks.filter((t) => t.status !== 'completed').length;

  return (
    <AppShell>
      <div className="p-6">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-blue-400" aria-hidden />
              <h1 className="text-2xl font-bold text-white">Tasks</h1>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {openCount} open · {grouped.completed.length} completed
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddTask(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white shadow-glow hover:bg-blue-400 transition-all self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            <span>Add Task</span>
          </button>
        </header>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {(['urgent', 'high', 'medium', 'low'] as const).map((priority) =>
              grouped[priority].length > 0 ? (
                <section key={priority} aria-labelledby={`${priority}-heading`}>
                  <div className="mb-3 flex items-center gap-2">
                    <h2
                      id={`${priority}-heading`}
                      className="text-sm font-semibold capitalize text-slate-300"
                    >
                      {priority}
                    </h2>
                    <Badge variant={priority}>{grouped[priority].length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {grouped[priority].map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onRefresh={() => {
                          void refresh();
                        }}
                      />
                    ))}
                  </div>
                </section>
              ) : null,
            )}

            {grouped.completed.length > 0 && (
              <section aria-labelledby="completed-heading">
                <div className="mb-3 flex items-center gap-2">
                  <h2 id="completed-heading" className="text-sm font-semibold capitalize text-slate-400">
                    Completed
                  </h2>
                  <Badge variant="muted">{grouped.completed.length}</Badge>
                </div>
                <div className="space-y-2 opacity-75">
                  {grouped.completed.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onRefresh={() => {
                        void refresh();
                      }}
                    />
                  ))}
                </div>
              </section>
            )}

            {tasks.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-slate-500">
                <p className="text-base font-medium text-slate-400">No tasks yet.</p>
                <p className="mt-1 text-xs text-slate-500">
                  Create a task manually or let LifeOS plan your workflow from the dashboard.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddTask(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-500/20 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/30 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create First Task
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <AddTaskModal
        isOpen={showAddTask}
        onClose={() => setShowAddTask(false)}
        onSuccess={() => {
          void refresh();
        }}
      />
    </AppShell>
  );
}

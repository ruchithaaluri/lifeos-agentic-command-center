'use client';

import { useState } from 'react';
import { X, Calendar, Clock, Loader2, Check, Trash2, Edit } from 'lucide-react';
import { useDashboardStore, type TaskUI } from '@/store/dashboard';

interface EditTaskModalProps {
  task: TaskUI | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EditTaskModal({ task, isOpen, onClose, onSuccess }: EditTaskModalProps) {
  const updateTask = useDashboardStore((s) => s.updateTask);
  const removeTask = useDashboardStore((s) => s.removeTask);
  const projects = useDashboardStore((s) => s.projects);
  const timezone = useDashboardStore((s) => s.timezone);

  function getLocalDateStr(dStr: string | null): string {
    if (!dStr) return '';
    try {
      const d = new Date(dStr);
      return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(d);
    } catch {
      return dStr.slice(0, 10);
    }
  }

  const [title, setTitle] = useState(task?.title ?? '');
  const [priority, setPriority] = useState<'urgent' | 'high' | 'medium' | 'low'>(
    (task?.priority as 'urgent' | 'high' | 'medium' | 'low') ?? 'medium',
  );
  const [dueDate, setDueDate] = useState<string>(getLocalDateStr(task?.dueDate ?? null));
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | ''>(
    task?.estimatedMinutes ?? 30,
  );
  const [projectId, setProjectId] = useState<string>(task?.projectId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !task) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task) return;
    if (!title.trim()) {
      setError('Task title is required.');
      return;
    }

    setError(null);
    setBusy(true);

    try {
      const payload: Record<string, unknown> = {
        id: task.id,
        title: title.trim(),
        priority,
      };

      if (dueDate) {
        payload['dueDate'] = dueDate.includes('T') ? dueDate : `${dueDate}T12:00:00Z`;
      } else {
        payload['dueDate'] = null;
      }

      if (typeof estimatedMinutes === 'number' && estimatedMinutes > 0) {
        payload['estimatedMinutes'] = estimatedMinutes;
      } else {
        payload['estimatedMinutes'] = null;
      }

      payload['projectId'] = projectId || null;

      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? 'Failed to update task.');
        return;
      }

      const data = (await res.json()) as { task: TaskUI };
      updateTask(task.id, data.task);

      onSuccess?.();
      onClose();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks?id=${encodeURIComponent(task.id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        removeTask(task.id);
        onSuccess?.();
        onClose();
      }
    } catch {
      setError('Failed to delete task.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-task-title"
      onClick={onClose}
    >
      <div
        className="glass bg-navy-900/95 relative w-full max-w-lg rounded-2xl border border-white/10 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-white/8 mb-5 flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
              <Edit className="h-4 w-4" />
            </div>
            <div>
              <h2 id="edit-task-title" className="text-base font-semibold text-white">
                Edit Task & Due Date
              </h2>
              <p className="text-xs text-slate-400">Change task scheduling or priority</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="edit-task-title-input"
              className="mb-1 block text-xs font-medium text-slate-300"
            >
              Title <span className="text-red-400">*</span>
            </label>
            <input
              id="edit-task-title-input"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">Priority</label>
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  {
                    id: 'urgent',
                    label: 'Urgent',
                    border: 'border-red-500/40 text-red-300 bg-red-500/10',
                  },
                  {
                    id: 'high',
                    label: 'High',
                    border: 'border-orange-500/40 text-orange-300 bg-orange-500/10',
                  },
                  {
                    id: 'medium',
                    label: 'Medium',
                    border: 'border-amber-500/40 text-amber-300 bg-amber-500/10',
                  },
                  {
                    id: 'low',
                    label: 'Low',
                    border: 'border-slate-500/40 text-slate-300 bg-slate-500/10',
                  },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPriority(p.id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                    priority === p.id
                      ? `${p.border} font-semibold ring-2 ring-white/20`
                      : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="edit-task-date-input"
                className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-300"
              >
                <Calendar className="h-3.5 w-3.5 text-blue-400" />
                Due Date
              </label>
              <input
                id="edit-task-date-input"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white [color-scheme:dark] focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="edit-task-duration-input"
                className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-300"
              >
                <Clock className="h-3.5 w-3.5 text-purple-400" />
                Duration (min)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id="edit-task-duration-input"
                  type="number"
                  min="5"
                  max="480"
                  step="5"
                  value={estimatedMinutes}
                  onChange={(e) =>
                    setEstimatedMinutes(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                  }
                  className="w-20 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                />
                <div className="flex gap-1">
                  {[15, 30, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setEstimatedMinutes(mins)}
                      className={`rounded border px-2 py-1.5 text-[11px] transition-colors ${
                        estimatedMinutes === mins
                          ? 'border-blue-500/40 bg-blue-500/20 text-blue-300'
                          : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {projects.length > 0 && (
            <div>
              <label
                htmlFor="edit-task-project-select"
                className="mb-1 block text-xs font-medium text-slate-300"
              >
                Project (Optional)
              </label>
              <select
                id="edit-task-project-select"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white [color-scheme:dark] focus:border-blue-500 focus:outline-none"
              >
                <option value="">No Project</option>
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="border-white/8 mt-6 flex items-center justify-between border-t pt-4">
            <button
              type="button"
              onClick={() => {
                void handleDelete();
              }}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Task
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="shadow-glow flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-blue-400 disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Save Task
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { X, Plus, Calendar, Clock, Loader2, Sparkles } from 'lucide-react';
import { useDashboardStore, type TaskUI } from '@/store/dashboard';

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate?: string | null;
  onSuccess?: () => void;
}

export function AddTaskModal({ isOpen, onClose, defaultDate, onSuccess }: AddTaskModalProps) {
  const projects = useDashboardStore((s) => s.projects);
  const addTask = useDashboardStore((s) => s.addTask);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'urgent' | 'high' | 'medium' | 'low'>('medium');
  const [dueDate, setDueDate] = useState<string>(defaultDate ?? '');
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | ''>(30);
  const [projectId, setProjectId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Task title is required.');
      return;
    }

    setError(null);
    setBusy(true);

    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        priority,
        status: 'todo',
      };
      if (description.trim()) payload['description'] = description.trim();
      if (dueDate) payload['dueDate'] = dueDate.includes('T') ? dueDate : `${dueDate}T12:00:00Z`;
      if (typeof estimatedMinutes === 'number' && estimatedMinutes > 0) {
        payload['estimatedMinutes'] = estimatedMinutes;
      }
      if (projectId) payload['projectId'] = projectId;

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? 'Failed to create task.');
        return;
      }

      const data = (await res.json()) as { task: TaskUI };
      addTask(data.task);

      // Reset form
      setTitle('');
      setDescription('');
      setPriority('medium');
      setError(null);

      onSuccess?.();
      onClose();
    } catch {
      setError('Network error. Could not create task.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-task-title"
      onClick={onClose}
    >
      <div
        className="glass bg-navy-900/95 relative w-full max-w-lg rounded-2xl border border-white/10 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-white/8 mb-5 flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
              <Plus className="h-4 w-4" />
            </div>
            <div>
              <h2 id="add-task-title" className="text-base font-semibold text-white">
                Create New Task
              </h2>
              <p className="text-xs text-slate-400">Add an action item to your workspace</p>
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
          {/* Title */}
          <div>
            <label
              htmlFor="task-title-input"
              className="mb-1 block text-xs font-medium text-slate-300"
            >
              Title <span className="text-red-400">*</span>
            </label>
            <input
              id="task-title-input"
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Review launch metrics & slides"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="task-desc-input"
              className="mb-1 block text-xs font-medium text-slate-300"
            >
              Notes (Optional)
            </label>
            <textarea
              id="task-desc-input"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add extra context or requirements..."
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Priority selector */}
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

          {/* Due date & Estimated duration */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="task-date-input"
                className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-300"
              >
                <Calendar className="h-3.5 w-3.5 text-blue-400" />
                Due Date
              </label>
              <input
                id="task-date-input"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white [color-scheme:dark] placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="task-duration-input"
                className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-300"
              >
                <Clock className="h-3.5 w-3.5 text-purple-400" />
                Duration (min)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id="task-duration-input"
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

          {/* Project selector */}
          {projects.length > 0 && (
            <div>
              <label
                htmlFor="task-project-select"
                className="mb-1 block text-xs font-medium text-slate-300"
              >
                Project (Optional)
              </label>
              <select
                id="task-project-select"
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

          {/* Actions */}
          <div className="border-white/8 mt-6 flex items-center justify-end gap-2.5 border-t pt-4">
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
                  <Sparkles className="h-3.5 w-3.5" />
                  Add Task
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

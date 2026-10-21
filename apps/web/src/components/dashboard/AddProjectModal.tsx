'use client';

import { useState } from 'react';
import { X, FolderPlus, Loader2, Sparkles } from 'lucide-react';
import { useDashboardStore, type ProjectUI } from '@/store/dashboard';

interface AddProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const COLOR_PRESETS = [
  { label: 'Blue', hex: '#3B82F6' },
  { label: 'Violet', hex: '#8B5CF6' },
  { label: 'Emerald', hex: '#10B981' },
  { label: 'Amber', hex: '#F59E0B' },
  { label: 'Rose', hex: '#EC4899' },
  { label: 'Cyan', hex: '#06B6D4' },
];

export function AddProjectModal({ isOpen, onClose, onSuccess }: AddProjectModalProps) {
  const addProject = useDashboardStore((s) => s.addProject);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }

    setError(null);
    setBusy(true);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color,
          status: 'active',
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? 'Failed to create project.');
        return;
      }

      const data = (await res.json()) as { project: ProjectUI };
      addProject(data.project);

      setName('');
      setDescription('');
      setError(null);

      onSuccess?.();
      onClose();
    } catch {
      setError('Network error. Could not create project.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-project-title"
      onClick={onClose}
    >
      <div
        className="glass relative w-full max-w-md rounded-2xl border border-white/10 bg-navy-900/95 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between border-b border-white/8 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
              <FolderPlus className="h-4 w-4" />
            </div>
            <div>
              <h2 id="add-project-title" className="text-base font-semibold text-white">
                New Project
              </h2>
              <p className="text-xs text-slate-400">Organize your tasks and events together</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
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
            <label htmlFor="project-name-input" className="mb-1 block text-xs font-medium text-slate-300">
              Project Name <span className="text-red-400">*</span>
            </label>
            <input
              id="project-name-input"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alexa Developer Hackathon"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="project-desc-input" className="mb-1 block text-xs font-medium text-slate-300">
              Description (Optional)
            </label>
            <textarea
              id="project-desc-input"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Key objectives, scope, or deadlines..."
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">Color Theme</label>
            <div className="flex items-center gap-3">
              {COLOR_PRESETS.map((p) => (
                <button
                  key={p.hex}
                  type="button"
                  onClick={() => setColor(p.hex)}
                  className={`h-7 w-7 rounded-full transition-transform ${
                    color === p.hex ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-navy-950' : 'hover:scale-110 opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: p.hex }}
                  aria-label={p.label}
                  title={p.label}
                />
              ))}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-white/8 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-glow hover:bg-emerald-500 transition-all disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Create Project
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

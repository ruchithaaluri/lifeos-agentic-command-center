'use client';

import { useState } from 'react';
import { X, Calendar as CalendarIcon, MapPin, Loader2, Plus } from 'lucide-react';
import { useDashboardStore, type EventUI } from '@/store/dashboard';

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate?: string | null;
  onSuccess?: () => void;
}

export function AddEventModal({ isOpen, onClose, defaultDate, onSuccess }: AddEventModalProps) {
  const addEvent = useDashboardStore((s) => s.addEvent);

  const todayStr = defaultDate || new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayStr);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [type, setType] = useState<string>('meeting');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Event title is required.');
      return;
    }

    setError(null);
    setBusy(true);

    try {
      const startIso = new Date(`${date}T${startTime}:00`).toISOString();
      const endIso = new Date(`${date}T${endTime}:00`).toISOString();

      if (new Date(endIso) <= new Date(startIso)) {
        setError('End time must be after start time.');
        setBusy(false);
        return;
      }

      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          start: startIso,
          end: endIso,
          type,
          location: location.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? 'Failed to create event.');
        return;
      }

      const data = (await res.json()) as { event: EventUI };
      addEvent(data.event);

      setTitle('');
      setLocation('');
      setError(null);

      onSuccess?.();
      onClose();
    } catch {
      setError('Could not reach the server to save the event.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-event-title"
      onClick={onClose}
    >
      <div
        className="glass relative w-full max-w-lg rounded-2xl border border-white/10 bg-navy-900/95 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between border-b border-white/8 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/20 text-violet-400">
              <CalendarIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 id="add-event-title" className="text-base font-semibold text-white">
                New Calendar Event
              </h2>
              <p className="text-xs text-slate-400">Schedule a meeting, focus block, or activity</p>
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
            <label htmlFor="event-title-input" className="mb-1 block text-xs font-medium text-slate-300">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              id="event-title-input"
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Design review with engineering"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="event-date-input" className="mb-1 block text-xs font-medium text-slate-300">Date</label>
              <input
                id="event-date-input"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:border-violet-500 focus:outline-none [color-scheme:dark]"
              />
            </div>
            <div>
              <label htmlFor="event-start-input" className="mb-1 block text-xs font-medium text-slate-300">Start Time</label>
              <input
                id="event-start-input"
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:border-violet-500 focus:outline-none [color-scheme:dark]"
              />
            </div>
            <div>
              <label htmlFor="event-end-input" className="mb-1 block text-xs font-medium text-slate-300">End Time</label>
              <input
                id="event-end-input"
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:border-violet-500 focus:outline-none [color-scheme:dark]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">Event Type</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'meeting', label: 'Meeting' },
                { id: 'focus', label: 'Deep Focus' },
                { id: 'break', label: 'Break' },
                { id: 'deadline', label: 'Deadline' },
                { id: 'reminder', label: 'Reminder' },
                { id: 'personal', label: 'Personal' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-all ${
                    type === t.id
                      ? 'border-violet-500/50 bg-violet-500/20 text-violet-300 font-semibold'
                      : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="event-loc-input" className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-300">
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              Location / Link (Optional)
            </label>
            <input
              id="event-loc-input"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Zoom / Conference Room B"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
            />
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
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-glow hover:bg-violet-500 transition-all disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Save Event
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

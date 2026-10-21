'use client';

import { useState } from 'react';
import { X, Clock, MapPin, Loader2, Check, Trash2 } from 'lucide-react';
import { useDashboardStore, type EventUI } from '@/store/dashboard';

interface EditEventModalProps {
  event: EventUI | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EditEventModal({ event, isOpen, onClose, onSuccess }: EditEventModalProps) {
  const updateEvent = useDashboardStore((s) => s.updateEvent);
  const removeEvent = useDashboardStore((s) => s.removeEvent);
  const timezone = useDashboardStore((s) => s.timezone);

  // Derive initial values from the event in user's timezone or UTC
  const startDate = event ? new Date(event.start) : new Date();
  const endDate = event ? new Date(event.end) : new Date();

  // Helper to extract YYYY-MM-DD in local/timezone representation
  function getLocalDateStr(d: Date): string {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }

  // Helper to extract HH:MM in 24h format
  function getLocalTimeStr(d: Date): string {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(d);
      const h = parts.find((p) => p.type === 'hour')?.value.padStart(2, '0') ?? '09';
      const m = parts.find((p) => p.type === 'minute')?.value.padStart(2, '0') ?? '00';
      return `${h}:${m}`;
    } catch {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
  }

  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState(getLocalDateStr(startDate));
  const [startTime, setStartTime] = useState(getLocalTimeStr(startDate));
  const [endTime, setEndTime] = useState(getLocalTimeStr(endDate));
  const [type, setType] = useState(event?.type ?? 'meeting');
  const [location, setLocation] = useState(event?.location ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !event) return null;

  function shiftTimeMinutes(deltaMinutes: number) {
    try {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      if (sh === undefined || sm === undefined || eh === undefined || em === undefined) return;

      const startTotal = (sh * 60 + sm + deltaMinutes + 1440) % 1440;
      const endTotal = (eh * 60 + em + deltaMinutes + 1440) % 1440;

      const newSh = String(Math.floor(startTotal / 60)).padStart(2, '0');
      const newSm = String(startTotal % 60).padStart(2, '0');
      const newEh = String(Math.floor(endTotal / 60)).padStart(2, '0');
      const newEm = String(endTotal % 60).padStart(2, '0');

      setStartTime(`${newSh}:${newSm}`);
      setEndTime(`${newEh}:${newEm}`);
    } catch {
      // ignore
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!event) return;
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
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: event.id,
          title: title.trim(),
          start: startIso,
          end: endIso,
          type,
          location: location.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? 'Failed to update event.');
        return;
      }

      const data = (await res.json()) as { event: EventUI };
      updateEvent(event.id, data.event);

      onSuccess?.();
      onClose();
    } catch {
      setError('Could not reach the server to update the event.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!event) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/events?id=${encodeURIComponent(event.id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        removeEvent(event.id);
        onSuccess?.();
        onClose();
      }
    } catch {
      setError('Failed to delete event.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-event-title"
      onClick={onClose}
    >
      <div
        className="glass bg-navy-900/95 relative w-full max-w-lg rounded-2xl border border-white/10 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-white/8 mb-5 flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/20 text-violet-400">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <h2 id="edit-event-title" className="text-base font-semibold text-white">
                Edit Event & Change Time
              </h2>
              <p className="text-xs text-slate-400">Reschedule or update event timing</p>
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

        {/* Quick Shift Bar */}
        <div className="border-white/8 mb-4 rounded-xl border bg-white/[0.02] p-3">
          <p className="text-[11px] font-medium text-slate-400">Quick Time Shift:</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              { label: '-1 Hour', delta: -60 },
              { label: '-30 Mins', delta: -30 },
              { label: '+30 Mins', delta: 30 },
              { label: '+1 Hour', delta: 60 },
              { label: '+2 Hours', delta: 120 },
            ].map((shift) => (
              <button
                key={shift.label}
                type="button"
                onClick={() => shiftTimeMinutes(shift.delta)}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-violet-500/40 hover:bg-violet-500/15 hover:text-violet-200"
              >
                {shift.label}
              </button>
            ))}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="edit-event-title-input"
              className="mb-1 block text-xs font-medium text-slate-300"
            >
              Title <span className="text-red-400">*</span>
            </label>
            <input
              id="edit-event-title-input"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor="edit-event-date-input"
                className="mb-1 block text-xs font-medium text-slate-300"
              >
                Date
              </label>
              <input
                id="edit-event-date-input"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white [color-scheme:dark] focus:border-violet-500 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="edit-event-start-input"
                className="mb-1 block text-xs font-medium text-slate-300"
              >
                Start Time
              </label>
              <input
                id="edit-event-start-input"
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white [color-scheme:dark] focus:border-violet-500 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="edit-event-end-input"
                className="mb-1 block text-xs font-medium text-slate-300"
              >
                End Time
              </label>
              <input
                id="edit-event-end-input"
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white [color-scheme:dark] focus:border-violet-500 focus:outline-none"
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
                      ? 'border-violet-500/50 bg-violet-500/20 font-semibold text-violet-300'
                      : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="edit-event-loc-input"
              className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-300"
            >
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              Location / Link (Optional)
            </label>
            <input
              id="edit-event-loc-input"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Zoom / Office"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

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
              Delete Event
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
                className="shadow-glow flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-violet-500 disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Save Changes
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

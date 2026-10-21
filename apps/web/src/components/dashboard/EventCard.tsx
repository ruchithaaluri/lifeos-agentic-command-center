'use client';

import { useState } from 'react';
import { MapPin, Clock, Edit2 } from 'lucide-react';
import { cn, formatTime, durationLabel, EVENT_TYPE_COLORS } from '@/lib/utils';
import type { EventUI } from '@/store/dashboard';
import { useDashboardStore } from '@/store/dashboard';
import { EditEventModal } from '@/components/dashboard/EditEventModal';

interface EventCardProps {
  event: EventUI;
  className?: string;
  onRefresh?: () => void;
}

export function EventCard({ event, className, onRefresh }: EventCardProps) {
  const [showEdit, setShowEdit] = useState(false);
  const timezone = useDashboardStore((s) => s.timezone);
  const durationMins = Math.round(
    (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000,
  );
  const isPast = new Date(event.end) < new Date();

  return (
    <>
      <div
        className={cn(
          'group border-white/8 relative flex items-start gap-3 rounded-lg border p-3 transition-all hover:border-white/20 hover:bg-white/[0.03]',
          isPast && 'opacity-50',
          className,
        )}
      >
        {/* Time block */}
        <div className="shrink-0 text-right">
          <div className="text-xs font-semibold text-slate-200">{formatTime(event.start, timezone)}</div>
          <div className="text-xs text-slate-500">{formatTime(event.end, timezone)}</div>
        </div>

        {/* Divider */}
        <div className="mt-1 w-px self-stretch bg-white/10" />

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-snug text-slate-100">{event.title}</p>
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              className="rounded p-1 text-slate-500 opacity-0 transition-opacity hover:bg-white/10 hover:text-violet-300 group-hover:opacity-100 focus:opacity-100"
              aria-label="Edit event time"
              title="Edit event time"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                EVENT_TYPE_COLORS[event.type] ?? 'bg-slate-500/20 text-slate-400',
              )}
            >
              {event.type}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Clock className="h-3 w-3" />
              {durationLabel(durationMins)}
            </span>
            {event.location && (
              <span className="flex items-center gap-1 text-xs text-slate-600">
                <MapPin className="h-3 w-3" />
                {event.location}
              </span>
            )}
          </div>
        </div>
      </div>

      <EditEventModal
        event={event}
        isOpen={showEdit}
        onClose={() => setShowEdit(false)}
        onSuccess={() => {
          onRefresh?.();
        }}
      />
    </>
  );
}

'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Calendar } from 'lucide-react';
import { cn, formatTime, durationLabel } from '@/lib/utils';
import { useAgentStore } from '@/store/agent';
import { useDashboardStore } from '@/store/dashboard';
import type { PlanItem } from '@lifeos/shared';
import { Badge } from '@/components/ui/badge';

const PRIORITY_BADGE: Record<string, 'urgent' | 'high' | 'medium' | 'low'> = {
  urgent: 'urgent',
  high: 'high',
  medium: 'medium',
  low: 'low',
};

function PlanItemRow({
  item,
  index,
  timezone,
}: {
  item: PlanItem;
  index: number;
  timezone?: string;
}) {
  const isEvent = item.type === 'event';
  const isBreak = item.type === 'break';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
      className={cn('flex gap-4 py-3', isBreak && 'opacity-60')}
    >
      {/* Time column */}
      <div className="w-16 shrink-0 text-right">
        <span className="text-xs font-medium text-slate-400">
          {formatTime(item.startTime, timezone)}
        </span>
      </div>

      {/* Timeline line */}
      <div className="relative flex flex-col items-center">
        <div
          className={cn(
            'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
            item.status === 'completed'
              ? 'bg-emerald-400'
              : isEvent
                ? 'bg-blue-400'
                : item.priority === 'urgent'
                  ? 'bg-red-400'
                  : item.priority === 'high'
                    ? 'bg-orange-400'
                    : 'bg-violet-400',
          )}
        />
        <div className="mt-1 w-px flex-1 bg-white/5" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'text-sm font-medium',
              item.status === 'completed' ? 'text-slate-500 line-through' : 'text-slate-100',
            )}
          >
            {item.title}
          </span>
          {item.priority && !isEvent && !isBreak && (
            <Badge variant={PRIORITY_BADGE[item.priority] ?? 'medium'}>{item.priority}</Badge>
          )}
          {isEvent && (
            <Badge variant="muted">
              <Calendar className="mr-1 h-3 w-3" />
              event
            </Badge>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3">
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Clock className="h-3 w-3" />
            {durationLabel(item.durationMinutes)}
          </span>
          {item.reason && <span className="text-xs text-slate-600">{item.reason}</span>}
        </div>
      </div>
    </motion.div>
  );
}

interface PlanViewProps {
  className?: string;
}

export function PlanView({ className }: PlanViewProps) {
  const currentPlan = useAgentStore((s) => s.currentPlan);
  const timezone = useDashboardStore((s) => s.timezone);

  if (!currentPlan) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn('glass overflow-hidden rounded-xl', className)}
      >
        {/* Header */}
        <div className="border-white/8 flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Your Plan</h3>
            <p className="mt-0.5 text-xs text-slate-500">{currentPlan.goal}</p>
          </div>
          <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-300">
            {currentPlan.items.length} blocks
          </span>
        </div>

        {/* Summary */}
        {currentPlan.summary && (
          <div className="bg-white/2 border-b border-white/5 px-4 py-2">
            <p className="text-xs text-slate-400">{currentPlan.summary}</p>
          </div>
        )}

        {/* Timeline */}
        <div className="px-4 py-2">
          {currentPlan.items.map((item, i) => (
            <PlanItemRow key={item.id} item={item} index={i} timezone={timezone} />
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

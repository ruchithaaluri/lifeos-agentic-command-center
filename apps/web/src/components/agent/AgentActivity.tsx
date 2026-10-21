'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Loader2, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentStore } from '@/store/agent';
import type { AgentActionUI } from '@/store/agent';

const TOOL_LABELS: Record<string, string> = {
  get_tasks: 'Retrieving tasks',
  create_task: 'Creating task',
  update_task: 'Updating task',
  delete_task: 'Deleting task',
  get_schedule: 'Checking calendar',
  create_event: 'Creating event',
  move_event: 'Rescheduling event',
  get_projects: 'Loading projects',
  search_context: 'Searching context',
  analyze_day: 'Analyzing your day',
  generate_plan: 'Generating plan',
  execute_plan: 'Executing actions',
  parse_intent: 'Understanding request',
};

function ActionRow({ action }: { action: AgentActionUI }) {
  const label = TOOL_LABELS[action.tool] ?? action.tool;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      className="flex items-start gap-3 py-2"
    >
      {/* Status icon */}
      <div className="mt-0.5 shrink-0">
        {action.status === 'running' && (
          <Loader2 className="h-4 w-4 animate-spin text-blue-400" aria-label="Running" />
        )}
        {action.status === 'success' && (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-label="Success" />
        )}
        {action.status === 'failed' && (
          <XCircle className="h-4 w-4 text-red-400" aria-label="Failed" />
        )}
        {action.status === 'pending' && (
          <Clock className="h-4 w-4 text-slate-500" aria-label="Pending" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'text-xs font-medium',
              action.status === 'success' && 'text-slate-300',
              action.status === 'running' && 'text-blue-300',
              action.status === 'failed' && 'text-red-300',
              action.status === 'pending' && 'text-slate-500',
            )}
          >
            {action.message || label}
          </span>
          {action.latencyMs && (
            <span className="shrink-0 text-xs text-slate-600">{action.latencyMs}ms</span>
          )}
        </div>
        <span className="text-xs text-slate-600">{label}</span>
      </div>
    </motion.div>
  );
}

interface AgentActivityProps {
  className?: string;
  maxItems?: number;
}

export function AgentActivity({ className, maxItems = 12 }: AgentActivityProps) {
  const { actions, isRunning, goal, lastSummary, error } = useAgentStore();

  if (!actions.length && !isRunning && !lastSummary && !error) return null;

  const displayed = actions.slice(-maxItems);

  return (
    <div className={cn('glass overflow-hidden rounded-xl', className)}>
      {/* Header */}
      <div className="border-white/8 flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Zap
            className={cn('h-4 w-4', isRunning ? 'animate-pulse text-blue-400' : 'text-slate-500')}
          />
          <span className="text-sm font-medium text-slate-200">AI Agent</span>
          {isRunning && (
            <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300">
              Active
            </span>
          )}
        </div>
        {actions.length > 0 && (
          <span className="text-xs text-slate-600">
            {actions.length} action{actions.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Goal */}
      {goal && (
        <div className="border-b border-white/5 bg-blue-500/5 px-4 py-2">
          <p className="text-xs text-slate-400">
            <span className="text-blue-400">Goal: </span>
            {goal}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="divide-y divide-white/5 px-4">
        <AnimatePresence initial={false}>
          {displayed.map((action) => (
            <ActionRow key={action.id} action={action} />
          ))}
        </AnimatePresence>

        {isRunning && !actions.length && (
          <div className="flex items-center gap-3 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
            <span className="text-xs text-slate-400">Starting agent…</span>
          </div>
        )}
      </div>

      {/* Summary */}
      {lastSummary && !isRunning && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-t border-emerald-500/20 bg-emerald-500/5 px-4 py-3"
        >
          <p className="text-xs text-emerald-300">{lastSummary}</p>
        </motion.div>
      )}

      {/* Error */}
      {error && (
        <div className="border-t border-red-500/20 bg-red-500/5 px-4 py-3">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}
    </div>
  );
}

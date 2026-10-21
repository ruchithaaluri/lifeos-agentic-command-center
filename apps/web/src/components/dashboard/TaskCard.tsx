'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Calendar, AlertCircle, Check, Trash2, Loader2, Edit2 } from 'lucide-react';
import { cn, formatRelative, durationLabel, PRIORITY_COLORS } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useDashboardStore, type TaskUI } from '@/store/dashboard';
import { EditTaskModal } from '@/components/dashboard/EditTaskModal';

interface TaskCardProps {
  task: TaskUI;
  projectColor?: string;
  className?: string;
  onRefresh?: () => void;
}

export function TaskCard({ task, className, onRefresh }: TaskCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const updateTask = useDashboardStore((s) => s.updateTask);
  const removeTask = useDashboardStore((s) => s.removeTask);

  const isCompleted = task.status === 'completed';
  const isOverdue =
    task.dueDate && new Date(task.dueDate) < new Date() && !isCompleted;

  async function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (isUpdating) return;
    setIsUpdating(true);

    const nextStatus = isCompleted ? 'todo' : 'completed';
    // Optimistic update
    updateTask(task.id, { status: nextStatus });

    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: nextStatus }),
      });
      if (!res.ok) {
        // Rollback
        updateTask(task.id, { status: task.status });
      } else {
        onRefresh?.();
      }
    } catch {
      updateTask(task.id, { status: task.status });
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (isUpdating) return;
    setIsUpdating(true);

    // Optimistic remove
    removeTask(task.id);

    try {
      const res = await fetch(`/api/tasks?id=${encodeURIComponent(task.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        // If failed, reload
        onRefresh?.();
      }
    } catch {
      onRefresh?.();
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'group flex items-start gap-3 rounded-xl border p-3 transition-all duration-150',
        isCompleted ? 'bg-white/2 border-white/5 opacity-65' : 'glass glass-hover',
        isOverdue && 'border-red-500/20',
        className,
      )}
    >
      {/* Checkbox toggle */}
      <button
        type="button"
        onClick={(e) => {
          void handleToggle(e);
        }}
        disabled={isUpdating}
        className={cn(
          'mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          isCompleted
            ? 'border-emerald-500/80 bg-emerald-500/20 text-emerald-400'
            : 'border-white/20 bg-white/5 hover:border-blue-400/60 hover:bg-white/10',
        )}
        aria-label={isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
        title={isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
      >
        {isUpdating ? (
          <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
        ) : isCompleted ? (
          <Check className="h-3 w-3 stroke-[3]" />
        ) : null}
      </button>

      {/* Priority stripe */}
      <div
        className={cn('mt-0.5 h-full w-0.5 shrink-0 rounded-full', PRIORITY_COLORS[task.priority])}
        style={{
          backgroundColor:
            task.priority === 'urgent'
              ? '#ef4444'
              : task.priority === 'high'
                ? '#f97316'
                : task.priority === 'medium'
                  ? '#eab308'
                  : '#4b5563',
          width: '3px',
          minHeight: '32px',
        }}
        aria-hidden
      />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm font-medium leading-snug transition-all',
            isCompleted ? 'text-slate-500 line-through' : 'text-slate-100',
          )}
        >
          {task.title}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {task.dueDate && (
            <span
              className={cn(
                'flex items-center gap-1 text-xs',
                isOverdue ? 'text-red-400' : 'text-slate-500',
              )}
            >
              {isOverdue ? <AlertCircle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
              {formatRelative(task.dueDate)}
            </span>
          )}
          {task.estimatedMinutes && (
            <span className="flex items-center gap-1 text-xs text-slate-600">
              <Clock className="h-3 w-3" />
              {durationLabel(task.estimatedMinutes)}
            </span>
          )}
        </div>
      </div>

      {/* Priority badge & actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        <Badge variant={task.priority as 'urgent' | 'high' | 'medium' | 'low'} className="text-xs">
          {task.priority}
        </Badge>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowEdit(true);
          }}
          disabled={isUpdating}
          className="rounded p-1 text-slate-500 opacity-0 transition-opacity hover:bg-white/10 hover:text-blue-300 group-hover:opacity-100 focus:opacity-100"
          aria-label="Edit task"
          title="Edit task"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={(e) => {
            void handleDelete(e);
          }}
          disabled={isUpdating}
          className="rounded p-1 text-slate-500 opacity-0 transition-opacity hover:bg-white/10 hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
          aria-label="Delete task"
          title="Delete task"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <EditTaskModal
        task={task}
        isOpen={showEdit}
        onClose={() => setShowEdit(false)}
        onSuccess={() => {
          onRefresh?.();
        }}
      />
    </motion.div>
  );
}

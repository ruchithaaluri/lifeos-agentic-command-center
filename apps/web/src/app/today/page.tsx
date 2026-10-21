'use client';

import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Plus,
  CheckCircle2,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { TaskCard } from '@/components/dashboard/TaskCard';
import { EventCard } from '@/components/dashboard/EventCard';
import { AddTaskModal } from '@/components/dashboard/AddTaskModal';
import { AddEventModal } from '@/components/dashboard/AddEventModal';
import { useDashboardData } from '@/hooks/useDashboardData';
import { AgentInput } from '@/components/agent/AgentInput';
import { useAgent } from '@/hooks/useAgent';
import { formatDate } from '@/lib/utils';

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function getTodayInTimezone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default function TodayPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);

  const { tasks, events, timezone, isLoading, refresh } = useDashboardData(
    selectedDate ?? undefined,
  );
  const { submit } = useAgent();

  const todayStr = getTodayInTimezone(timezone || 'America/Los_Angeles');
  const currentDateStr = selectedDate ?? todayStr;
  const displayDate = new Date(currentDateStr + 'T12:00:00Z');
  const isToday = currentDateStr === todayStr;

  const openTasks = tasks.filter((t) => t.status !== 'completed');
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const totalTasks = tasks.length;
  const progress = totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0;

  return (
    <AppShell>
      <div className="p-6">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-blue-400" aria-hidden />
              <h1 className="text-2xl font-bold text-white">
                {isToday ? 'Today' : 'Daily Schedule'}
              </h1>
            </div>
            <p className="mt-1 text-sm text-slate-400">{formatDate(displayDate, timezone)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedDate(shiftDate(currentDateStr, -1))}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:border-white/20 hover:text-white"
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Prev</span>
            </button>
            {!isToday && (
              <button
                onClick={() => setSelectedDate(null)}
                className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/20"
              >
                Today
              </button>
            )}
            <button
              onClick={() => setSelectedDate(shiftDate(currentDateStr, 1))}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:border-white/20 hover:text-white"
              aria-label="Next day"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Progress bar */}
        <div className="glass mb-8 rounded-xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-300">Daily Completion Progress</span>
            <span className="text-sm font-bold text-white">{progress}%</span>
          </div>
          <div
            className="h-2 w-full rounded-full bg-white/10"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {completedTasks.length} of {totalTasks} tasks completed
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Tasks Column */}
          <section aria-labelledby="open-tasks-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="open-tasks-heading" className="text-sm font-semibold text-slate-300">
                Tasks <span className="font-normal text-slate-500">({openTasks.length} open)</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowAddTask(true)}
                className="flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-300 transition-all hover:bg-blue-500/20"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Task</span>
              </button>
            </div>

            <div className="space-y-2">
              {openTasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onRefresh={() => {
                    void refresh();
                  }}
                />
              ))}
              {openTasks.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-slate-500">
                  <p className="text-sm">All open tasks completed! 🎉</p>
                  <button
                    onClick={() => setShowAddTask(true)}
                    className="mt-2 text-xs text-blue-400 underline-offset-4 hover:underline"
                  >
                    + Add a new task
                  </button>
                </div>
              )}
            </div>

            {completedTasks.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  Completed ({completedTasks.length})
                </h3>
                <div className="space-y-2 opacity-70">
                  {completedTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onRefresh={() => {
                        void refresh();
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Schedule Column */}
          <section aria-labelledby="schedule-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="schedule-heading" className="text-sm font-semibold text-slate-300">
                Schedule <span className="font-normal text-slate-500">({events.length})</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowAddEvent(true)}
                className="flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-300 transition-all hover:bg-violet-500/20"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Event</span>
              </button>
            </div>

            <div className="space-y-2">
              {events.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
              {events.length === 0 && !isLoading && (
                <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-slate-500">
                  <p className="text-sm">No scheduled events on this day.</p>
                  <button
                    onClick={() => setShowAddEvent(true)}
                    className="mt-2 text-xs text-violet-400 underline-offset-4 hover:underline"
                  >
                    + Schedule an event
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* AI Agent prompt */}
        <div className="mt-8">
          <AgentInput
            onSubmit={(g) => void submit(g)}
            placeholder="Ask LifeOS to plan your day, schedule tasks, or reorganize events…"
          />
        </div>
      </div>

      {/* Modals */}
      <AddTaskModal
        isOpen={showAddTask}
        onClose={() => setShowAddTask(false)}
        defaultDate={currentDateStr}
        onSuccess={() => {
          void refresh();
        }}
      />
      <AddEventModal
        isOpen={showAddEvent}
        onClose={() => setShowAddEvent(false)}
        defaultDate={currentDateStr}
        onSuccess={() => {
          void refresh();
        }}
      />
    </AppShell>
  );
}

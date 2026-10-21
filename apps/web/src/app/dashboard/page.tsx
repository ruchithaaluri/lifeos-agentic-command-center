'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, Sparkles, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { AgentInput } from '@/components/agent/AgentInput';
import { AgentActivity } from '@/components/agent/AgentActivity';
import { PlanView } from '@/components/agent/PlanView';
import { TaskCard } from '@/components/dashboard/TaskCard';
import { EventCard } from '@/components/dashboard/EventCard';
import { ProjectCard } from '@/components/dashboard/ProjectCard';
import { AddTaskModal } from '@/components/dashboard/AddTaskModal';
import { AddEventModal } from '@/components/dashboard/AddEventModal';
import { useSession } from 'next-auth/react';
import { useAgent } from '@/hooks/useAgent';
import { useDashboardData } from '@/hooks/useDashboardData';
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

export default function DashboardPage() {
  const { data: sessionData } = useSession();
  const userName = sessionData?.user?.name ? sessionData.user.name.split(' ')[0] : 'Alex';
  const { submit, reset } = useAgent();
  const [scheduleDate, setScheduleDate] = useState<string | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);

  const { tasks, events, projects, timezone, isLoading, refresh } = useDashboardData(
    scheduleDate ?? undefined,
  );

  const todayStr = getTodayInTimezone(timezone || 'America/Los_Angeles');
  const currentDateStr = scheduleDate ?? todayStr;
  const displayDate = new Date(currentDateStr + 'T12:00:00Z');
  const isToday = currentDateStr === todayStr;

  const today = new Date();
  const greeting =
    today.getHours() < 12
      ? 'Good morning'
      : today.getHours() < 17
        ? 'Good afternoon'
        : 'Good evening';

  const urgentTasks = tasks.filter((t) => t.priority === 'urgent' && t.status !== 'completed');
  const todayTasks = tasks.filter((t) => t.status !== 'completed').slice(0, 8);

  return (
    <AppShell>
      <div className="min-h-screen p-6">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-start justify-between"
        >
          <div>
            <p className="text-sm text-slate-500">{formatDate(today, timezone)}</p>
            <h1 className="mt-1 text-2xl font-bold text-white">
              {greeting}, {userName}.
            </h1>
            <p className="mt-1 text-sm text-slate-400">Here&apos;s what matters today.</p>
          </div>
          <button
            onClick={() => void reset()}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400 transition-colors hover:border-red-500/30 hover:text-red-400"
            aria-label="Reset demo data"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reset Demo
          </button>
        </motion.header>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column — tasks + events */}
          <div className="space-y-6 lg:col-span-2">
            {/* Urgent tasks */}
            {urgentTasks.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                aria-labelledby="urgent-heading"
              >
                <h2
                  id="urgent-heading"
                  className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-400"
                >
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" aria-hidden />
                  Urgent Attention
                  <span className="ml-auto text-xs font-normal text-slate-600">
                    {urgentTasks.length}
                  </span>
                </h2>
                <div className="space-y-2">
                  {urgentTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onRefresh={() => {
                        void refresh();
                      }}
                    />
                  ))}
                </div>
              </motion.section>
            )}

            {/* Today's tasks */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              aria-labelledby="tasks-heading"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2
                  id="tasks-heading"
                  className="flex items-center gap-2 text-sm font-semibold text-slate-300"
                >
                  Tasks
                  <span className="text-xs font-normal text-slate-600">
                    {tasks.filter((t) => t.status !== 'completed').length} open
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAddTask(true)}
                  className="flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/20"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Task</span>
                </button>
              </div>

              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {todayTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onRefresh={() => {
                        void refresh();
                      }}
                    />
                  ))}
                  {todayTasks.length === 0 && (
                    <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-slate-500">
                      <p className="text-sm">No open tasks right now.</p>
                      <button
                        onClick={() => setShowAddTask(true)}
                        className="mt-2 text-xs text-blue-400 underline-offset-4 hover:underline"
                      >
                        + Create a task
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.section>

            {/* Today's schedule */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              aria-labelledby="schedule-heading"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2
                  id="schedule-heading"
                  className="flex items-center gap-2 text-sm font-semibold text-slate-300"
                >
                  {isToday ? "Today's Schedule" : `Schedule (${formatDate(displayDate, timezone)})`}
                  <span className="text-xs font-normal text-slate-600">{events.length} events</span>
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddEvent(true)}
                    className="flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-300 transition-colors hover:bg-violet-500/20"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Event</span>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setScheduleDate(shiftDate(currentDateStr, -1))}
                      className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                      aria-label="Previous day"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    {!isToday && (
                      <button
                        onClick={() => setScheduleDate(null)}
                        className="px-1.5 py-0.5 text-xs text-blue-400 hover:underline"
                      >
                        Today
                      </button>
                    )}
                    <button
                      onClick={() => setScheduleDate(shiftDate(currentDateStr, 1))}
                      className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                      aria-label="Next day"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {events.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
                {events.length === 0 && !isLoading && (
                  <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-slate-500">
                    <p className="text-sm">No events {isToday ? 'today' : 'on this day'}.</p>
                    <button
                      onClick={() => setShowAddEvent(true)}
                      className="mt-2 text-xs text-violet-400 underline-offset-4 hover:underline"
                    >
                      + Schedule an event
                    </button>
                  </div>
                )}
              </div>
            </motion.section>
          </div>

          {/* Right column — agent + projects */}
          <div className="space-y-6">
            {/* Ask LifeOS */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              aria-labelledby="agent-heading"
            >
              <h2
                id="agent-heading"
                className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300"
              >
                <Sparkles className="h-4 w-4 text-blue-400" aria-hidden />
                Ask LifeOS
              </h2>
              <AgentInput onSubmit={(g) => void submit(g)} showPrompts />
            </motion.section>

            {/* Agent activity */}
            <AgentActivity />

            {/* Plan view */}
            <PlanView />

            {/* Projects */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              aria-labelledby="projects-heading"
            >
              <h2 id="projects-heading" className="mb-3 text-sm font-semibold text-slate-300">
                Projects
              </h2>
              <div className="space-y-3">
                {projects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            </motion.section>
          </div>
        </div>
      </div>

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

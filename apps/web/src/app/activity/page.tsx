'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { useAgentStore } from '@/store/agent';
import { CheckCircle2, XCircle, Clock, Loader2, Sparkles, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActivitySession {
  id: string;
  goal: string;
  status: string;
  createdAt: string;
  actionsCount: number;
}

interface ActivityAction {
  id: string;
  tool: string;
  message: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  latencyMs?: number;
  timestamp: string;
}

interface ActivityApiResponse {
  sessions: ActivitySession[];
  currentSession: {
    id: string;
    goal: string;
    status: string;
    createdAt: string;
  } | null;
  actions: ActivityAction[];
}

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

function formatActionTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

export default function ActivityPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="p-6">
            <header className="mb-8">
              <h1 className="text-2xl font-bold text-white">Activity</h1>
              <p className="mt-1 text-sm text-slate-500">Agent action history for this session</p>
            </header>
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-white/5" />
              ))}
            </div>
          </div>
        </AppShell>
      }
    >
      <ActivityInner />
    </Suspense>
  );
}

function ActivityInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionIdParam = searchParams.get('sessionId');

  const {
    actions: liveActions,
    goal: liveGoal,
    isRunning,
    sessionId: liveSessionId,
    error: liveError,
  } = useAgentStore();

  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(sessionIdParam);
  const [currentSession, setCurrentSession] = useState<{
    id: string;
    goal: string;
    status: string;
    createdAt: string;
  } | null>(null);
  const [persistedActions, setPersistedActions] = useState<ActivityAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchActivity = useCallback(async (sid?: string | null) => {
    setIsLoading(true);
    try {
      const url = sid ? `/api/activity?sessionId=${encodeURIComponent(sid)}` : '/api/activity';
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as ActivityApiResponse;
        setSessions(data.sessions || []);
        setCurrentSession(data.currentSession);
        setPersistedActions(data.actions || []);
        if (data.currentSession && !sid) {
          setSelectedSessionId(data.currentSession.id);
        }
      }
    } catch (err) {
      console.error('Failed to load activity:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load or when query param changes
  useEffect(() => {
    void fetchActivity(sessionIdParam);
  }, [fetchActivity, sessionIdParam]);

  // When live agent finishes running, refetch latest persisted activity
  useEffect(() => {
    if (!isRunning) {
      void fetchActivity(selectedSessionId);
    }
  }, [isRunning, fetchActivity, selectedSessionId]);

  function handleSelectSession(sid: string) {
    setSelectedSessionId(sid);
    router.push(`/activity?sessionId=${encodeURIComponent(sid)}`);
    void fetchActivity(sid);
  }

  // If agent is currently running live in this session, show live state; otherwise show persisted records
  const isViewingLiveSession =
    (isRunning || (liveSessionId && selectedSessionId === liveSessionId)) &&
    liveActions.length > 0;
  const displayGoal = isViewingLiveSession ? liveGoal : currentSession?.goal;
  const displayActions =
    persistedActions.length > 0
      ? persistedActions
      : isViewingLiveSession
        ? liveActions
        : [];

  const sessionStatus = isViewingLiveSession && isRunning
    ? 'running'
    : currentSession?.status ?? (liveError ? 'failed' : 'completed');

  return (
    <AppShell>
      <div className="p-6">
        <header className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Activity</h1>
              <p className="mt-1 text-sm text-slate-500">Agent action history for this session</p>
            </div>

            {sessions.length > 1 && (
              <div className="flex items-center gap-2">
                <label htmlFor="session-select" className="text-xs text-slate-400">
                  Session:
                </label>
                <div className="relative">
                  <select
                    id="session-select"
                    value={selectedSessionId ?? currentSession?.id ?? ''}
                    onChange={(e) => handleSelectSession(e.target.value)}
                    className="glass cursor-pointer appearance-none rounded-lg border border-white/10 bg-slate-900/80 py-1.5 pl-3 pr-8 text-xs text-slate-200 outline-none hover:border-white/20 focus:border-blue-500/50"
                  >
                    {sessions.map((s, idx) => (
                      <option key={s.id} value={s.id} className="bg-slate-900 text-slate-200">
                        {idx === 0 ? '[Latest] ' : ''}
                        {s.goal.length > 40 ? `${s.goal.slice(0, 40)}…` : s.goal}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Goal banner */}
        {displayGoal && (
          <div className="glass mb-6 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="mb-1 text-xs text-slate-500">Goal</p>
              {currentSession?.createdAt && !isRunning && (
                <span className="text-xs text-slate-500">
                  {new Date(currentSession.createdAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  at {formatActionTime(currentSession.createdAt)}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-slate-200">{displayGoal}</p>
            {sessionStatus === 'running' && (
              <div className="mt-2 flex items-center gap-2 text-xs text-blue-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Agent running…
              </div>
            )}
            {sessionStatus === 'completed' && (
              <div className="mt-2 flex items-center gap-2 text-xs text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Completed
              </div>
            )}
            {sessionStatus === 'failed' && (
              <div className="mt-2 flex items-center gap-2 text-xs text-red-400">
                <XCircle className="h-3 w-3" />
                Failed
              </div>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && !isViewingLiveSession && displayActions.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-white/5" />
            ))}
          </div>
        ) : displayActions.length === 0 ? (
          <div className="py-16 text-center">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-slate-600" />
            <p className="text-slate-600">
              No activity yet. Ask LifeOS something on the dashboard.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {displayActions.map((action) => {
              const label = TOOL_LABELS[action.tool] ?? action.tool;
              const formattedTime = action.timestamp ? formatActionTime(action.timestamp) : '';

              return (
                <div
                  key={action.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg px-4 py-3 transition-colors',
                    action.status === 'running' ? 'bg-blue-500/5' : 'glass hover:bg-white/[0.04]',
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    {action.status === 'running' && (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    )}
                    {action.status === 'success' && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    )}
                    {action.status === 'failed' && <XCircle className="h-4 w-4 text-red-400" />}
                    {action.status === 'pending' && <Clock className="h-4 w-4 text-slate-500" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-200">{action.message || label}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{label}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
                    {action.latencyMs !== undefined && action.latencyMs !== null && (
                      <span className="font-mono text-slate-600">{action.latencyMs}ms</span>
                    )}
                    {formattedTime && <span className="font-mono">{formattedTime}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

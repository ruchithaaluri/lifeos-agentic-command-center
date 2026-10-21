'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  Send,
  Zap,
  CheckCircle2,
  Loader2,
  XCircle,
  Clock,
  ChevronRight,
  RotateCcw,
  AlertTriangle,
  Calendar,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn, formatTime, durationLabel } from '@/lib/utils';
import { useAgentStore } from '@/store/agent';
import { useAgent } from '@/hooks/useAgent';
import { useDashboardData } from '@/hooks/useDashboardData';
import { DEMO_PROMPTS } from '@/lib/demo';
import { Badge } from '@/components/ui/badge';
import type { AgentActionUI } from '@/store/agent';
import type { Plan, PlanItem } from '@lifeos/shared';

// ── Message types ──────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'running' | 'success' | 'failed';
  actionsSnapshot?: AgentActionUI[];
  planSnapshot?: Plan | null;
  error?: string | null;
}

// ── Phase indicators ───────────────────────────────────────────────────────

const PHASES = [
  { key: 'understanding', label: 'Understanding' },
  { key: 'retrieving', label: 'Retrieving Context' },
  { key: 'planning', label: 'Planning' },
  { key: 'executing', label: 'Executing' },
  { key: 'updated', label: 'Completed' },
] as const;

function getPhase(actions: AgentActionUI[], isRunning: boolean): string | null {
  if (!isRunning && !actions.length) return null;
  const last = actions[actions.length - 1];
  if (!last) return 'understanding';
  if (last.tool === 'parse_intent') return 'understanding';
  if (['get_tasks', 'get_schedule', 'get_projects', 'analyze_day'].includes(last.tool))
    return 'retrieving';
  if (last.tool === 'generate_plan') return 'planning';
  if (last.tool === 'execute_plan') return 'executing';
  if (!isRunning) return 'updated';
  return 'executing';
}

// ── Tool status icon ───────────────────────────────────────────────────────

function ToolIcon({ status }: { status: AgentActionUI['status'] }) {
  if (status === 'running') return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />;
  if (status === 'success') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
  if (status === 'failed') return <XCircle className="h-3.5 w-3.5 text-red-400" />;
  return <Clock className="h-3.5 w-3.5 text-slate-500" />;
}

// ── Plan item card ─────────────────────────────────────────────────────────

function PlanItemCard({ item, timezone }: { item: PlanItem; timezone?: string }) {
  return (
    <div className="border-white/8 flex items-start gap-3 rounded-lg border bg-white/5 p-2.5 transition-colors hover:bg-white/[0.08]">
      <div
        className={cn(
          'mt-1 h-2 w-2 shrink-0 rounded-full',
          item.priority === 'urgent'
            ? 'bg-red-400 ring-2 ring-red-400/20'
            : item.priority === 'high'
              ? 'bg-orange-400'
              : item.type === 'event'
                ? 'bg-blue-400'
                : 'bg-violet-400',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-100">{item.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] text-slate-400">
            {formatTime(item.startTime, timezone)}
          </span>
          <span className="font-mono text-[11px] text-slate-500">
            · {durationLabel(item.durationMinutes)}
          </span>
          {item.reason && (
            <span className="truncate text-[11px] italic text-slate-400">({item.reason})</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function AlexaPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { submit, reset } = useAgent();
  const { tasks, events, isLoading, timezone } = useDashboardData();
  const { sessionId, actions, isRunning, currentPlan, lastSummary, error } = useAgentStore();

  const currentPhase = getPhase(actions, isRunning);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, actions, isRunning]);

  // When session completes or errors, add assistant reply
  useEffect(() => {
    if (!isRunning && lastSummary) {
      setMessages((prev) => {
        // Prevent duplicate append
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === lastSummary) {
          return prev;
        }
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: lastSummary,
            timestamp: new Date(),
            status: 'success',
            actionsSnapshot: [...actions],
            planSnapshot: currentPlan ? (JSON.parse(JSON.stringify(currentPlan)) as Plan) : null,
          },
        ];
      });
    } else if (!isRunning && error) {
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.error === error) {
          return prev;
        }
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `I ran into an issue while processing your request.`,
            timestamp: new Date(),
            status: 'failed',
            error,
            actionsSnapshot: [...actions],
          },
        ];
      });
    }
  }, [lastSummary, error, isRunning, actions, currentPlan]);

  function handleSubmit(text?: string) {
    const goal = (text ?? input).trim();
    if (!goal || isRunning) return;
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content: goal, timestamp: new Date() },
    ]);
    setInput('');
    void submit(goal);
  }

  function handleVoice() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }
    type SpeechRecognitionCtor = new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start(): void;
    };
    const w = window as unknown as Record<string, SpeechRecognitionCtor>;
    const SR = w['webkitSpeechRecognition'] ?? w['SpeechRecognition'];
    if (!SR) return;
    const r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.lang = 'en-US';
    r.onresult = (e) => {
      const t = e.results[0]?.[0]?.transcript ?? '';
      setInput(t);
      setIsListening(false);
    };
    r.onerror = () => setIsListening(false);
    r.onend = () => setIsListening(false);
    r.start();
    setIsListening(true);
  }

  async function handleReset() {
    setMessages([]);
    await reset();
  }

  const toggleDetails = (id: string) => {
    setExpandedDetailsId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="bg-navy-950 flex min-h-screen flex-col text-slate-100">
      {/* Header */}
      <header className="border-white/8 bg-navy-900/90 sticky top-0 z-30 border-b backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="shadow-glow flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 transition-transform hover:scale-105"
            >
              <Zap className="h-5 w-5 text-white" aria-hidden />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white">LifeOS × Alexa+ Companion</h1>
                <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                  Simulator
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Alexa+ Track · Agentic AI Command Center · MCP spec 2025-11-25
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 text-xs text-slate-400 md:flex">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              <span>MCP Server Active (:3001)</span>
            </div>

            <Link
              href="/activity"
              className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10 sm:inline-flex"
            >
              Activity Logs
              <ExternalLink className="h-3 w-3 text-slate-400" />
            </Link>

            <button
              onClick={() => void handleReset()}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-red-500/30 hover:text-red-400"
              title="Reset starter demo data"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Demo
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col p-4 sm:p-6 lg:h-[calc(100vh-65px)]">
        <div className="grid flex-1 gap-6 lg:grid-cols-12 lg:overflow-hidden">
          {/* Left Column — Conversation & Voice simulator (8 cols on lg) */}
          <div className="flex flex-col rounded-2xl border border-white/10 bg-slate-900/40 shadow-2xl backdrop-blur-xl lg:col-span-8 lg:overflow-hidden">
            {/* Top Phase Header Bar */}
            <div className="border-white/8 border-b bg-white/[0.02] px-4 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Simulation Channel
                </span>
                {isRunning ? (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-blue-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Agent in flight…</span>
                  </div>
                ) : (
                  <span className="font-mono text-[11px] text-slate-500">
                    Ready for voice or text prompt
                  </span>
                )}
              </div>

              {/* Step indicator */}
              <AnimatePresence>
                {isRunning && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1"
                    aria-live="polite"
                  >
                    {PHASES.map(({ key, label }, i) => {
                      const phases = PHASES.map((p) => p.key);
                      const currentIdx = phases.indexOf(currentPhase as (typeof phases)[number]);
                      const phaseIdx = phases.indexOf(key);
                      const isDone = phaseIdx < currentIdx;
                      const isCurrent = phaseIdx === currentIdx;
                      return (
                        <div key={key} className="flex shrink-0 items-center gap-1.5">
                          <div
                            className={cn(
                              'flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all',
                              isDone
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : isCurrent
                                  ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/40'
                                  : 'bg-white/5 text-slate-600',
                            )}
                          >
                            {isDone ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : isCurrent ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : null}
                            {label}
                          </div>
                          {i < PHASES.length - 1 && (
                            <ChevronRight className="h-3 w-3 shrink-0 text-slate-700" />
                          )}
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Conversation Messages Feed */}
            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
              {messages.length === 0 && !isRunning && (
                <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                  <div className="shadow-glow mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/20 to-violet-500/20">
                    <Sparkles className="h-7 w-7 text-blue-400" aria-hidden />
                  </div>
                  <h2 className="text-lg font-bold text-white">Alexa+ Conversational Companion</h2>
                  <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-400">
                    Say or type requests like rescheduling, managing tasks, or planning your day.
                    LifeOS coordinates MCP tools and executes actual PostgreSQL schedule changes in
                    real-time.
                  </p>

                  <div className="mt-6 flex flex-col items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Try asking:
                    </p>
                    <div className="flex max-w-xl flex-wrap justify-center gap-2">
                      {DEMO_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => handleSubmit(prompt)}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-left text-xs text-slate-300 transition-all hover:border-blue-500/40 hover:bg-blue-500/10 hover:text-blue-200 active:scale-95"
                        >
                          &ldquo;{prompt}&rdquo;
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Rendered Messages */}
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      'flex flex-col',
                      msg.role === 'user' ? 'items-end' : 'items-start',
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-xl rounded-2xl px-4 py-3 text-sm shadow-md transition-all',
                        msg.role === 'user'
                          ? 'rounded-tr-xs bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-blue-500/10'
                          : 'rounded-tl-xs border border-white/10 bg-slate-800/80 text-slate-200 backdrop-blur-md',
                      )}
                    >
                      {/* Assistant Header Badge */}
                      {msg.role === 'assistant' && (
                        <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-white/5 pb-1">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-300">
                            <Zap className="h-3 w-3" />
                            <span>Alexa+ Companion</span>
                          </div>
                          {msg.status === 'success' && (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              Action Completed
                            </span>
                          )}
                          {msg.status === 'failed' && (
                            <span className="flex items-center gap-1 text-[11px] text-red-400">
                              <XCircle className="h-3 w-3" />
                              Error
                            </span>
                          )}
                        </div>
                      )}

                      {/* Main Message Text */}
                      <p className="font-normal leading-relaxed">{msg.content}</p>

                      {/* Error Banner with Recovery */}
                      {msg.error && (
                        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                          <div className="flex items-center gap-2 font-medium">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                            <span>{msg.error}</span>
                          </div>
                          <div className="mt-2.5 flex items-center gap-2">
                            <button
                              onClick={() => {
                                const lastUser = [...messages]
                                  .reverse()
                                  .find((m) => m.role === 'user');
                                if (lastUser) handleSubmit(lastUser.content);
                              }}
                              className="rounded bg-red-500/20 px-2.5 py-1 text-[11px] font-semibold text-red-200 transition-colors hover:bg-red-500/30"
                            >
                              Retry Request
                            </button>
                            <button
                              onClick={() => void handleReset()}
                              className="rounded border border-white/10 px-2 py-1 text-[11px] text-slate-400 hover:text-white"
                            >
                              Reset State
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Plan Preview (if assistant returned a plan) */}
                      {msg.planSnapshot && msg.planSnapshot.items.length > 0 && (
                        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                          <div className="mb-2 flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-300">Scheduled Agenda</span>
                            <span className="font-mono text-[11px] text-blue-300">
                              {msg.planSnapshot.items.length} blocks
                            </span>
                          </div>
                          <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                            {msg.planSnapshot.items.map((item) => (
                              <PlanItemCard key={item.id} item={item} timezone={timezone} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Expandable Action Details */}
                      {msg.actionsSnapshot && msg.actionsSnapshot.length > 0 && (
                        <div className="mt-3 border-t border-white/5 pt-2">
                          <button
                            onClick={() => toggleDetails(msg.id)}
                            className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-200"
                          >
                            <span>{msg.actionsSnapshot.length} tool executions recorded</span>
                            {expandedDetailsId === msg.id ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>

                          {expandedDetailsId === msg.id && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              className="mt-2 space-y-1 rounded-lg bg-black/30 p-2"
                            >
                              {msg.actionsSnapshot.map((a) => (
                                <div
                                  key={a.id}
                                  className="flex items-center justify-between border-b border-white/5 py-1 text-[11px] last:border-0"
                                >
                                  <div className="flex min-w-0 items-center gap-1.5 pr-2">
                                    <ToolIcon status={a.status} />
                                    <span className="truncate font-mono text-slate-300">
                                      {a.tool}
                                    </span>
                                    <span className="truncate text-slate-400">— {a.message}</span>
                                  </div>
                                  {a.latencyMs !== undefined && (
                                    <span className="shrink-0 font-mono text-slate-500">
                                      {a.latencyMs}ms
                                    </span>
                                  )}
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </div>
                      )}

                      {/* Timestamp */}
                      <div className="mt-2 text-right font-mono text-[10px] text-slate-400 opacity-60">
                        {msg.timestamp.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* In-Flight Live Assistant Message */}
              {isRunning && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-start"
                >
                  <div className="rounded-tl-xs max-w-xl rounded-2xl border border-blue-500/30 bg-slate-800/90 p-4 text-sm shadow-lg backdrop-blur-md">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-blue-300">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                      <span>LifeOS Agent Orchestrating…</span>
                    </div>

                    <div className="space-y-2">
                      {actions.map((action) => (
                        <div
                          key={action.id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <ToolIcon status={action.status} />
                            <span className="truncate font-medium text-slate-200">
                              {action.message}
                            </span>
                          </div>
                          {action.latencyMs !== undefined && (
                            <span className="shrink-0 font-mono text-[11px] text-slate-400">
                              {action.latencyMs}ms
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Form Bar */}
            <div className="border-white/8 bg-navy-950/80 border-t p-3 sm:p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit();
                }}
                className="flex items-center gap-2 sm:gap-3"
              >
                <button
                  type="button"
                  onClick={handleVoice}
                  disabled={isRunning}
                  aria-label="Voice input"
                  title="Simulate Alexa voice prompt"
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all',
                    isListening
                      ? 'animate-pulse border-red-500 bg-red-500/20 text-red-400 shadow-red-500/20'
                      : 'border-white/10 bg-white/5 text-slate-400 hover:border-blue-500/30 hover:bg-white/10 hover:text-blue-300 disabled:opacity-40',
                  )}
                >
                  <Mic className="h-5 w-5" aria-hidden />
                </button>

                <div className="relative flex-1">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      isListening
                        ? 'Listening… speak now'
                        : "Ask LifeOS (e.g., 'Move my practice session to 8 PM')"
                    }
                    aria-label="Message LifeOS"
                    disabled={isRunning}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors focus:border-blue-500/50 focus:bg-white/[0.08] disabled:opacity-50"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!input.trim() || isRunning}
                  aria-label="Send"
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all',
                    input.trim() && !isRunning
                      ? 'shadow-glow bg-blue-600 text-white hover:bg-blue-500 active:scale-95'
                      : 'cursor-not-allowed bg-white/5 text-slate-600',
                  )}
                >
                  <Send className="h-4 w-4" aria-hidden />
                </button>
              </form>

              {/* Disclaimer footer */}
              <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-slate-400">
                <span>Alexa+ Track Simulator · Press Enter to send</span>
                <span className="font-mono text-slate-400">
                  Session: {sessionId ? sessionId.slice(0, 8) : 'demo-ready'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column — Companion Status & Live State (4 cols on lg) */}
          <div className="flex flex-col gap-4 lg:col-span-4 lg:overflow-y-auto">
            {/* Active Plan Card */}
            {currentPlan && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 shadow-xl backdrop-blur-md"
              >
                <div className="border-white/8 mb-3 flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-violet-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Generated Plan
                    </h3>
                  </div>
                  <Badge variant="default" className="text-[10px]">
                    {currentPlan.items.length} blocks
                  </Badge>
                </div>
                <p className="mb-3 text-xs font-medium text-slate-400">{currentPlan.goal}</p>
                <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                  {currentPlan.items.map((item) => (
                    <PlanItemCard key={item.id} item={item} timezone={timezone} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Live Today's Schedule Card */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 shadow-xl backdrop-blur-md">
              <div className="border-white/8 mb-3 flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Today&apos;s Calendar
                  </h3>
                </div>
                <span className="font-mono text-[11px] text-slate-400">
                  {events.length} event{events.length !== 1 ? 's' : ''}
                </span>
              </div>

              {isLoading ? (
                <div className="space-y-2 py-2">
                  <div className="h-10 animate-pulse rounded-lg bg-white/5" />
                  <div className="h-10 animate-pulse rounded-lg bg-white/5" />
                </div>
              ) : events.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">No events today</p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {events.map((evt) => (
                    <div
                      key={evt.id}
                      className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5 transition-colors hover:bg-white/[0.06]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate pr-2 text-xs font-medium text-slate-200">
                          {evt.title}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-blue-400">
                          {formatTime(evt.start, timezone)}
                        </span>
                      </div>
                      {evt.location && (
                        <p className="mt-0.5 truncate text-[10px] text-slate-400">{evt.location}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tasks Summary Card */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 shadow-xl backdrop-blur-md">
              <div className="border-white/8 mb-3 flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Open Tasks
                  </h3>
                </div>
                <Link
                  href="/tasks"
                  className="flex items-center gap-1 text-[11px] text-blue-400 hover:underline"
                >
                  View all
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                  <span className="text-xl font-bold text-white">
                    {tasks.filter((t) => t.status !== 'completed').length}
                  </span>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-400">
                    Total Open
                  </p>
                </div>
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5">
                  <span className="text-xl font-bold text-red-400">
                    {
                      tasks.filter((t) => t.priority === 'urgent' && t.status !== 'completed')
                        .length
                    }
                  </span>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-red-300">Urgent</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

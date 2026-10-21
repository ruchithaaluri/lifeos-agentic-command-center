import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(date: Date | string, timeZone?: string): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  });
}

export function formatDate(date: Date | string, timeZone?: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  });
}

export function formatRelative(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return 'yesterday';
  if (diffDays < 0) return `${Math.abs(diffDays)}d ago`;
  return `in ${diffDays}d`;
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-slate-500',
};

export const PRIORITY_BG: Record<string, string> = {
  urgent: 'bg-red-500/10 border-red-500/20',
  high: 'bg-orange-500/10 border-orange-500/20',
  medium: 'bg-yellow-500/10 border-yellow-500/20',
  low: 'bg-slate-500/10 border-slate-500/20',
};

export const STATUS_COLORS: Record<string, string> = {
  todo: 'text-slate-400',
  in_progress: 'text-blue-400',
  completed: 'text-emerald-400',
  cancelled: 'text-slate-600',
};

export const EVENT_TYPE_COLORS: Record<string, string> = {
  meeting: 'bg-blue-500/20 text-blue-300',
  focus: 'bg-violet-500/20 text-violet-300',
  break: 'bg-emerald-500/20 text-emerald-300',
  deadline: 'bg-red-500/20 text-red-300',
  reminder: 'bg-yellow-500/20 text-yellow-300',
  personal: 'bg-pink-500/20 text-pink-300',
};

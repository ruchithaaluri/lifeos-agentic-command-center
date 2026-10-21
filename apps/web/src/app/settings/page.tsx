'use client';

import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { AppShell } from '@/components/layout/AppShell';
import {
  CheckCircle2,
  ShieldCheck,
  Server,
  Cpu,
  Globe,
  User,
  Clock,
  Sparkles,
  Loader2,
  Check,
} from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard';

interface SettingsData {
  user: {
    id: string;
    name: string | null;
    email: string;
    timezone: string;
  };
  mode: {
    demoMode: boolean;
    label: string;
  };
  ai: {
    provider: string;
    model: string;
  };
  mcp: {
    url: string;
    status: string;
  };
}

const COMMON_TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'India Standard Time (IST) — Asia/Kolkata (UTC+5:30)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT) — America/Los_Angeles (UTC-7/8)' },
  { value: 'America/New_York', label: 'Eastern Time (ET) — America/New_York (UTC-4/5)' },
  { value: 'America/Chicago', label: 'Central Time (CT) — America/Chicago (UTC-5/6)' },
  { value: 'America/Denver', label: 'Mountain Time (MT) — America/Denver (UTC-6/7)' },
  { value: 'Europe/London', label: 'London / GMT / BST — Europe/London (UTC+0/1)' },
  { value: 'Europe/Paris', label: 'Central Europe — Europe/Paris (UTC+1/2)' },
  { value: 'Asia/Dubai', label: 'Gulf Standard Time — Asia/Dubai (UTC+4)' },
  { value: 'Asia/Singapore', label: 'Singapore / Malaysia — Asia/Singapore (UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time — Asia/Tokyo (UTC+9)' },
  { value: 'Australia/Sydney', label: 'Sydney — Australia/Sydney (UTC+10/11)' },
  { value: 'UTC', label: 'Coordinated Universal Time — UTC' },
];

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTz, setSelectedTz] = useState('America/Los_Angeles');
  const [isSavingTz, setIsSavingTz] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [currentTimePreview, setCurrentTimePreview] = useState('');

  const setGlobalTimezone = useDashboardStore((s) => s.setTimezone);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const json = (await res.json()) as SettingsData;
          setData(json);
          const tz = json.user.timezone || 'America/Los_Angeles';
          setSelectedTz(tz);
          setGlobalTimezone(tz);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, [setGlobalTimezone]);

  // Update current time preview whenever timezone changes
  useEffect(() => {
    try {
      const now = new Date();
      const formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: selectedTz,
        dateStyle: 'full',
        timeStyle: 'medium',
      }).format(now);
      setCurrentTimePreview(formatted);
    } catch {
      setCurrentTimePreview('');
    }
  }, [selectedTz]);

  async function handleSaveTimezone() {
    setIsSavingTz(true);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: selectedTz }),
      });

      if (res.ok) {
        setGlobalTimezone(selectedTz);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to update timezone:', err);
    } finally {
      setIsSavingTz(false);
    }
  }

  function handleAutoDetect() {
    try {
      const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (deviceTz) {
        setSelectedTz(deviceTz);
      }
    } catch {
      // fallback
    }
  }

  return (
    <AppShell>
      <div className="p-6">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data?.mode.demoMode
              ? 'Demo mode active — test user preconfigured'
              : 'Strict authentication active — production runtime configuration'}
          </p>
        </header>

        <div className="glass max-w-xl rounded-xl p-6">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-white/5" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active Account */}
              <div className="flex items-start gap-3">
                <User className="mt-0.5 h-4 w-4 text-blue-400" />
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-400">Authenticated Account</label>
                  <p className="text-sm font-medium text-slate-200">
                    {data?.user.name ?? 'Alex Chen'}
                    <span className="ml-2 font-normal text-slate-400">
                      ({data?.user.email || 'alex.chen@lifeos.demo'})
                    </span>
                  </p>
                </div>
              </div>

              {/* Runtime Mode */}
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-400" />
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-400">Runtime Mode</label>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        data?.mode.demoMode
                          ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-300'
                          : 'border-emerald-500/20 bg-emerald-500/15 text-emerald-300'
                      }`}
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      {data?.mode.label ?? 'Strict Authentication Mode'}
                    </span>
                    <span className="text-xs text-slate-500">
                      {data?.mode.demoMode ? '(DEMO_MODE=true)' : '(DEMO_MODE=false)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Timezone & Local Time Setting */}
              <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-4">
                <Globe className="mt-0.5 h-4 w-4 text-violet-400" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <label htmlFor="tz-select" className="block text-xs font-semibold text-slate-300">
                      Timezone & Local Time
                    </label>
                    <button
                      type="button"
                      onClick={handleAutoDetect}
                      className="flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <Sparkles className="h-3 w-3" />
                      Auto-detect from device
                    </button>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Controls how all schedule times, task due dates, and daily views are calculated.
                  </p>

                  <div className="mt-3">
                    <select
                      id="tz-select"
                      value={selectedTz}
                      onChange={(e) => setSelectedTz(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:border-violet-500 focus:outline-none [color-scheme:dark]"
                    >
                      {!COMMON_TIMEZONES.some((tz) => tz.value === selectedTz) && (
                        <option value={selectedTz}>{selectedTz} (Custom)</option>
                      )}
                      {COMMON_TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {currentTimePreview && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-400">
                      <Clock className="h-3.5 w-3.5 text-violet-400" />
                      <span>Current time: <strong className="text-white">{currentTimePreview}</strong></span>
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        void handleSaveTimezone();
                      }}
                      disabled={isSavingTz || selectedTz === data?.user.timezone}
                      className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-glow hover:bg-violet-500 disabled:opacity-50 transition-all"
                    >
                      {isSavingTz ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Saving Timezone...
                        </>
                      ) : (
                        'Save Timezone'
                      )}
                    </button>

                    {saveSuccess && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <Check className="h-3.5 w-3.5" />
                        Timezone updated!
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* AI Provider */}
              <div className="flex items-start gap-3">
                <Cpu className="mt-0.5 h-4 w-4 text-amber-400" />
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-400">AI Provider & Model</label>
                  <p className="text-sm text-slate-200">
                    <span className="capitalize">{data?.ai.provider ?? 'OpenAI'}</span>
                    <span className="ml-2 text-xs text-slate-400">({data?.ai.model ?? 'gpt-4o'})</span>
                  </p>
                </div>
              </div>

              {/* MCP Server */}
              <div className="flex items-start gap-3">
                <Server className="mt-0.5 h-4 w-4 text-cyan-400" />
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-400">MCP Server</label>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="font-mono text-sm text-slate-200">{data?.mcp.url ?? 'http://localhost:3001'}</p>
                    <span className="inline-flex items-center rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.2 text-[10px] text-cyan-300">
                      Active
                    </span>
                  </div>
                </div>
              </div>

              {/* Sign out */}
              <div className="pt-4 border-t border-white/8 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-300">Sign Out</p>
                  <p className="text-[11px] text-slate-500">Sign out of your active LifeOS session</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void signOut({ callbackUrl: '/' });
                  }}
                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

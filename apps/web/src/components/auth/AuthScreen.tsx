'use client';

// ============================================================
// AuthScreen — Shared Sign In / Sign Up Component
// ============================================================

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { Zap, Loader2, ArrowLeft } from 'lucide-react';

export type AuthMode = 'signin' | 'signup';

interface AuthFormProps {
  mode: AuthMode;
  email: string;
  name: string;
  password: string;
  error: string | null;
  busy: boolean;
  inputClass: string;
  onEmail: (v: string) => void;
  onName: (v: string) => void;
  onPassword: (v: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void | Promise<void>;
}

function AuthForm({
  mode,
  email,
  name,
  password,
  error,
  busy,
  inputClass,
  onEmail,
  onName,
  onPassword,
  onSubmit,
}: AuthFormProps) {
  return (
    <form
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      className="space-y-4"
      noValidate
    >
      {mode === 'signup' && (
        <div>
          <label htmlFor="name" className="mb-1.5 block text-xs font-medium text-slate-400">
            Full Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={100}
            value={name}
            onChange={(e) => onName(e.target.value)}
            className={inputClass}
            placeholder="Alex Chen"
          />
        </div>
      )}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-slate-400">
          Email Address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          className={inputClass}
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-slate-400">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          required
          minLength={mode === 'signup' ? 8 : undefined}
          maxLength={200}
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          className={inputClass}
          placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {mode === 'signin' ? 'Sign in' : 'Create account'}
      </button>
    </form>
  );
}

function AuthScreenInner({ initialMode = 'signin' }: { initialMode?: AuthMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const queryMode = params.get('mode') as AuthMode | null;
  const [mode, setMode] = useState<AuthMode>(queryMode ?? initialMode);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const callbackUrl = params.get('callbackUrl') ?? '/dashboard';

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (mode === 'signup') {
      if (!name.trim()) {
        setError('Please enter your name.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'signup') {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), name: name.trim(), password }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          setError(body?.error?.message ?? 'Could not create that account.');
          setBusy(false);
          return;
        }
      }

      const result = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setError('That email and password combination did not match.');
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:border-indigo-400/60 focus:bg-white/[0.06] focus:outline-none';

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-12">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to LifeOS
        </Link>

        <div className="mb-7 flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600"
            aria-hidden
          >
            <Zap className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              {mode === 'signin' ? 'Sign in' : 'Create your account'}
            </h1>
            <p className="text-xs text-slate-500">
              {mode === 'signin'
                ? 'Continue to your command center.'
                : 'Start organising with LifeOS.'}
            </p>
          </div>
        </div>
        <AuthForm
          mode={mode}
          email={email}
          name={name}
          password={password}
          error={error}
          busy={busy}
          inputClass={inputClass}
          onEmail={setEmail}
          onName={setName}
          onPassword={setPassword}
          onSubmit={onSubmit}
        />

        <p className="mt-6 text-center text-xs text-slate-500">
          {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
            }}
            className="font-medium text-indigo-300 underline-offset-4 hover:underline"
          >
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </main>
  );
}

function AuthFallback() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-navy-950 px-4"
      aria-busy="true"
    >
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading your workspace…
      </p>
    </main>
  );
}

export function AuthScreen({ initialMode = 'signin' }: { initialMode?: AuthMode }) {
  return (
    <Suspense fallback={<AuthFallback />}>
      <AuthScreenInner initialMode={initialMode} />
    </Suspense>
  );
}

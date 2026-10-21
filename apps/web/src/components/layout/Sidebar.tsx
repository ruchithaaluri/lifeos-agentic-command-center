'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  Home,
  Calendar,
  CheckSquare,
  FolderOpen,
  Activity,
  Settings,
  Zap,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/today', label: 'Today', icon: Calendar },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/alexa', label: 'Alexa+', icon: Zap, highlight: true },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data, status } = useSession();

  // Falls back to the demo identity so the sidebar still reads correctly
  // when demo mode is on and no account is signed in.
  const displayName = data?.user?.name ?? (status === 'loading' ? '…' : 'Alex Chen');
  const isDemo = !data?.user;
  const initial = (displayName || 'L').trim().charAt(0).toUpperCase();

  return (
    <aside
      className="border-white/8 bg-navy-900/80 fixed left-0 top-0 z-40 flex h-full w-14 flex-col items-center border-r backdrop-blur-md lg:w-56"
      aria-label="Main navigation"
    >
      {/* Logo */}
      <Link
        href="/dashboard"
        className="border-white/8 flex h-16 w-full items-center gap-3 border-b px-3 lg:px-4"
        aria-label="LifeOS home"
      >
        <div className="shadow-glow flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600">
          <Zap className="h-4 w-4 text-white" aria-hidden />
        </div>
        <span className="hidden text-base font-bold text-white lg:block">LifeOS</span>
      </Link>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 px-2 py-4" aria-label="Navigation links">
        {NAV_ITEMS.map(({ href, label, icon: Icon, highlight }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-blue-500/15 text-blue-300'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                highlight && !isActive && 'text-violet-400 hover:text-violet-300',
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg bg-blue-500/10"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                />
              )}
              <Icon className="relative h-4 w-4 shrink-0" aria-hidden />
              <span className="relative hidden lg:block">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Account */}
      <div className="border-white/8 w-full border-t px-2 py-3">
        <div className="flex h-9 items-center gap-3 rounded-lg px-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-xs font-bold text-white">
            {initial}
          </div>
          <div className="hidden min-w-0 flex-1 lg:block">
            <p className="truncate text-xs font-medium text-slate-200">{displayName}</p>
            <p className="truncate text-xs text-slate-500">{isDemo ? 'Demo workspace' : 'Workspace'}</p>
          </div>
          {status === 'authenticated' && (
            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: '/' })}
              title="Sign out"
              aria-label="Sign out"
              className="hidden shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200 lg:block"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
        {/* Mobile sign out — the label row is hidden below lg */}
        {status === 'authenticated' && (
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: '/' })}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200 lg:hidden"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Sign out
          </button>
        )}
      </div>
    </aside>
  );
}

'use client';

import { Sidebar } from './Sidebar';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
  className?: string;
}

export function AppShell({ children, className }: AppShellProps) {
  return (
    <div className="bg-navy-950 flex min-h-screen">
      <Sidebar />
      <main className={cn('flex-1 overflow-y-auto pl-14 lg:pl-56', className)}>{children}</main>
    </div>
  );
}

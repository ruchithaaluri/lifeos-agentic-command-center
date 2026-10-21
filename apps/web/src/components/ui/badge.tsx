import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'urgent' | 'high' | 'medium' | 'low' | 'success' | 'muted';
  className?: string;
}

const variants: Record<string, string> = {
  default: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
  urgent: 'bg-red-500/15 text-red-300 border-red-500/20',
  high: 'bg-orange-500/15 text-orange-300 border-orange-500/20',
  medium: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20',
  low: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  muted: 'bg-white/5 text-slate-400 border-white/10',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

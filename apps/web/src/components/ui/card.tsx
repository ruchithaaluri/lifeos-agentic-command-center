import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, glow, onClick }: CardProps) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter') onClick();
            }
          : undefined
      }
      className={cn(
        'glass rounded-xl p-4 transition-all duration-200',
        glow && 'shadow-glow',
        onClick && 'glass-hover cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  );
}

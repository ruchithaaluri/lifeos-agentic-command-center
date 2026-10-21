// ============================================================
// LifeOS Design Tokens
// Single source of truth for colors, spacing, typography.
// Used by Tailwind config and any non-Tailwind contexts.
// ============================================================

export const colors = {
  // Brand
  navy: {
    950: '#030712',
    900: '#0a0f1e',
    800: '#0d1530',
    700: '#111d42',
    600: '#162454',
    500: '#1a2d6b',
  },
  electric: {
    500: '#3b82f6',
    400: '#60a5fa',
    300: '#93c5fd',
  },
  cyan: {
    500: '#06b6d4',
    400: '#22d3ee',
    300: '#67e8f9',
  },
  violet: {
    600: '#7c3aed',
    500: '#8b5cf6',
    400: '#a78bfa',
  },
  // Semantic
  surface: {
    DEFAULT: 'rgba(255,255,255,0.04)',
    hover: 'rgba(255,255,255,0.07)',
    active: 'rgba(255,255,255,0.10)',
    border: 'rgba(255,255,255,0.08)',
  },
  // Priority
  priority: {
    urgent: '#ef4444',
    high: '#f97316',
    medium: '#eab308',
    low: '#6b7280',
  },
  // Status
  status: {
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },
} as const;

export const shadows = {
  glow: '0 0 20px rgba(59,130,246,0.15)',
  glowLg: '0 0 40px rgba(59,130,246,0.2)',
  glass: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
} as const;

export const borderRadius = {
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '0.875rem',
  '2xl': '1.25rem',
  full: '9999px',
} as const;

export const typography = {
  fontFamily: {
    sans: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
  },
} as const;

// ── Priority helpers ──────────────────────────────────────────────────────

export function priorityColor(priority: string): string {
  return (colors.priority as Record<string, string>)[priority] ?? colors.priority.low;
}

export function priorityBg(priority: string): string {
  const map: Record<string, string> = {
    urgent: 'rgba(239, 68, 68, 0.12)',
    high: 'rgba(249, 115, 22, 0.12)',
    medium: 'rgba(234, 179, 8, 0.12)',
    low: 'rgba(107, 114, 128, 0.12)',
  };
  return map[priority] ?? map['low'] ?? 'transparent';
}

// ── Event type colors ─────────────────────────────────────────────────────

export const eventTypeColors: Record<string, { bg: string; text: string }> = {
  meeting: { bg: 'rgba(59, 130, 246, 0.2)', text: '#93c5fd' },
  focus: { bg: 'rgba(139, 92, 246, 0.2)', text: '#c4b5fd' },
  break: { bg: 'rgba(16, 185, 129, 0.2)', text: '#6ee7b7' },
  deadline: { bg: 'rgba(239, 68, 68, 0.2)', text: '#fca5a5' },
  reminder: { bg: 'rgba(234, 179, 8, 0.2)', text: '#fde68a' },
  personal: { bg: 'rgba(236, 72, 153, 0.2)', text: '#f9a8d4' },
};

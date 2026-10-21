import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // LifeOS design tokens
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
        surface: {
          DEFAULT: 'rgba(255,255,255,0.04)',
          hover: 'rgba(255,255,255,0.07)',
          active: 'rgba(255,255,255,0.10)',
          border: 'rgba(255,255,255,0.08)',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-glow':
          'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(59,130,246,0.3) 0%, transparent 60%)',
        'card-glow': 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(139,92,246,0.05) 100%)',
      },
      boxShadow: {
        glow: '0 0 20px rgba(59,130,246,0.15)',
        'glow-lg': '0 0 40px rgba(59,130,246,0.2)',
        glass: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
    },
  },
  plugins: [],
};

export default config;

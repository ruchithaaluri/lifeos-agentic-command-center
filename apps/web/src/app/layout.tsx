import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'LifeOS — Your AI command center for getting life done',
  description:
    'LifeOS turns natural-language goals into plans, actions, and live progress across your tasks, schedule, and connected tools.',
  keywords: ['AI', 'productivity', 'agent', 'planning', 'MCP', 'command center'],
  openGraph: {
    title: 'LifeOS — Your AI command center for getting life done',
    description:
      'Turn natural-language goals into plans, actions, and live progress across your tasks, schedule, and connected tools.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="bg-navy-950 min-h-screen text-slate-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

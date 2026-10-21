import Link from 'next/link';
import { ArrowRight, Zap, Brain, Clock, Shield, GitBranch } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="bg-navy-950 min-h-screen overflow-hidden">
      {/* Background glow */}
      <div className="bg-hero-glow pointer-events-none fixed inset-0" aria-hidden />

      {/* Nav */}
      <nav className="border-white/8 relative z-10 flex items-center justify-between border-b px-6 py-4 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="shadow-glow flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600">
            <Zap className="h-4 w-4 text-white" aria-hidden />
          </div>
          <span className="text-lg font-bold text-white">LifeOS</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/signin"
            className="text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors"
          >
            Sign up
          </Link>
          <Link
            href="/dashboard"
            className="shadow-glow flex items-center gap-1.5 rounded-lg bg-blue-500 px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:bg-blue-400 focus-visible:outline"
          >
            Launch App
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative mx-auto max-w-5xl px-6 py-24 text-center">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-300">
          <Zap className="h-3.5 w-3.5" aria-hidden />
          Alexa+ Track · MCP Spec 2025-11-25
        </div>

        <h1 className="text-5xl font-bold tracking-tight text-white sm:text-7xl">LifeOS</h1>
        <p className="mt-4 text-2xl font-medium text-blue-300 sm:text-3xl">
          Your AI Command Center
        </p>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
          Turn natural-language requests into intelligent plans, real actions, and real-time updates
          across your digital life.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="shadow-glow-lg flex items-center gap-2 rounded-xl bg-blue-500 px-8 py-3.5 text-base font-semibold text-white transition-all hover:bg-blue-400"
          >
            Try LifeOS
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
          <Link
            href="/alexa"
            className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-8 py-3.5 text-base font-semibold text-slate-200 transition-all hover:bg-white/10"
          >
            See the agent in action
          </Link>
        </div>
      </section>

      {/* Agent workflow */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-12 text-center text-2xl font-bold text-white">How the agent works</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {[
            'Natural language',
            'Intent parsing',
            'Context retrieval',
            'AI planning',
            'Tool selection',
            'Execution',
            'DB update',
            'Live UI',
          ].map((step, i) => (
            <div key={step} className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-500/25 bg-blue-500/15 text-sm font-bold text-blue-300">
                {i + 1}
              </div>
              <span className="text-xs leading-tight text-slate-400">{step}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-12 text-center text-2xl font-bold text-white">Built different</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Brain,
              title: 'Real agent, real actions',
              description:
                "LifeOS doesn't just answer questions — it creates tasks, moves events, and rebuilds your day through real MCP tool calls.",
            },
            {
              icon: GitBranch,
              title: 'MCP-native architecture',
              description:
                'Self-hosted MCP server over Streamable HTTP with 12 tools. Real tool calls, real database updates, real results.',
            },
            {
              icon: Clock,
              title: 'Real-time dashboard',
              description:
                'Every agent action streams live via Server-Sent Events. Watch the AI build your plan and update your schedule in real time.',
            },
            {
              icon: Zap,
              title: 'Alexa+ simulator',
              description:
                'Full multimodal Alexa+ experience backed by the same MCP tools. Not a separate demo — the same real backend.',
            },
            {
              icon: Shield,
              title: 'Security-first',
              description:
                'Bearer token auth, Zod validation at every boundary, soft deletes, no secrets in client code.',
            },
            {
              icon: ArrowRight,
              title: 'Provider-agnostic AI',
              description:
                'Swap between OpenAI and Anthropic via environment variable. The agent logic is decoupled from any one model.',
            },
          ].map(({ icon: Icon, title, description }) => (
            <div key={title} className="glass rounded-xl p-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/15">
                <Icon className="h-4.5 w-4.5 text-blue-400" aria-hidden />
              </div>
              <h3 className="mb-1.5 text-sm font-semibold text-slate-100">{title}</h3>
              <p className="text-sm leading-relaxed text-slate-500">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Example conversation */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="mb-8 text-center text-2xl font-bold text-white">Example</h2>
        <div className="glass overflow-hidden rounded-2xl">
          <div className="bg-white/3 border-white/8 border-b px-5 py-3">
            <span className="text-xs font-medium text-slate-400">LifeOS Agent · Demo</span>
          </div>
          <div className="space-y-4 p-5">
            <div className="flex justify-end">
              <div className="max-w-sm rounded-2xl rounded-tr-sm bg-blue-500 px-4 py-3 text-sm text-white">
                I have a product demo tomorrow and I&apos;m behind. Help me get ready.
              </div>
            </div>
            <div className="space-y-2">
              {[
                "✓ Retrieved today's schedule — 4 events",
                '✓ Found 7 unfinished tasks',
                '✓ Detected demo deadline tomorrow at 10 AM',
                '✓ Analyzed task dependencies',
                '✓ Generated time-blocked preparation plan',
                '✓ Created 2 tasks — "Talking Points", "Final Review"',
                '✓ Rescheduled practice session to 8 PM',
              ].map((action) => (
                <div key={action} className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="text-emerald-400">{action.split(' ')[0]}</span>
                  <span>{action.slice(2)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-start">
              <div className="glass max-w-sm rounded-2xl rounded-tl-sm border border-white/10 px-4 py-3 text-sm text-slate-200">
                Your plan is ready. I&apos;ve blocked time for slide work, created talking points
                tasks, and moved practice to 8 PM so you have a clear evening runway.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-white/8 border-t px-6 py-8 text-center">
        <p className="text-xs text-slate-600">
          LifeOS · Amazon Developer Hackathon 2026 · Alexa+ Track · Built with MCP Spec 2025-11-25
        </p>
      </footer>
    </div>
  );
}

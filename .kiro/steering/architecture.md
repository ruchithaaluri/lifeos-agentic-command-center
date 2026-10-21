# LifeOS — Architecture Steering

## Monorepo Structure

```
lifeos/
├── apps/
│   ├── web/                    # Next.js 14 frontend
│   └── mcp-server/             # MCP server (Streamable HTTP)
├── packages/
│   ├── shared/                 # Zod schemas, types, constants
│   ├── database/               # Prisma client, seed, migrations
│   ├── ai/                     # LLM abstraction layer
│   └── ui/                     # Shared React components, tokens
├── docs/
│   └── HACKATHON_COMPLIANCE.md
├── .github/
│   └── workflows/ci.yml
├── .kiro/
│   └── steering/
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
└── README.md
```

## Technology Choices

### Frontend (apps/web)

- **Next.js 14** (App Router)
- **React 18**
- **TypeScript** (strict)
- **Tailwind CSS v3**
- **Framer Motion** — agent activity animations
- **shadcn/ui** — base components
- **Zustand** — client state management
- **SWR or TanStack Query** — data fetching/caching
- **Server-Sent Events** — real-time agent updates

### MCP Server (apps/mcp-server)

- **Node.js + TypeScript**
- **@modelcontextprotocol/sdk** — official MCP SDK
- **Express** — HTTP server wrapping MCP Streamable HTTP transport
- **Zod** — input/output validation
- MCP specification: **2025-11-25**
- Transport: **Streamable HTTP** (POST /mcp)

### Database (packages/database)

- **PostgreSQL** (via Supabase for development simplicity)
- **Prisma ORM** — type-safe queries, migrations
- Local: PostgreSQL via Docker or Supabase local
- Seed script provides realistic demo data

### AI Layer (packages/ai)

- Provider-agnostic interface
- Configured via environment variables: `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`
- Supports: OpenAI, Anthropic (pluggable)
- Used by: MCP `generate_plan`, `execute_plan`, `analyze_day` tools
- The agent orchestration loop lives in `packages/ai/src/agent.ts`

### Shared (packages/shared)

- Zod schemas for all domain types
- TypeScript interfaces/types derived from schemas
- Constants (priorities, statuses, etc.)
- Shared error types

### UI (packages/ui)

- Design tokens (colors, spacing, typography)
- Base component overrides for shadcn
- LifeOS-specific components (PlanCard, AgentActivity, etc.)

## Data Model (Prisma)

```
User
  id, email, name, demoMode, createdAt, updatedAt

Project
  id, userId, name, description, status, color, createdAt, updatedAt

Task
  id, userId, projectId?, title, description, status, priority,
  dueDate?, estimatedMinutes?, completedAt?, createdAt, updatedAt

CalendarEvent
  id, userId, title, description?, start, end, type, location?,
  projectId?, taskId?, createdAt, updatedAt

AgentAction
  id, userId, sessionId, tool, input (json), output (json), status,
  latencyMs?, createdAt

AgentSession
  id, userId, goal, plan (json)?, status, createdAt, updatedAt
```

## MCP Tools (12 minimum)

| Tool             | Purpose                                           |
| ---------------- | ------------------------------------------------- |
| `get_tasks`      | Retrieve filtered task list                       |
| `create_task`    | Create a new task                                 |
| `update_task`    | Update task fields                                |
| `delete_task`    | Delete a task (soft delete)                       |
| `get_schedule`   | Retrieve calendar events for a date range         |
| `create_event`   | Create a calendar event                           |
| `move_event`     | Reschedule an event                               |
| `get_projects`   | List projects with progress                       |
| `search_context` | Semantic search across tasks/events/notes         |
| `analyze_day`    | Analyze a day and return conflict/deadline report |
| `generate_plan`  | LLM-powered plan generation for a goal            |
| `execute_plan`   | Execute a structured plan (multi-step tool calls) |

## Agent Architecture

```
User input
  → apps/web: /api/agent/chat (POST)
  → packages/ai: AgentOrchestrator.run(goal, userId)
    → parse intent
    → call MCP tools via HTTP (apps/mcp-server)
    → accumulate context
    → call generate_plan
    → call execute_plan (creates tasks/events)
    → stream action log back via SSE
  → apps/web: updates Zustand store via SSE
  → Dashboard re-renders
```

## Real-time Updates

- **Server-Sent Events** on `/api/agent/stream/[sessionId]`
- Events: `action_start`, `action_complete`, `action_failed`, `plan_ready`, `session_complete`
- Client subscribes immediately after submitting a goal
- Each event carries: `{ type, tool?, message, data?, timestamp }`

## Security Model

- No secrets in client-side code
- API routes protected by session token (NextAuth or demo token)
- MCP server protected by bearer token (`MCP_SECRET`)
- Input validated with Zod at every API boundary
- Database queries use Prisma parameterized queries
- CORS restricted on MCP server

## Environment Variables

```bash
# Database
DATABASE_URL=

# AI Provider
AI_PROVIDER=openai           # openai | anthropic
AI_MODEL=gpt-4o
AI_API_KEY=

# MCP Server
MCP_SERVER_URL=http://localhost:3001
MCP_SECRET=

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# Demo mode
DEMO_MODE=true
DEMO_USER_ID=
```

## Deployment

- Frontend: Vercel or AWS Amplify
- MCP Server: AWS Lambda (via SST) or EC2/ECS
- Database: Supabase (managed PostgreSQL)
- Environment: All secrets via `.env.local` (dev) or AWS SSM/Secrets Manager (prod)

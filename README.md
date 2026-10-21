# LifeOS

LifeOS is an agentic AI command center that turns a natural-language request into
concrete changes across tasks, calendar events, and projects. It is built around a
Model Context Protocol (MCP) server exposing 12 tools, an agent orchestrator that
plans and executes multi-step work, and a Next.js web application that streams the
agent's progress to the browser.

## Problem

Productivity tools expose CRUD endpoints, not intent. A user who is "behind on a
product demo tomorrow" still has to decide which tasks matter, find calendar gaps,
create the work blocks, and re-sequence existing commitments. Each step is manual,
and the cost of getting it wrong compounds as the deadline approaches.

Assistants that do help usually stop at advice. They cannot read or mutate the
user's actual task and calendar state, so the user is left translating a suggestion
into a series of manual edits.

## Solution

LifeOS closes that gap by exposing the task, calendar, and project domain as MCP
tools and placing an agent loop in front of them. The agent parses intent, gathers
context from the live database, generates a plan, and executes it through the MCP
tools, committing real state changes. Progress is streamed to the UI over Server-Sent
Events so the user can see which tool is running and why.

## Key capabilities

- 12 MCP tools covering task, calendar, and project CRUD, plus search, day analysis,
  plan generation, and plan execution.
- Agentic loop: intent parsing, parallel context gathering, plan generation, plan
  execution, and streamed lifecycle events.
- Server-side validation with Zod schemas shared between the MCP tools, the web API
  routes, and the client stores.
- Live agent activity feed showing each tool call, its status, and its latency.
- Seeded demo persona with an in-app demo reset.
- Rule-based fallbacks so the system runs and is inspectable without an LLM key.

## Alexa+ experience

`apps/web/src/app/alexa/page.tsx` is a voice-first simulator of the conversational
surface. It shows a transcript, phase indicators (understanding, retrieving,
planning, executing, updated), and the live tool-call feed. Submitting a phrase runs
the same pipeline as the dashboard: the request is POSTed to `/api/agent/chat`, the
orchestrator runs, and the client subscribes to
`/api/agent/stream/[sessionId]` for Server-Sent Events.

This is a simulator of the interaction model. There is no live Alexa service
integration, no speech-to-text, and no published Alexa skill in this repository.

## MCP architecture

The MCP server (`apps/mcp-server`) is an Express application speaking the
Streamable HTTP transport with a stateless, per-request server instance.

- Each `POST /mcp` creates a fresh `McpServer` and a fresh transport, then discards
  both. Stateless mode is selected by omitting `sessionIdGenerator`, which disables
  the SDK's session tracking.
- All 12 tools are registered with `registerTool` using their real Zod shapes. Those
  shapes are what `tools/list` advertises, so clients discover genuine `required`
  fields and enums, and the SDK validates arguments before a handler runs.
- Tool handlers still re-validate with their full Zod object schema, so they remain
  safe when invoked directly rather than through the SDK.
- The `userId` is captured in the per-request closure, so no transport patching is
  needed and tools cannot read another user's data.
- Tool-level failures are returned as a `CallToolResult` with `isError: true`, which
  is the behaviour the MCP specification defines for tool execution errors.
- Every tool scopes its database queries to the authenticated user id.

`GET /mcp` returns a plain-JSON tool listing for discoverability, and `GET /health`
returns a liveness payload. Both are unauthenticated; `POST /mcp` requires a bearer
token.

## Technology stack

- TypeScript 5.9, Node.js 20 or newer, pnpm 9.7 workspaces
- Next.js 14.2 (App Router), React 18, Tailwind CSS 3, Zustand
- Express 4 with `@modelcontextprotocol/sdk` 1.30 (Streamable HTTP)
- Prisma 5.22 with PostgreSQL 16
- Zod 3 for shared validation
- Vitest 2 for unit and integration tests, Playwright for end-to-end specs
- ESLint 8 and Prettier 3

## Architecture

```
Browser (Next.js client components)
  |  POST /api/agent/chat       -> starts the orchestrator, returns a session id
  |  GET  /api/agent/stream/... <- SSE stream of agent lifecycle events
  v
AgentOrchestrator (@lifeos/ai)
  |  parse intent -> gather context -> generate plan -> execute plan
  |  every tool call goes through MCPClient over HTTP
  v
MCP server (apps/mcp-server, port 3001)
  |  bearer-authenticated, rate-limited, 12 tools
  v
Prisma -> PostgreSQL
```

The SSE channel is an in-process emitter (`apps/web/src/lib/sse-emitter.ts`). It is
correct for a single Node process and would need Redis pub/sub to run across
multiple instances.

## Project structure

```
apps/
  mcp-server/        Express MCP server, 12 tool implementations, tests
  web/               Next.js 14 app, API routes, stores, hooks, e2e specs
packages/
  shared/            Zod schemas, constants, error types, utilities
  database/          Prisma schema, client singleton, queries, seed
  ai/                Provider abstraction, agent orchestrator, MCP client
  ui/                Design tokens
docs/                Audit, compliance, and project notes
scripts/             verify-system.ps1
```

## Local setup

Prerequisites: Node.js 20+, pnpm 9.7+, and PostgreSQL 16 (Docker is the easiest way
to run it locally).

```bash
pnpm install
docker compose up -d          # starts PostgreSQL on 5432
pnpm db:generate              # generate the Prisma client
pnpm db:migrate               # apply the schema
pnpm db:seed                  # load the demo persona
```

`pnpm db:generate` must run before the first build. The Prisma client is generated
into `node_modules` and is not committed, so a fresh clone has no database types
until this command succeeds.

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values you need.

| Variable          | Purpose                                             | Required |
| ----------------- | --------------------------------------------------- | -------- |
| `DATABASE_URL`    | PostgreSQL connection string                        | Yes      |
| `MCP_SERVER_URL`  | Base URL the web app uses to reach the MCP server   | Yes      |
| `MCP_SECRET`      | Bearer token for the MCP server (32+ characters)    | Yes      |
| `CORS_ORIGINS`    | Comma-separated allowed origins for the MCP server  | No       |
| `AI_PROVIDER`     | `openai` or `anthropic`                             | No       |
| `AI_MODEL`        | Model identifier for the selected provider          | No       |
| `AI_API_KEY`      | Provider API key; empty uses the fallback behaviour | No       |
| `NEXTAUTH_URL`    | NextAuth base URL                                   | No       |
| `NEXTAUTH_SECRET` | NextAuth signing secret                             | No       |
| `DEMO_MODE`       | `true` pins all requests to the demo user           | No       |
| `DEMO_USER_ID`    | UUID of the demo user                               | No       |
| `LOG_LEVEL`       | `debug`, `info`, `warn`, or `error`                 | No       |

No real credentials belong in the repository. `.env` and `.env.local` are ignored by
git, and `.env.example` contains placeholders only.

## Running the application

Run the two services in separate terminals:

```bash
pnpm --filter @lifeos/mcp-server dev   # MCP server on http://localhost:3001
pnpm --filter @lifeos/web dev          # web app on http://localhost:3000
```

Then open:

- `http://localhost:3000` - landing page
- `http://localhost:3000/dashboard` - agent dashboard
- `http://localhost:3000/alexa` - conversational simulator
- `http://localhost:3000/today`, `/tasks`, `/projects`, `/activity`, `/settings`

Verify the MCP server is up:

```bash
curl http://localhost:3001/health
curl http://localhost:3001/mcp        # tool listing, no auth required
```

## Running MCP

The MCP endpoint is a plain HTTP server. With the secret from your environment, list
the tools like this:

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Authorization: Bearer $MCP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

To call a tool, send `tools/call` with the tool name and its arguments:

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Authorization: Bearer $MCP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"get_tasks","arguments":{"status":"todo"}}}'
```

The server is stateless, so each request is independent and no session id is
required. Arguments are validated against the tool's published schema; failures come
back as a result with `isError: true`.

## Testing

```bash
pnpm test                 # all unit and integration suites
pnpm test:integration     # MCP integration suite only
pnpm --filter @lifeos/web test:e2e   # Playwright specs (needs a running app)
```

Current suite sizes:

| Suite                | Tests                                                             |
| -------------------- | ----------------------------------------------------------------- |
| `@lifeos/shared`     | 51                                                                |
| `@lifeos/ai`         | 14                                                                |
| `@lifeos/mcp-server` | 71, of which 36 database-backed tests skip without `DATABASE_URL` |
| `@lifeos/web`        | 13                                                                |

The MCP integration suite starts a real HTTP server and drives it with the official
MCP SDK client, so it exercises the transport, the tool schemas, and error handling
over the wire rather than by importing internals.

Database-backed tests are skipped unless `DATABASE_URL` is set and reachable. To run
them locally, start PostgreSQL and export the variable before running `pnpm test`.

## Security

- Every `POST /mcp` request requires `Authorization: Bearer <MCP_SECRET>`; a request
  without a valid token receives 401 before any tool executes.
- The MCP server applies Helmet headers, an explicit CORS origin allowlist driven by
  `CORS_ORIGINS` (no wildcard default), a 1 MB JSON body limit, and a 60 requests per
  minute rate limit on `/mcp`.
- All tool queries are scoped to the authenticated user id, so one user cannot read
  or mutate another user's records.
- The MCP server logs structured JSON and redacts password, token, secret, apiKey,
  and authorization fields before writing.
- `MCP_SECRET` is only ever read from the environment and is never logged.
- Web API routes validate request bodies with Zod before use.
- `.env` and `.env.local` are git-ignored; only `.env.example` is committed, and it
  contains placeholders.
- Database-backed routes are marked `force-dynamic` so they are never prerendered
  into build output.

Known limitations: authentication uses a single shared static bearer token, and
`resolveUserId` returns the demo user whenever demo mode is on. There is no per-user
OAuth flow, no refresh-token handling, and the web API routes rely on
`getDemoUserId` rather than validating a session. These are demo-scope trade-offs and
should be replaced before any real deployment.

`pnpm audit` currently reports 34 advisories, concentrated in `next@14.2.x`,
`vitest@2.1.x`, and their transitive `postcss` and `vite` dependencies. The critical
`next` and `vitest` advisories are only resolved by major-version upgrades that are
out of scope for this change. See "Remaining work".

## Hackathon track

Submitted for the Amazon Alexa+ Hackathon, targeting the conversational-assistant
and MCP-integration tracks.

## Current implementation status

Implemented and covered by the automated suites:

- 12 MCP tools registered with real Zod schemas, validated server-side, scoped per
  user, and advertised correctly over `tools/list`.
- Stateless Streamable HTTP MCP server with bearer auth, rate limiting, Helmet, a
  CORS allowlist, structured logging, and graceful shutdown.
- Agent orchestrator: intent parsing, parallel context gathering, plan generation,
  plan execution, error mapping, and streamed events.
- Web application: landing, dashboard, today, tasks, projects, activity, settings,
  and the Alexa-style simulator, with SSE-driven live updates.
- Database schema, seed script, and a demo reset endpoint.
- A CI pipeline covering build, dependency check, integration tests, lint and format,
  security audit, typecheck, and unit tests.

Not implemented in this repository:

- Live Alexa skill integration; the `/alexa` page is a simulator.
- Per-user authentication; demo mode pins every request to a single seeded user.
- Multi-instance support; the SSE emitter is in-process.
- Playwright end-to-end specs exist under `apps/web/e2e` but are not executed in CI,
  because they require a running web app and a seeded database.

## Deployment status

Not deployed. There is no hosting, no production URL, and no deployed environment for
this project.

The CI workflow runs on every push and pull request targeting `main` and `develop`. It
builds and tests the code but publishes nothing.

Local production builds are reproducible with `pnpm build`, which compiles all four
packages and produces a Next.js build in `apps/web/.next`. Running that build still
requires a reachable PostgreSQL instance and real environment variables.

## Remaining work

- Upgrade `next` and `vitest` to release lines that clear the open advisories. This
  is a major-version migration and was deliberately left out of this CI fix.
- Replace the shared static bearer token with per-user OAuth, and resolve the user id
  from a verified session instead of demo mode.
- Move the SSE emitter to Redis pub/sub so the web app can run on multiple instances.
- Run the database-backed integration tests against a real PostgreSQL instance and
  wire them into the CI integration job, which currently has no database service
  configured.
- Add a committed migration history. The repository has no
  `packages/database/prisma/migrations` directory, so `db:migrate` creates the schema
  interactively rather than replaying a recorded history.

## License

MIT. See [LICENSE](LICENSE).

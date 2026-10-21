# LifeOS — Security Steering

## Principles

1. No secrets ever reach the client bundle
2. All inputs validated with Zod before processing
3. All database queries go through Prisma (parameterized)
4. MCP server requires bearer token on every request
5. Auth boundaries enforced at the API route level, not just the UI
6. Demo mode is explicitly isolated — it cannot modify production data

## Environment Variables

- All secrets in `.env.local` (never committed)
- `.env.example` committed with placeholder values only
- No `process.env.*` usage in `apps/web/src/components/` or client code
- Server-only env vars prefixed by convention or enforced by Next.js `server-only`

## Authentication

### Demo Mode (Local Development)

- Demo user automatically signed in when `DEMO_MODE=true`
- Demo user ID fixed in seed data
- No real OAuth required
- Session token issued as a simple signed JWT

### Production

- NextAuth.js with OAuth 2.1 provider
- PKCE S256 code challenge
- Sessions stored server-side
- Refresh token rotation

### MCP Server Authentication

- Every request to MCP server requires `Authorization: Bearer <MCP_SECRET>`
- `MCP_SECRET` is a 32+ character random string from env
- MCP server rejects requests with 401 if token missing or invalid
- For Alexa+ integration: designed toward OAuth 2.1 Bearer token per MCP spec

## Input Validation

- All MCP tool inputs validated with Zod schemas before execution
- All API route bodies validated with Zod
- Validation errors return 400 with field-level messages (never 500)
- No user-controlled values interpolated into raw SQL

## Output Safety

- Agent responses never include: API keys, DB connection strings, internal prompts
- LLM chain-of-thought is stripped before returning to client
- Only structured action summaries are surfaced
- Error messages to users are human-readable and non-leaking

## HTTP Security

- `Content-Security-Policy` header set in `next.config.js`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- CORS on MCP server: origin whitelist via env var
- Rate limiting: 60 req/min per IP on agent endpoints (express-rate-limit)

## Database Security

- Prisma with parameterized queries only
- No raw SQL with user input
- Row-level: all queries scoped to `userId` — never return cross-user data
- Soft deletes on tasks/events (no hard deletes from agent without confirmation)

## Logging Safety

Never log:

- Passwords
- Access tokens (`Authorization` header values)
- API keys
- Full request bodies if they may contain credentials

Always log (structured JSON):

- `requestId`
- `userId` (hashed/anonymized in prod)
- `tool`
- `latencyMs`
- `status`
- `errorCode` (not full stack trace to user)

## MCP-Specific Security

- Tool descriptions must not reveal internal system architecture
- Tool outputs must not include: DB internals, other users' data, system paths
- `execute_plan` must validate each sub-action before execution
- Destructive operations (delete_task) require explicit `confirm: true` in input

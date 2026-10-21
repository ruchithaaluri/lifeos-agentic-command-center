# LifeOS — Testing Steering

## Test Stack

| Layer              | Tool                |
| ------------------ | ------------------- |
| Unit / Integration | Vitest              |
| E2E                | Playwright          |
| MCP protocol       | Vitest + MCP client |
| Type checking      | tsc --noEmit        |

## Test File Conventions

- Unit/integration tests: `*.test.ts` alongside source
- E2E tests: `apps/web/e2e/*.spec.ts`
- MCP tests: `apps/mcp-server/src/__tests__/*.test.ts`
- Test utilities/fixtures: `packages/shared/src/test-fixtures.ts`

## Required Test Coverage

### MCP Server (apps/mcp-server)

- [ ] Server starts and responds to health check
- [ ] MCP initialize handshake succeeds
- [ ] Tool list returned correctly (12 tools)
- [ ] `get_tasks` — returns filtered tasks
- [ ] `create_task` — creates and returns task
- [ ] `update_task` — updates and returns task
- [ ] `delete_task` — requires confirm:true, soft deletes
- [ ] `get_schedule` — returns events for date range
- [ ] `create_event` — creates calendar event
- [ ] `move_event` — updates event start/end
- [ ] `get_projects` — returns projects with task counts
- [ ] `search_context` — returns relevant results
- [ ] `analyze_day` — returns conflict/deadline analysis
- [ ] `generate_plan` — returns structured plan
- [ ] `execute_plan` — executes sub-actions, returns summary
- [ ] Tool input validation (Zod) — rejects invalid input
- [ ] Auth boundary — rejects requests without bearer token
- [ ] Error handling — tool failures return MCP error response

### AI Layer (packages/ai)

- [ ] AgentOrchestrator parses simple goal correctly
- [ ] AgentOrchestrator calls correct tools for demo scenario
- [ ] AgentOrchestrator handles tool failure gracefully

### Database (packages/database)

- [ ] Prisma client connects
- [ ] Seed script populates expected demo records
- [ ] Task CRUD round-trip
- [ ] Event CRUD round-trip

### API Routes (apps/web)

- [ ] POST /api/agent/chat returns 400 on missing goal
- [ ] POST /api/agent/chat returns session ID
- [ ] GET /api/agent/stream/[id] returns SSE stream
- [ ] Auth guard returns 401 when not authenticated

### E2E (Playwright)

- [ ] Landing page loads and CTA navigates to dashboard
- [ ] Dashboard shows demo data after seeding
- [ ] Submitting "Prepare me for tomorrow's product demo" triggers agent
- [ ] Agent activity panel shows tool calls
- [ ] Plan view updates after agent completes
- [ ] Alexa simulator page loads and accepts input
- [ ] Demo reset button clears and re-seeds state

## Full E2E Scenario

```
1. Open http://localhost:3000 in demo mode
2. Navigate to /dashboard
3. Verify seeded tasks/events visible
4. Enter: "Prepare me for tomorrow's product demo."
5. Verify SSE stream starts
6. Verify agent activity panel shows: retrieve, plan, execute steps
7. Verify new tasks created in database
8. Verify dashboard task list updates
9. Verify plan view shows time-blocked schedule
10. Enter: "I only have 90 minutes tonight. Rebuild my plan."
11. Verify plan updates with shorter blocks
12. Click "Reset Demo"
13. Verify data returns to seed state
```

## Running Tests

```bash
# All unit/integration tests
pnpm test

# Watch mode
pnpm test:watch

# MCP tests only
pnpm --filter mcp-server test

# E2E tests (requires running dev server)
pnpm test:e2e

# Type check all packages
pnpm typecheck

# Lint all packages
pnpm lint
```

## CI Requirements

All of the following must pass before merge:

1. `pnpm typecheck` — zero TypeScript errors
2. `pnpm lint` — zero ESLint errors
3. `pnpm test` — all unit/integration tests pass
4. `pnpm build` — production build succeeds
5. E2E optional in CI (requires DB), run locally before submission

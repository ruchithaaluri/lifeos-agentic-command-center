# LifeOS — Product Steering

## Product Overview

LifeOS is an agentic personal command center built for the 2026 Amazon Developer Hackathon (Alexa+ track).

**Tagline:** "An agentic AI command center that turns natural-language requests into intelligent plans, real actions, and real-time updates across your digital life."

## Core Value Proposition

The user states a goal in natural language. LifeOS:

1. Understands the goal
2. Retrieves relevant context (tasks, calendar, projects, notes)
3. Reasons about priorities and conflicts
4. Generates a realistic, time-blocked plan
5. Executes appropriate actions through MCP tools
6. Updates the database and application state
7. Shows what changed, what was done, and why
8. Allows the user to modify the plan conversationally

## What LifeOS Is NOT

- Not a chatbot. Chat is one input surface. The main interface is a dynamic command center/dashboard.
- Not a to-do app. Tasks are context, not the product.
- Not a calendar app. The calendar is one data source among many.
- Not a generic SaaS template. The UI must feel premium and purpose-built.

## Primary User Journey

```
Natural language input
→ Intent parsing
→ Context retrieval (MCP tools)
→ Planning (LLM + agent)
→ Tool execution (MCP tools)
→ Database update
→ Real-time UI update
→ Explanation of what changed
```

## Demo Scenario (Hackathon)

**Fictional user:** Alex Chen
**Scenario:** Product demo is tomorrow at 10 AM. Slides are unfinished. Two meetings today.

**Suggested prompts:**

1. "Prepare me for tomorrow's product demo."
2. "What should I work on right now?"
3. "I only have 90 minutes tonight. Rebuild my plan."
4. "What am I forgetting?"
5. "Move my practice session to 8 PM."

## Pages

| Route        | Purpose             |
| ------------ | ------------------- |
| `/`          | Landing page        |
| `/dashboard` | Main command center |
| `/today`     | Today's focus view  |
| `/tasks`     | Task management     |
| `/calendar`  | Calendar view       |
| `/projects`  | Project overview    |
| `/activity`  | Agent activity log  |
| `/alexa`     | Alexa+ simulator    |
| `/settings`  | Settings            |

## Demo Mode

Demo mode must:

- Load immediately with seeded data
- Provide suggested prompts
- Show tool calls in real time
- Update dashboard state
- Allow safe reset

## Visual Identity

- Premium dark/light hybrid productivity aesthetic
- Deep navy, electric blue, cyan, violet accents
- Soft glass panels, subtle gradients, thin borders
- Large whitespace, rounded cards, high-quality typography
- NOT a crypto dashboard
- NOT a generic SaaS template

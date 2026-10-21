# Contributing to LifeOS

Thank you for your interest in contributing to LifeOS! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

---

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:

- **Be respectful** - Treat everyone with respect and consideration
- **Be inclusive** - Welcome and support people of all backgrounds
- **Be collaborative** - Work together and help each other
- **Be professional** - Focus on what is best for the project and community

---

## Getting Started

### Prerequisites

Before you begin, ensure you have:

- **Node.js** 18 or higher
- **pnpm** 8 or higher (`npm install -g pnpm`)
- **Docker Desktop** (for PostgreSQL)
- **Git** for version control
- A code editor (VS Code recommended)

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/lifeos.git
   cd lifeos
   ```
3. Add upstream remote:
   ```bash
   git remote add upstream https://github.com/lifeos/lifeos.git
   ```

---

## Development Setup

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Start PostgreSQL:**

   ```bash
   docker compose up -d
   ```

3. **Run migrations and seed:**

   ```bash
   pnpm --filter @lifeos/database db:migrate
   pnpm --filter @lifeos/database db:seed
   ```

4. **Start development servers:**

   ```bash
   # Terminal 1: MCP Server
   pnpm --filter @lifeos/mcp-server dev

   # Terminal 2: Web App
   pnpm --filter @lifeos/web dev
   ```

5. **Verify setup:**
   - MCP Server: http://localhost:3001/health
   - Web App: http://localhost:3000

---

## Project Structure

```
lifeos/
├── packages/          # Shared packages
│   ├── shared/       # Zod schemas, types, errors
│   ├── database/     # Prisma schema and migrations
│   ├── ai/           # AI orchestration
│   └── ui/           # Design tokens
├── apps/             # Applications
│   ├── mcp-server/   # MCP server with tools
│   └── web/          # Next.js web app
├── docs/             # Documentation
└── .github/          # GitHub workflows
```

### Key Directories

- **`packages/shared/src/schemas/`** - Zod validation schemas
- **`packages/database/prisma/`** - Database schema and migrations
- **`packages/ai/src/orchestrator/`** - Agent orchestration logic
- **`apps/mcp-server/src/tools/`** - MCP tool implementations
- **`apps/web/src/app/`** - Next.js pages (App Router)
- **`apps/web/src/components/`** - React components

---

## Development Workflow

### Creating a New Branch

Always create a new branch for your work:

```bash
git checkout -b feature/my-new-feature
# or
git checkout -b fix/bug-description
```

Branch naming conventions:

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Adding or updating tests
- `chore/` - Maintenance tasks

### Making Changes

1. Make your changes in the appropriate files
2. Test your changes locally
3. Run linting and type checking:
   ```bash
   pnpm lint
   pnpm typecheck
   ```
4. Run tests:
   ```bash
   pnpm test
   ```
5. Commit your changes (see [Commit Messages](#commit-messages))

### Keeping Your Branch Updated

Regularly sync with upstream:

```bash
git fetch upstream
git rebase upstream/main
```

---

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode (`strict: true` in tsconfig)
- Define types explicitly (avoid `any`)
- Use interfaces for object shapes
- Use type aliases for unions and complex types

**Example:**

```typescript
// Good
interface User {
  id: string;
  email: string;
  name: string;
}

function getUser(id: string): Promise<User> {
  // Implementation
}

// Avoid
function getUser(id: any): any {
  // Implementation
}
```

### Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Use semicolons
- Max line length: 100 characters
- Use destructuring where appropriate
- Use arrow functions for callbacks

**Prettier** and **ESLint** enforce most rules automatically:

```bash
pnpm lint:fix
```

### Naming Conventions

- **Files:** `camelCase.ts` or `PascalCase.tsx` (for components)
- **Components:** `PascalCase` (e.g., `TaskList.tsx`)
- **Functions:** `camelCase` (e.g., `getTasks`)
- **Constants:** `UPPER_SNAKE_CASE` (e.g., `MAX_RETRIES`)
- **Types/Interfaces:** `PascalCase` (e.g., `TaskSchema`)

### Zod Schemas

Always define Zod schemas for data validation:

```typescript
import { z } from 'zod';

export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  status: z.enum(['todo', 'in_progress', 'completed']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  dueDate: z.string().datetime().optional(),
});

export type Task = z.infer<typeof TaskSchema>;
```

### React Components

- Use functional components with hooks
- Extract complex logic into custom hooks
- Keep components focused and single-purpose
- Use TypeScript for props

**Example:**

```typescript
interface TaskListProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export function TaskList({ tasks, onTaskClick }: TaskListProps) {
  return (
    <div>
      {tasks.map(task => (
        <TaskItem
          key={task.id}
          task={task}
          onClick={() => onTaskClick(task)}
        />
      ))}
    </div>
  );
}
```

### Database Changes

When modifying the database:

1. Edit `packages/database/prisma/schema.prisma`
2. Create migration:
   ```bash
   pnpm --filter @lifeos/database db:migrate --name my_change
   ```
3. Update seed script if needed
4. Regenerate Prisma Client:
   ```bash
   pnpm --filter @lifeos/database build
   ```

---

## Testing Guidelines

### Unit Tests

Write unit tests for:

- Zod schemas (validation logic)
- Utility functions
- Agent orchestration logic
- MCP tool handlers

**Example test:**

```typescript
import { describe, test, expect } from 'vitest';
import { TaskSchema } from './TaskSchema';

describe('TaskSchema', () => {
  test('validates valid task', () => {
    const result = TaskSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      title: 'Test Task',
      status: 'todo',
      priority: 'medium',
    });

    expect(result.success).toBe(true);
  });

  test('rejects invalid status', () => {
    const result = TaskSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      title: 'Test Task',
      status: 'invalid',
      priority: 'medium',
    });

    expect(result.success).toBe(false);
  });
});
```

### Integration Tests

Write integration tests for:

- MCP server endpoints
- Database operations
- API routes

### End-to-End Tests

Write E2E tests (Playwright) for:

- Critical user flows
- Page navigation
- Form submissions
- Data persistence

### Running Tests

```bash
# All tests
pnpm test

# Specific package
pnpm --filter @lifeos/shared test

# E2E tests
pnpm --filter @lifeos/web test:e2e

# Watch mode
pnpm test --watch
```

### Test Coverage

Aim for:

- **80%+ coverage** for core logic
- **100% coverage** for validation schemas
- **Critical paths covered** by E2E tests

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks
- `perf:` - Performance improvements

### Examples

```bash
feat(mcp-server): add delete_event tool

Implement new MCP tool for deleting calendar events with cascade
delete for related data.

Closes #123
```

```bash
fix(web): correct task status update in UI

Fixed bug where task status wasn't updating in the UI after
successful API call. Added optimistic update with rollback on failure.

Fixes #456
```

```bash
docs(readme): update installation instructions

Added troubleshooting section for common setup issues.
```

### Commit Best Practices

- Use present tense ("add feature" not "added feature")
- Use imperative mood ("move cursor to" not "moves cursor to")
- Keep subject line under 72 characters
- Reference issues and PRs in footer
- Explain _what_ and _why_, not _how_

---

## Pull Request Process

### Before Creating PR

1. Ensure all tests pass: `pnpm test`
2. Run linting: `pnpm lint:fix`
3. Run type checking: `pnpm typecheck`
4. Update documentation if needed
5. Rebase on latest main: `git rebase upstream/main`

### Creating PR

1. Push your branch to your fork:

   ```bash
   git push origin feature/my-feature
   ```

2. Create PR on GitHub with:
   - **Clear title** following commit convention
   - **Description** explaining changes
   - **Screenshots** for UI changes
   - **Related issues** linked
   - **Testing instructions**

### PR Template

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated
- [ ] Manual testing performed

## Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests pass locally

## Screenshots (if applicable)

## Related Issues

Closes #123
```

### Review Process

1. **Automated checks** run on PR creation
2. **Code review** by maintainers
3. **Address feedback** and push updates
4. **Approval** from at least one maintainer
5. **Merge** by maintainer (squash and merge)

---

## Reporting Bugs

### Before Reporting

1. Check if bug already reported in [Issues](https://github.com/lifeos/lifeos/issues)
2. Try to reproduce on latest version
3. Gather relevant information

### Bug Report Template

```markdown
**Describe the bug**
Clear description of what the bug is.

**To Reproduce**
Steps to reproduce:

1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen.

**Actual behavior**
What actually happened.

**Screenshots**
If applicable, add screenshots.

**Environment:**

- OS: [e.g., Windows 11, macOS 13]
- Browser: [e.g., Chrome 120, Safari 17]
- Node.js version: [e.g., 18.19.0]
- LifeOS version: [e.g., 1.0.0]

**Additional context**
Any other relevant information.

**Logs**
```

Paste relevant logs here

```

```

---

## Suggesting Features

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
Clear description of the problem.

**Describe the solution you'd like**
Clear description of what you want to happen.

**Describe alternatives you've considered**
Alternative solutions or features you've considered.

**Additional context**
Any other context, mockups, or examples.

**Use cases**
Describe specific use cases for this feature.
```

---

## Getting Help

If you need help:

1. Check the [Documentation](docs/)
2. Search [existing issues](https://github.com/lifeos/lifeos/issues)
3. Ask in [Discussions](https://github.com/lifeos/lifeos/discussions)
4. Create a new issue with your question

---

## Recognition

Contributors will be recognized in:

- Repository README
- Release notes
- Contributors page (coming soon)

---

Thank you for contributing to LifeOS! 🎉

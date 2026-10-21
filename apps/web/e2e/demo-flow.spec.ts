// ============================================================
// LifeOS End-to-End Tests (Playwright)
// Full scenario: landing → dashboard → agent → plan → reset
//
// Prerequisites:
//   - pnpm db:seed must have been run
//   - Web app running on http://localhost:3000
//   - MCP server running on http://localhost:3001
// ============================================================

import { test, expect } from '@playwright/test';

const BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000';

// ── Landing page ───────────────────────────────────────────────────────────

test.describe('Landing page', () => {
  test('loads and shows LifeOS hero', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('h1')).toContainText('LifeOS');
    await expect(page.getByText('Your AI Command Center')).toBeVisible();
  });

  test('CTA navigates to dashboard', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByRole('link', { name: 'Try LifeOS' }).first().click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('secondary CTA navigates to alexa page', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByRole('link', { name: /See the agent/i }).click();
    await expect(page).toHaveURL(/\/alexa/);
  });
});

// ── Dashboard ──────────────────────────────────────────────────────────────

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    // Wait for data to load
    await page.waitForLoadState('networkidle');
  });

  test('shows demo greeting', async ({ page }) => {
    await expect(page.getByText(/Good (morning|afternoon|evening), Alex/i)).toBeVisible();
  });

  test('shows seeded tasks', async ({ page }) => {
    await expect(page.getByText('Finish presentation slides')).toBeVisible();
  });

  test('shows seeded events', async ({ page }) => {
    await expect(page.getByText('Team Standup')).toBeVisible();
  });

  test('shows Ask LifeOS input', async ({ page }) => {
    await expect(page.getByRole('textbox', { name: /Ask LifeOS/i })).toBeVisible();
  });

  test('shows suggested demo prompts', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Prepare me for tomorrow/i })).toBeVisible();
  });

  test('sidebar navigation is visible', async ({ page }) => {
    await expect(page.getByRole('navigation', { name: /Main navigation/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Tasks/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Alexa\+/i })).toBeVisible();
  });

  test('Reset Demo button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Reset Demo/i })).toBeVisible();
  });
});

// ── Agent flow ─────────────────────────────────────────────────────────────

test.describe('Agent flow', () => {
  test('submitting a goal triggers agent activity panel', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('networkidle');

    const input = page.getByRole('textbox', { name: /Ask LifeOS/i });
    await input.fill('What should I work on right now?');
    await page.getByRole('button', { name: 'Send to LifeOS' }).click();

    // Agent panel should appear with at least one running action
    await expect(page.getByText('AI Agent')).toBeVisible({ timeout: 5000 });
  });

  test('clicking a demo prompt fills the input', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Prepare me for tomorrow/i }).click();
    const input = page.getByRole('textbox', { name: /Ask LifeOS/i });
    await expect(input).toHaveValue(/Prepare me for tomorrow/i);
  });
});

// ── Alexa simulator ────────────────────────────────────────────────────────

test.describe('Alexa simulator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/alexa`);
    await page.waitForLoadState('networkidle');
  });

  test('loads with LifeOS × Alexa+ header', async ({ page }) => {
    await expect(page.getByText('LifeOS × Alexa+')).toBeVisible();
  });

  test('shows MCP spec badge', async ({ page }) => {
    await expect(page.getByText('MCP spec 2025-11-25')).toBeVisible();
  });

  test('shows demo prompts', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Prepare me for tomorrow/i })).toBeVisible();
  });

  test('shows input field', async ({ page }) => {
    await expect(page.getByRole('textbox', { name: /Message LifeOS/i })).toBeVisible();
  });

  test('submitting a message adds it to conversation', async ({ page }) => {
    const input = page.getByRole('textbox', { name: /Message LifeOS/i });
    await input.fill('What are my urgent tasks?');
    await page.getByRole('button', { name: 'Send' }).click();

    // User message should appear in conversation
    await expect(page.getByText('What are my urgent tasks?')).toBeVisible({ timeout: 3000 });
  });

  test('Reset button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Reset/i })).toBeVisible();
  });
});

// ── Navigation ─────────────────────────────────────────────────────────────

test.describe('Navigation', () => {
  test('navigates to Tasks page', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole('link', { name: /Tasks/i }).click();
    await expect(page).toHaveURL(/\/tasks/);
    await expect(page.locator('h1')).toContainText('Tasks');
  });

  test('navigates to Projects page', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole('link', { name: /Projects/i }).click();
    await expect(page).toHaveURL(/\/projects/);
    await expect(page.locator('h1')).toContainText('Projects');
  });

  test('navigates to Today page', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole('link', { name: /Today/i }).click();
    await expect(page).toHaveURL(/\/today/);
    await expect(page.locator('h1')).toContainText('Today');
  });
});

// ── Demo reset ─────────────────────────────────────────────────────────────

test.describe('Demo reset', () => {
  test('reset button calls /api/demo/reset and re-renders data', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('networkidle');

    // Intercept the reset API call
    const [resetResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/demo/reset') && r.status() === 200),
      page.getByRole('button', { name: /Reset Demo/i }).click(),
    ]);

    expect(resetResponse.status()).toBe(200);
    // Data should still be visible after reset
    await expect(page.getByText('Finish presentation slides')).toBeVisible({ timeout: 5000 });
  });
});

// ── API routes ─────────────────────────────────────────────────────────────

test.describe('API routes', () => {
  test('GET /api/health returns 200', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/health`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  test('GET /api/tasks returns tasks array', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/tasks`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { tasks: unknown[] };
    expect(Array.isArray(body.tasks)).toBe(true);
  });

  test('GET /api/events returns events for today', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/events`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { events: unknown[] };
    expect(Array.isArray(body.events)).toBe(true);
  });

  test('GET /api/projects returns projects array', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/projects`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { projects: unknown[] };
    expect(Array.isArray(body.projects)).toBe(true);
  });

  test('POST /api/agent/chat returns 400 when goal is missing', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/agent/chat`, {
      data: {},
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/agent/chat returns sessionId when goal is provided', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/agent/chat`, {
      data: { goal: 'What should I do today?' },
    });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { sessionId: string };
    expect(typeof body.sessionId).toBe('string');
    expect(body.sessionId.length).toBeGreaterThan(0);
  });
});

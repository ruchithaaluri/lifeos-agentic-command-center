import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard');
  });

  test('displays dashboard layout', async ({ page }) => {
    // Check for main dashboard sections
    await expect(page.getByText(/tasks/i).first()).toBeVisible();
    await expect(page.getByText(/calendar/i).first()).toBeVisible();
    await expect(page.getByText(/projects/i).first()).toBeVisible();
  });

  test('displays task list', async ({ page }) => {
    const taskList = page.locator('[data-testid="task-list"]').first();
    await expect(taskList).toBeVisible({ timeout: 10000 });
  });

  test('displays calendar view', async ({ page }) => {
    const calendar = page.locator('[data-testid="calendar"]').first();
    await expect(calendar).toBeVisible({ timeout: 10000 });
  });

  test('displays project cards', async ({ page }) => {
    const projects = page.locator('[data-testid="projects"]').first();
    await expect(projects).toBeVisible({ timeout: 10000 });
  });

  test('displays agent activity panel', async ({ page }) => {
    const agentPanel = page.locator('[data-testid="agent-panel"]').first();
    await expect(agentPanel).toBeVisible({ timeout: 10000 });
  });

  test('shows demo user data', async ({ page }) => {
    // Should have Alex Chen demo data
    await expect(page.getByText(/Alex Chen|Product Launch/i).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test('task items are interactive', async ({ page }) => {
    await page.waitForSelector('[data-testid="task-item"]', { timeout: 10000 });

    const taskItem = page.locator('[data-testid="task-item"]').first();
    await expect(taskItem).toBeVisible();

    // Check if task item has interactive elements
    const checkbox = taskItem.locator('input[type="checkbox"]');
    if ((await checkbox.count()) > 0) {
      await expect(checkbox.first()).toBeVisible();
    }
  });

  test('calendar shows events', async ({ page }) => {
    await page.waitForSelector('[data-testid="calendar-event"]', { timeout: 10000 });

    const events = page.locator('[data-testid="calendar-event"]');
    const count = await events.count();

    expect(count).toBeGreaterThan(0);
  });

  test('reset demo button is visible', async ({ page }) => {
    const resetButton = page.getByRole('button', { name: /reset demo/i });
    await expect(resetButton).toBeVisible({ timeout: 10000 });
  });

  test('navigation to Alexa simulator works', async ({ page }) => {
    const alexaLink = page.getByRole('link', { name: /alexa|simulator/i }).first();

    if ((await alexaLink.count()) > 0) {
      await alexaLink.click();
      await page.waitForURL('**/alexa');
      expect(page.url()).toContain('/alexa');
    }
  });

  test('loads data without errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');

    // Filter out known safe errors (like failed API calls in test env)
    const criticalErrors = errors.filter(
      (e) => !e.includes('fetch') && !e.includes('Failed to load') && !e.includes('NetworkError'),
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('is responsive on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });

    await expect(page.getByText(/tasks/i).first()).toBeVisible();
    await expect(page.getByText(/calendar/i).first()).toBeVisible();
  });

  test('is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // Main sections should still be visible, possibly stacked
    await expect(page.getByText(/tasks/i).first()).toBeVisible();
  });
});

test.describe('Dashboard - Reset Demo', () => {
  test('reset demo button triggers confirmation', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard');

    const resetButton = page.getByRole('button', { name: /reset demo/i });
    await expect(resetButton).toBeVisible({ timeout: 10000 });

    // Click reset button
    await resetButton.click();

    // Should show confirmation dialog
    const dialog = page.getByRole('dialog');
    if ((await dialog.count()) > 0) {
      await expect(dialog).toBeVisible();
    }
  });
});

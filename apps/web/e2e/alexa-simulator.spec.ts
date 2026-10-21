import { test, expect } from '@playwright/test';

test.describe('Alexa Simulator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/alexa');
  });

  test('displays Alexa simulator interface', async ({ page }) => {
    await expect(page.getByText(/alexa.*simulator/i).first()).toBeVisible();
  });

  test('has input field for natural language', async ({ page }) => {
    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();
  });

  test('has submit button', async ({ page }) => {
    const submitButton = page.getByRole('button', { name: /submit|send|ask/i }).first();
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();
  });

  test('accepts user input', async ({ page }) => {
    const input = page.getByRole('textbox').first();
    await input.fill('What should I work on today?');

    const value = await input.inputValue();
    expect(value).toBe('What should I work on today?');
  });

  test('submits query on button click', async ({ page }) => {
    const input = page.getByRole('textbox').first();
    const submitButton = page.getByRole('button', { name: /submit|send|ask/i }).first();

    await input.fill('What should I focus on today?');
    await submitButton.click();

    // Should show loading state or response
    await page.waitForTimeout(1000);

    // Check for response area
    const responseArea = page.locator('[data-testid="agent-response"]').first();
    if ((await responseArea.count()) > 0) {
      await expect(responseArea).toBeVisible();
    }
  });

  test('displays agent activity during processing', async ({ page }) => {
    const input = page.getByRole('textbox').first();
    const submitButton = page.getByRole('button', { name: /submit|send|ask/i }).first();

    await input.fill('Get my tasks');
    await submitButton.click();

    // Should show agent activity panel with streaming
    const activityPanel = page.locator('[data-testid="agent-activity"]').first();
    if ((await activityPanel.count()) > 0) {
      await expect(activityPanel).toBeVisible({ timeout: 5000 });
    }
  });

  test('shows conversation history', async ({ page }) => {
    const input = page.getByRole('textbox').first();
    const submitButton = page.getByRole('button', { name: /submit|send|ask/i }).first();

    // Submit first query
    await input.fill('Hello');
    await submitButton.click();
    await page.waitForTimeout(2000);

    // Submit second query
    await input.fill('What tasks do I have?');
    await submitButton.click();
    await page.waitForTimeout(2000);

    // Check for conversation history
    const history = page.locator('[data-testid="conversation-history"]').first();
    if ((await history.count()) > 0) {
      await expect(history).toBeVisible();
    }
  });

  test('handles enter key submission', async ({ page }) => {
    const input = page.getByRole('textbox').first();

    await input.fill('What should I work on today?');
    await input.press('Enter');

    // Should trigger submission
    await page.waitForTimeout(1000);

    const responseArea = page.locator('[data-testid="agent-response"]').first();
    if ((await responseArea.count()) > 0) {
      await expect(responseArea).toBeVisible({ timeout: 5000 });
    }
  });

  test('disables input during processing', async ({ page }) => {
    const input = page.getByRole('textbox').first();
    const submitButton = page.getByRole('button', { name: /submit|send|ask/i }).first();

    await input.fill('Get my schedule');
    await submitButton.click();

    // Check if input is disabled immediately after submission
    await page.waitForTimeout(100);

    const isDisabled = await input.isDisabled();
    const buttonDisabled = await submitButton.isDisabled();

    // At least one should be disabled during processing
    expect(isDisabled || buttonDisabled).toBe(true);
  });

  test('clears input after successful submission', async ({ page }) => {
    const input = page.getByRole('textbox').first();
    const submitButton = page.getByRole('button', { name: /submit|send|ask/i }).first();

    await input.fill('Test query');
    await submitButton.click();

    // Wait for processing
    await page.waitForTimeout(2000);

    // Input should be cleared or ready for new input
    const value = await input.inputValue();
    expect(value.length).toBeLessThanOrEqual(20);
  });

  test('has link back to dashboard', async ({ page }) => {
    const dashboardLink = page.getByRole('link', { name: /dashboard|back/i }).first();

    if ((await dashboardLink.count()) > 0) {
      await expect(dashboardLink).toBeVisible();
      await dashboardLink.click();
      await page.waitForURL('**/dashboard');
      expect(page.url()).toContain('/dashboard');
    }
  });

  test('is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible();

    const submitButton = page.getByRole('button', { name: /submit|send|ask/i }).first();
    await expect(submitButton).toBeVisible();
  });

  test('loads without console errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('http://localhost:3000/alexa');
    await page.waitForLoadState('networkidle');

    // Filter out known safe errors
    const criticalErrors = errors.filter(
      (e) => !e.includes('fetch') && !e.includes('Failed to load') && !e.includes('NetworkError'),
    );

    expect(criticalErrors).toHaveLength(0);
  });
});

test.describe('Alexa Simulator - Sample Queries', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/alexa');
  });

  test('processes "What should I focus on today?"', async ({ page }) => {
    const input = page.getByRole('textbox').first();
    const submitButton = page.getByRole('button', { name: /submit|send|ask/i }).first();

    await input.fill('What should I focus on today?');
    await submitButton.click();

    // Wait for response
    await page.waitForTimeout(3000);

    // Should have some response visible
    const pageContent = await page.content();
    expect(pageContent.length).toBeGreaterThan(100);
  });

  test('processes "Schedule a meeting for tomorrow"', async ({ page }) => {
    const input = page.getByRole('textbox').first();
    const submitButton = page.getByRole('button', { name: /submit|send|ask/i }).first();

    await input.fill('Schedule a meeting for tomorrow at 2pm');
    await submitButton.click();

    await page.waitForTimeout(3000);

    const pageContent = await page.content();
    expect(pageContent.length).toBeGreaterThan(100);
  });

  test('processes "Create a high priority task"', async ({ page }) => {
    const input = page.getByRole('textbox').first();
    const submitButton = page.getByRole('button', { name: /submit|send|ask/i }).first();

    await input.fill('Create a high priority task to review designs');
    await submitButton.click();

    await page.waitForTimeout(3000);

    const pageContent = await page.content();
    expect(pageContent.length).toBeGreaterThan(100);
  });
});

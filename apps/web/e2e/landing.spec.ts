import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });

  test('has correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/LifeOS/i);
  });

  test('displays hero section', async ({ page }) => {
    const hero = page.locator('h1').first();
    await expect(hero).toBeVisible();
    await expect(hero).toContainText(/AI.*Life Management/i);
  });

  test('displays CTA button', async ({ page }) => {
    const ctaButton = page.getByRole('link', { name: /Get Started|Try Demo/i });
    await expect(ctaButton).toBeVisible();
  });

  test('CTA button navigates to dashboard', async ({ page }) => {
    const ctaButton = page.getByRole('link', { name: /Get Started|Try Demo/i }).first();
    await ctaButton.click();

    await page.waitForURL('**/dashboard');
    expect(page.url()).toContain('/dashboard');
  });

  test('displays features section', async ({ page }) => {
    const featuresSection = page.getByText(/features/i).first();
    await expect(featuresSection).toBeVisible();
  });

  test('displays key features list', async ({ page }) => {
    await expect(page.getByText(/task.*management/i).first()).toBeVisible();
    await expect(page.getByText(/calendar/i).first()).toBeVisible();
    await expect(page.getByText(/AI.*agent/i).first()).toBeVisible();
  });

  test('is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const hero = page.locator('h1').first();
    await expect(hero).toBeVisible();

    const ctaButton = page.getByRole('link', { name: /Get Started|Try Demo/i }).first();
    await expect(ctaButton).toBeVisible();
  });

  test('has accessible navigation', async ({ page }) => {
    const nav = page.getByRole('navigation');
    await expect(nav).toBeVisible();
  });

  test('loads without console errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    expect(errors).toHaveLength(0);
  });
});

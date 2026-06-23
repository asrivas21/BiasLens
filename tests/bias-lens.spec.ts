import { test, expect } from '@playwright/test';

test.describe('Article analysis', () => {
  test('loads and renders the main input', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /read between the lines/i })).toBeVisible();
    await expect(page.getByPlaceholder(/paste a passage/i)).toBeVisible();
  });

  test('tab toggle switches to short-form view', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: /short.form/i }).click();
    await expect(page.getByPlaceholder(/tiktok/i)).toBeVisible();
  });

  test('shows error for unsupported short-form URL', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: /short.form/i }).click();
    await page.getByPlaceholder(/tiktok/i).fill('https://example.com/not-a-video');
    await page.getByRole('button', { name: /analyze video/i }).click();
    await expect(page.getByText(/invalid|unsupported/i)).toBeVisible({ timeout: 5_000 });
  });

  test('analyze button is disabled when input is empty', async ({ page }) => {
    await page.goto('/');
    const btn = page.getByRole('button', { name: /^analyze$/i });
    await expect(btn).toBeDisabled();
  });

  test('sign in page is accessible', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await expect(page.getByPlaceholder(/you@example\.com/i)).toBeVisible();
  });

  test('history page redirects unauthenticated users to sign-in', async ({ page }) => {
    await page.goto('/history');
    await expect(page).toHaveURL(/sign-in/);
  });
});

import { test, expect } from '@playwright/test';
import { waitForConsoleReady, screenshot, setupConsoleErrorCapture } from './helpers';

test.describe('Smoke Test', () => {
  test('console loads and renders navigation', async ({ page }) => {
    const errors = setupConsoleErrorCapture(page);

    await waitForConsoleReady(page);
    await screenshot(page, 'smoke-initial-load');

    // Verify the shell rendered
    await expect(page.locator('.v2-shell')).toBeVisible();

    // Verify nav tabs exist
    const navTabs = page.locator('.v2-nav-tab');
    const tabCount = await navTabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(5);

    // Verify brand is present
    await expect(page.locator('.v2-brand-text')).toContainText('nexus');

    // No critical JS errors
    const criticalErrors = errors.filter(e =>
      !e.includes('favicon') && !e.includes('WebSocket')
    );
    expect(criticalErrors).toHaveLength(0);
  });
});

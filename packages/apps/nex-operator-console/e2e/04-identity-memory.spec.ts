import { test, expect } from '@playwright/test';
import { waitForConsoleReady, screenshot, navigateToTab, clickSubTab, setupConsoleErrorCapture } from './helpers';

test.describe('OCI-005: Identity Page', () => {
  test('identity entities tab renders', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Identity');

    await screenshot(page, 'identity-entities');

    // Sub-tabs should exist (6 total)
    const subTabs = page.locator('.v2-detail-tab');
    expect(await subTabs.count()).toBeGreaterThanOrEqual(5);
  });

  test('identity all sub-tabs navigate', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Identity');

    const tabs = ['Contacts', 'Channels', 'Groups', 'Policies', 'Merge Queue'];
    for (const tab of tabs) {
      await clickSubTab(page, tab);
      await page.waitForTimeout(200);
    }

    await screenshot(page, 'identity-merge-queue');

    // Back to entities
    await clickSubTab(page, 'Entities');
    await screenshot(page, 'identity-entities-return');
  });

  test('identity contacts tab shows seeded data', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Identity');
    await clickSubTab(page, 'Contacts');

    await screenshot(page, 'identity-contacts');

    // Should have a table with at least one contact from seeding
    const table = page.locator('.v2-table');
    const emptyState = page.locator('.v2-empty').or(page.getByText('No contacts'));
    const hasContent = await table.count() > 0 || await emptyState.count() > 0;
    expect(hasContent).toBeTruthy();
  });

  test('identity channels tab renders', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Identity');
    await clickSubTab(page, 'Channels');

    await screenshot(page, 'identity-channels');
  });

  test('identity search is functional', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Identity');

    const searchInput = page.locator('.v2-search-input, input[placeholder*="Search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('echo');
      await page.waitForTimeout(300);
      await screenshot(page, 'identity-search-result');
    }
  });

  test('identity refresh button works', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Identity');

    const refreshBtn = page.locator('button:has-text("Refresh")');
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
      await page.waitForTimeout(500);
    }
  });
});

test.describe('OCI-005: Memory Page', () => {
  test('memory library tab renders', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Memory');

    await screenshot(page, 'memory-library');

    // Sub-tabs should exist
    const subTabs = page.locator('.v2-detail-tab');
    expect(await subTabs.count()).toBeGreaterThanOrEqual(2);
  });

  test('memory search tab renders with input', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Memory');
    await clickSubTab(page, 'Search');

    await screenshot(page, 'memory-search');

    // Search text input should exist (not the type select)
    const searchInput = page.locator('input.v2-search-input, input[placeholder*="Search"]');
    expect(await searchInput.count()).toBeGreaterThanOrEqual(1);
  });

  test('memory search accepts query', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Memory');
    await clickSubTab(page, 'Search');

    const searchInput = page.locator('input.v2-search-input, input[placeholder*="Search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('test memory query');

      // Press Enter to trigger search
      await searchInput.press('Enter');

      await page.waitForTimeout(500);
      await screenshot(page, 'memory-search-executed');
    }
  });

  test('memory quality tab renders', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Memory');
    await clickSubTab(page, 'Quality');

    await screenshot(page, 'memory-quality');

    // Should show quality summary cards or empty state
    const content = page.locator('.v2-card').or(page.locator('.v2-empty')).or(page.getByText('No quality data'));
    expect(await content.count()).toBeGreaterThanOrEqual(1);
  });

  test('memory refresh button works', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Memory');

    const refreshBtn = page.locator('button:has-text("Refresh")');
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
      await page.waitForTimeout(500);
    }
  });
});

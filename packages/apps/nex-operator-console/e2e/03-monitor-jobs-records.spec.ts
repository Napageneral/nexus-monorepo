import { test, expect } from '@playwright/test';
import { waitForConsoleReady, screenshot, navigateToTab, clickSubTab, setupConsoleErrorCapture } from './helpers';

test.describe('OCI-004: Monitor Page', () => {
  test('monitor live tab renders with stat cards', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Monitor');

    await screenshot(page, 'monitor-live');

    // Stat cards should be visible
    const statCards = page.locator('.v2-card');
    expect(await statCards.count()).toBeGreaterThanOrEqual(3);

    // Filter pills should exist
    const filterPills = page.locator('.v2-filter-pill, button:has-text("All")');
    expect(await filterPills.count()).toBeGreaterThanOrEqual(1);
  });

  test('monitor filter pills are interactive', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Monitor');

    // Click a filter pill
    const readPill = page.locator('.v2-filter-pill:has-text("Read"), button:has-text("Read")');
    if (await readPill.isVisible()) {
      await readPill.click();
      await page.waitForTimeout(200);
    }

    const writePill = page.locator('.v2-filter-pill:has-text("Write"), button:has-text("Write")');
    if (await writePill.isVisible()) {
      await writePill.click();
      await page.waitForTimeout(200);
    }

    // Click back to All
    const allPill = page.locator('.v2-filter-pill:has-text("All"), button:has-text("All")').first();
    if (await allPill.isVisible()) {
      await allPill.click();
    }
  });

  test('monitor history tab renders', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Monitor');

    await clickSubTab(page, 'History');
    await screenshot(page, 'monitor-history');

    // Search input should exist
    const search = page.locator('.v2-search-input, input[placeholder*="Filter"]');
    expect(await search.count()).toBeGreaterThanOrEqual(1);
  });

  test('monitor pause/clear buttons work', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Monitor');

    const pauseBtn = page.locator('button:has-text("Pause")');
    if (await pauseBtn.isVisible()) {
      await pauseBtn.click();
      await page.waitForTimeout(200);
      // Should now say "Resume"
      await expect(page.locator('button:has-text("Resume")')).toBeVisible();
    }

    const clearBtn = page.locator('button:has-text("Clear")');
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await page.waitForTimeout(200);
    }
  });
});

test.describe('OCI-004: Jobs Page', () => {
  test('jobs overview tab renders with stat cards', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Jobs');

    await screenshot(page, 'jobs-overview');

    // Sub-tabs should exist
    const subTabs = page.locator('.v2-detail-tab');
    expect(await subTabs.count()).toBeGreaterThanOrEqual(4);
  });

  test('jobs sub-tabs all navigate', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Jobs');

    for (const tab of ['Definitions', 'Queue', 'Runs', 'Schedules']) {
      await clickSubTab(page, tab);
      await page.waitForTimeout(200);
    }

    await screenshot(page, 'jobs-schedules');

    // Back to overview
    await clickSubTab(page, 'Overview');
    await screenshot(page, 'jobs-overview-return');
  });

  test('jobs definitions tab shows table', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Jobs');
    await clickSubTab(page, 'Definitions');

    await screenshot(page, 'jobs-definitions');

    // Should have a table or empty state
    const table = page.locator('.v2-table');
    const emptyState = page.locator('.v2-empty').or(page.getByText('No job definitions'));
    expect(await table.count() > 0 || await emptyState.count() > 0).toBeTruthy();
  });
});

test.describe('OCI-004: Records Page', () => {
  test('records browse tab renders with filters', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Records');

    await screenshot(page, 'records-browse');

    // Sub-tabs
    const subTabs = page.locator('.v2-detail-tab');
    expect(await subTabs.count()).toBeGreaterThanOrEqual(2);
  });

  test('records sub-tabs navigate', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Records');

    await clickSubTab(page, 'Channels');
    await page.waitForTimeout(200);
    await screenshot(page, 'records-channels');

    await clickSubTab(page, 'Search');
    await page.waitForTimeout(200);
    await screenshot(page, 'records-search');
  });

  test('records search input accepts text', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Records');
    await clickSubTab(page, 'Search');

    const searchInput = page.locator('.v2-search-input, input[placeholder*="Search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('test query');
      await page.waitForTimeout(200);
      await screenshot(page, 'records-search-filled');
    }
  });
});

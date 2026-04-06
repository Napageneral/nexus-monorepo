import { test, expect } from '@playwright/test';
import { waitForConsoleReady, navigateToTab, clickSubTab, screenshot } from './helpers';

const runtimeBacked = process.env.E2E_REQUIRE_RUNTIME === '1';

test.describe('Runtime-backed operator console proof', () => {
  test.skip(!runtimeBacked, 'runtime-backed assertions only run when E2E_REQUIRE_RUNTIME=1');

  test('connects to the seeded runtime and renders seeded agents', async ({ page }) => {
    await waitForConsoleReady(page);

    const connected = await page.evaluate(() => {
      const app = document.querySelector('nexus-app') as
        | { connected?: boolean; lastError?: string | null }
        | null;
      return {
        connected: app?.connected === true,
        lastError: app?.lastError ?? null,
      };
    });
    expect(connected).toEqual({ connected: true, lastError: null });

    await navigateToTab(page, 'Agents');
    await expect(page.getByText('test-agent-alpha')).toBeVisible();
    await expect(page.getByText('test-agent-beta')).toBeVisible();
    await screenshot(page, 'runtime-backed-agents');
  });

  test('shows runtime-backed schedules and recent operation history', async ({ page }) => {
    await waitForConsoleReady(page);

    await navigateToTab(page, 'Jobs');
    await clickSubTab(page, 'Schedules');
    await expect(page.getByText('cleanroom-browser-schedule')).toBeVisible();
    await screenshot(page, 'runtime-backed-schedules');

    await navigateToTab(page, 'Monitor');
    await clickSubTab(page, 'History');
    await expect(page.getByText('Loading...')).toBeHidden({ timeout: 15000 });
    await expect
      .poll(async () => await page.locator('.console-table tbody tr, .v2-table tbody tr').count(), {
        timeout: 15000,
      })
      .toBeGreaterThan(0);
    await screenshot(page, 'runtime-backed-monitor-history');
  });

  test('creates an agent through the runtime-backed UI and shows it in the agents list', async ({ page }) => {
    await waitForConsoleReady(page);

    const agentName = `Runtime Proof Agent ${Date.now()}`;

    await navigateToTab(page, 'Agents');

    const createBtn = page.locator('button:has-text("Create agent"), button:has-text("Create")');
    await createBtn.first().click();

    const nameInput = page.locator('input[placeholder="e.g. Sales Assistant"]').first();
    await expect(nameInput).toBeVisible();
    await nameInput.fill(agentName);

    const nextBtn = page.locator('button:has-text("Next")');
    await nextBtn.click();
    await nextBtn.click();
    await nextBtn.click();

    await expect(page.getByText(agentName)).toBeVisible();

    const createFinalBtn = page.locator('button:has-text("Create agent"), button:has-text("Create")').last();
    await createFinalBtn.click();

    await expect(page.getByText(agentName)).toBeVisible({ timeout: 15000 });
    await screenshot(page, 'runtime-backed-agent-created-detail');

    await page.locator('button[title="Back to agents"]').click();

    await expect
      .poll(async () => await page.getByText(agentName).count(), {
        timeout: 15000,
      })
      .toBeGreaterThan(0);
    await screenshot(page, 'runtime-backed-agent-created-list');
  });
});

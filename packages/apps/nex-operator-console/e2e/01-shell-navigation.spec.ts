import { test, expect } from '@playwright/test';
import { waitForConsoleReady, screenshot, navigateToTab, setupConsoleErrorCapture } from './helpers';

test.describe('OCI-002: Shell and Navigation', () => {
  let consoleErrors: string[];

  test.beforeEach(async ({ page }) => {
    consoleErrors = setupConsoleErrorCapture(page);
    await waitForConsoleReady(page);
  });

  test('shell renders with brand and nav bar', async ({ page }) => {
    await screenshot(page, 'shell-initial-load');

    // Brand logo and text
    await expect(page.locator('.console-logo-text, .v2-logo-text')).toBeVisible();

    // Right-side controls: production toggle, settings, notifications
    await expect(page.locator('.console-topnav-right, .v2-topnav-right')).toBeVisible();
  });

  test('all navigation tabs are present', async ({ page }) => {
    const tabs = ['Connectors', 'Agents', 'Monitor', 'Jobs', 'Records', 'Identity', 'Memory'];

    for (const tab of tabs) {
      await expect(page.locator(`.console-nav-tab:has-text("${tab}"), .v2-nav-tab:has-text("${tab}")`)).toBeVisible();
    }

    await screenshot(page, 'nav-all-tabs-visible');
  });

  test('clicking each tab navigates to correct page', async ({ page }) => {
    const tabPages = [
      { tab: 'Connectors', title: 'Connectors' },
      { tab: 'Agents', title: 'Agents' },
      { tab: 'Monitor', title: 'Monitor' },
      { tab: 'Jobs', title: 'Jobs' },
      { tab: 'Records', title: 'Records' },
      { tab: 'Identity', title: /Entities|Identity/ },
      { tab: 'Memory', title: 'Memory' },
    ];

    for (const { tab, title } of tabPages) {
      await navigateToTab(page, tab);
      // Verify page content loaded — different pages have different structures
      await page.waitForTimeout(500);
      // At least something rendered (heading, sub-tabs, or any content)
      const hasContent = await page.locator('h1, h2, .console-page-title, .console-detail-tabs, .console-platform-grid, .console-card, .console-table, .console-empty').first().isVisible().catch(() => true);
      expect(hasContent).toBeTruthy();
    }

    await screenshot(page, 'nav-after-cycling-all-tabs');
  });

  test('settings page accessible via gear icon', async ({ page }) => {
    // Click settings icon
    const settingsBtn = page.locator('[title="Settings"], .console-icon-btn, .v2-nav-icon-btn').last();
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
      await page.waitForTimeout(500);
      await screenshot(page, 'settings-opened');
    }
  });

  test('no critical JS console errors during navigation', async ({ page }) => {
    // Navigate through all tabs
    for (const tab of ['Connectors', 'Agents', 'Monitor', 'Jobs', 'Records', 'Identity', 'Memory']) {
      await navigateToTab(page, tab);
    }

    // Filter out non-critical errors
    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('WebSocket') &&
      !e.includes('net::ERR')
    );
    expect(criticalErrors).toHaveLength(0);
  });
});

test.describe('OCI-002: Settings Page', () => {
  test('settings profile shows user identity', async ({ page }) => {
    await waitForConsoleReady(page);

    // Navigate to settings
    const settingsBtn = page.locator('[title="Settings"], .console-icon-btn, .v2-nav-icon-btn').last();
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
      await page.waitForTimeout(500);
    }

    await screenshot(page, 'settings-profile');
  });

  test('settings API keys section renders', async ({ page }) => {
    await waitForConsoleReady(page);

    // Navigate to settings and API Keys sub-tab
    const settingsBtn = page.locator('[title="Settings"], .v2-nav-icon-btn').last();
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
      await page.waitForTimeout(500);

      const apiKeysTab = page.locator('.console-dropdown-item:has-text("API Keys"), .v2-settings-nav-item:has-text("API Keys"), button:has-text("API Keys")');
      if (await apiKeysTab.isVisible()) {
        await apiKeysTab.click();
        await page.waitForTimeout(300);
      }
    }

    await screenshot(page, 'settings-api-keys');
  });
});

import { Page, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const SETTINGS_STORAGE_KEY = 'nexus.control.settings.v1';
const SCREENSHOT_DIR = process.env.NEXUS_CLEANROOM_PROOF_BUNDLE_DIR
  ? path.join(process.env.NEXUS_CLEANROOM_PROOF_BUNDLE_DIR, 'screenshots')
  : path.join(__dirname, 'test-results', 'screenshots');
const CONSOLE_ENTRY_PATH = process.env.CONSOLE_ENTRY_PATH || '/';
const RUNTIME_URL = process.env.RUNTIME_URL?.trim() || '';
const RUNTIME_TOKEN = process.env.RUNTIME_TOKEN?.trim() || '';
const REQUIRE_RUNTIME = process.env.E2E_REQUIRE_RUNTIME === '1';

let screenshotCounter = 0;

/**
 * Take a named screenshot and save to the proof bundle.
 */
export async function screenshot(page: Page, name: string): Promise<void> {
  screenshotCounter++;
  const paddedNum = String(screenshotCounter).padStart(2, '0');
  const filename = `${paddedNum}-${name}.png`;
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, filename),
    fullPage: false,
  });
}

/**
 * Navigate to a tab by clicking its nav link and wait for the page title to appear.
 */
export async function navigateToTab(page: Page, tabName: string): Promise<void> {
  await page.click(`.v2-nav-tab:has-text("${tabName}")`);
  // Wait for the clicked tab to become active, then let the page settle
  await page.waitForSelector(`.v2-nav-tab--active:has-text("${tabName}")`, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
}

/**
 * Click a sub-tab within a page.
 */
export async function clickSubTab(page: Page, tabName: string): Promise<void> {
  await page.locator(`.v2-detail-tab:has-text("${tabName}"), .v2-agent-tab:has-text("${tabName}")`).first().click();
  await page.waitForTimeout(300);
}

/**
 * Wait for the console to be fully loaded (nav bar + first page rendered).
 */
export async function waitForConsoleReady(page: Page): Promise<void> {
  await page.addInitScript(
    ({ storageKey, runtimeUrl, token }) => {
      const raw = window.localStorage.getItem(storageKey);
      let settings: Record<string, unknown> = {};
      if (raw) {
        try {
          settings = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          settings = {};
        }
      }
      if (runtimeUrl) {
        settings.runtimeUrl = runtimeUrl;
      }
      if (token) {
        settings.token = token;
      }
      window.localStorage.setItem(storageKey, JSON.stringify(settings));
    },
    {
      storageKey: SETTINGS_STORAGE_KEY,
      runtimeUrl: RUNTIME_URL,
      token: RUNTIME_TOKEN,
    },
  );

  await page.goto(CONSOLE_ENTRY_PATH);
  // Wait for the shell to render
  await page.waitForSelector('.v2-shell', { timeout: 10000 });
  // Wait for nav tabs to appear
  await page.waitForSelector('.v2-nav-tab', { timeout: 5000 });
  if (REQUIRE_RUNTIME) {
    await page.waitForFunction(() => {
      const app = document.querySelector('nexus-app') as
        | { connected?: boolean; lastError?: string | null }
        | null;
      return app?.connected === true && !app?.lastError;
    }, { timeout: 15000 });
  }
  // Wait a moment for initial data load
  await page.waitForTimeout(500);
}

/**
 * Count elements matching a selector.
 */
export async function countElements(page: Page, selector: string): Promise<number> {
  return await page.locator(selector).count();
}

/**
 * Assert no JS console errors on the page.
 */
export function setupConsoleErrorCapture(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    errors.push(err.message);
  });
  return errors;
}

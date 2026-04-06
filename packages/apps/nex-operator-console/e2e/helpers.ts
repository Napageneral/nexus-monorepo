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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function consoleShellSelector(): string {
  return '.console-shell, .v2-shell';
}

function consoleNavTabSelector(): string {
  return '.console-nav-tab, .v2-nav-tab';
}

function consoleNavTabActiveSelector(tabName: string): string {
  return `.console-nav-tab--active:has-text("${tabName}"), .v2-nav-tab--active:has-text("${tabName}")`;
}

function consoleDetailTabSelector(): string {
  return '.console-detail-tab, .console-agent-tab, .v2-detail-tab, .v2-agent-tab';
}

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
  await page
    .locator(consoleNavTabSelector())
    .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(tabName)}\\s*$`) })
    .first()
    .click();
  // Wait for the clicked tab to become active, then let the page settle
  await page.waitForSelector(consoleNavTabActiveSelector(tabName), { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
}

/**
 * Click a sub-tab within a page.
 */
export async function clickSubTab(page: Page, tabName: string): Promise<void> {
  const label = new RegExp(`^\\s*${escapeRegExp(tabName)}\\s*$`);
  const button = page
    .locator(`${consoleDetailTabSelector()}:visible`)
    .filter({ hasText: label })
    .first();

  await button.waitFor({ state: 'visible', timeout: 5000 });
  const isActive = async () => {
    try {
      return await button.evaluate((element) => {
        return (
          element.classList.contains('console-detail-tab--active') ||
          element.classList.contains('console-agent-tab--active') ||
          element.classList.contains('v2-detail-tab--active') ||
          element.classList.contains('v2-agent-tab--active')
        );
      });
    } catch {
      return false;
    }
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await button.click();
    if (await isActive()) {
      break;
    }
    await page.waitForTimeout(200);
  }

  await expect.poll(isActive, { timeout: 5000 }).toBe(true);
  await page.waitForTimeout(150);
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
  await page.waitForSelector(consoleShellSelector(), { timeout: 10000 });
  // Wait for nav tabs to appear
  await page.waitForSelector(consoleNavTabSelector(), { timeout: 5000 });
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

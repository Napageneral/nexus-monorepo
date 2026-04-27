import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', (msg) => console.log('console', msg.type(), msg.text()));
page.on('pageerror', (err) => console.log('pageerror', err?.stack || err?.message || String(err)));
await page.addInitScript(({ storageKey, runtimeUrl, token }) => {
  const raw = window.localStorage.getItem(storageKey);
  let settings = {};
  if (raw) {
    try { settings = JSON.parse(raw); } catch {}
  }
  settings.runtimeUrl = runtimeUrl;
  settings.token = token;
  window.localStorage.setItem(storageKey, JSON.stringify(settings));
}, { storageKey: 'nexus.control.settings.v1', runtimeUrl: 'ws://127.0.0.1:19689', token: 'cleanroom-chat-browser-test' });
await page.goto('http://127.0.0.1:19691/app/console/chat', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
const managerLaneId = 'lane:agent:entity-assistant';
const workerLaneId = 'lane:worker_session:session:operator-chat:worker';
const ensureLaneVisible = async (laneId) => {
  const row = page.getByTestId(`thread-row-${laneId}`).first();
  if (await row.count()) return row;
  const toggle = page.locator(`[data-testid="chat-group-toggle"][data-group-lane-id="${managerLaneId}"]`).first();
  if (await toggle.count()) await toggle.click();
  await page.waitForTimeout(500);
  return page.getByTestId(`thread-row-${laneId}`).first();
};
console.log('rows before', await page.locator('[data-testid^="thread-row-"]').count());
const managerRow = await ensureLaneVisible(managerLaneId);
console.log('manager row count', await managerRow.count());
await managerRow.click();
await page.waitForTimeout(3000);
console.log('url', page.url());
console.log('body', (await page.locator('body').innerText()).slice(0, 4000));
await browser.close();

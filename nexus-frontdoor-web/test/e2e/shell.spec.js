"use strict";

const { test, expect } = require("@playwright/test");

const SHELL_ORIGIN = "http://127.0.0.1:4310";
const FRONTDOOR_ORIGIN = "http://127.0.0.1:4311";

async function setSessionCookie(context, value) {
  await context.addCookies([
    {
      name: "nexus_fd_session",
      value,
      url: SHELL_ORIGIN,
    },
  ]);
}

test("unauthenticated user sees signed-out shell state", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#statusPill")).toContainText("Not signed in");
  await expect(page.locator("#googleBtn")).toBeVisible();
  await expect(page.locator("#workspacePanel")).toBeHidden();
  await expect(page.locator("#invitePanel")).toBeHidden();
  await expect(page.locator("#ownerInsightsPanel")).toBeHidden();
  await expect(page.locator("#operatorWorkspacePanel")).toBeHidden();
});

test("google sign-in preserves flavor and entry in return_to", async ({ page }) => {
  await page.goto("/?flavor=glowbot&entry=glowbot-demo");
  await page.locator("#googleBtn").click();
  await page.waitForURL(/\/api\/auth\/oidc\/start\?/);
  expect(page.url()).toContain("provider=google");
  expect(page.url()).toContain("product=glowbot");
  expect(page.url()).toContain("flavor=glowbot");
  expect(page.url()).toContain(
    "return_to=http%3A%2F%2F127.0.0.1%3A4310%2F%3Fflavor%3Dglowbot%26entry%3Dglowbot-demo%26auth_return%3D1",
  );
});

test("auth return without shared cookie shows diagnostic warning", async ({ page }) => {
  await page.goto("/?flavor=glowbot&entry=glowbot-demo&auth_return=1");
  await expect(page.locator("#statusPill")).toContainText("Not signed in after OAuth return");
  await expect(page.locator("#authWarning")).toContainText("FRONTDOOR_SESSION_COOKIE_DOMAIN=.nexushub.sh");
});

test("authenticated owner can select workspace and launch runtime app", async ({ page, context }) => {
  await setSessionCookie(context, "sid-owner");
  await page.goto("/");

  await expect(page.locator("#statusPill")).toContainText("Signed in as Owner User");
  await expect(page.locator("#workspacePanel")).toBeVisible();
  await expect(page.locator("#workspaceCount")).toHaveText("2");
  await expect(page.locator("#ownerInsightsPanel")).toBeVisible();
  await expect(page.locator("#operatorWorkspacePanel")).toBeHidden();
  await expect(page.locator("#billingPlan")).toHaveText("pro");
  await expect(page.locator("#usageRequests30d")).toHaveText("124");
  await expect(page.locator("#billingInvoiceList li")).toHaveCount(1);

  await page.selectOption("#workspaceSelect", "tenant-ops");
  await page.locator("#selectWorkspaceBtn").click();
  await expect(page.locator("#statusPill")).toContainText("Workspace selected");
  await expect(page.locator("#workspaceSummary")).toContainText("Tenant Ops");
  await expect(page.locator("#appSelect")).toHaveValue("control");
  await expect(page.locator("#appSummary")).toContainText("Control");
  await expect(page.locator("#billingPlan")).toHaveText("starter");
  await expect(page.locator("#usageRequests30d")).toHaveText("58");
  await expect(page.locator("#billingInvoiceList")).toContainText("No invoices yet.");

  const popupPromise = page.waitForEvent("popup");
  await page.selectOption("#billingPlanSelect", "business");
  await page.locator("#startCheckoutBtn").click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(popup.url()).toContain("mock-checkout");
  expect(popup.url()).toContain("plan_id=business");
  await popup.close();

  await page.locator("#openTenantAppBtn").click();
  await page.waitForURL(`${FRONTDOOR_ORIGIN}/app/control/chat?workspace_id=tenant-ops`);
  await expect(page.locator("body")).toContainText("Mock Runtime App");
});

test("operator/owner panels are role-gated", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  try {
    await setSessionCookie(ownerContext, "sid-owner");
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto("/?operator=1");
    await expect(ownerPage.locator("#ownerInsightsPanel")).toBeVisible();
    await expect(ownerPage.locator("#operatorPanel")).toBeHidden();
    await expect(ownerPage.locator("#operatorWorkspacePanel")).toBeHidden();
  } finally {
    await ownerContext.close();
  }

  const operatorContext = await browser.newContext();
  try {
    await setSessionCookie(operatorContext, "sid-operator");
    const operatorPage = await operatorContext.newPage();
    await operatorPage.goto("/?operator=1");
    await expect(operatorPage.locator("#operatorPanel")).toBeVisible();
    await expect(operatorPage.locator("#operatorWorkspacePanel")).toBeVisible();
    await expect(operatorPage.locator("#operatorWorkspaceCount")).toHaveText("2");
  } finally {
    await operatorContext.close();
  }

  const memberContext = await browser.newContext();
  try {
    await setSessionCookie(memberContext, "sid-member");
    const memberPage = await memberContext.newPage();
    await memberPage.goto("/?operator=1");
    await expect(memberPage.locator("#ownerInsightsPanel")).toBeHidden();
    await expect(memberPage.locator("#operatorPanel")).toBeHidden();
    await expect(memberPage.locator("#operatorWorkspacePanel")).toBeHidden();
  } finally {
    await memberContext.close();
  }
});

test("flavor query updates shell copy and preferred app selection", async ({ page, context }) => {
  await setSessionCookie(context, "sid-owner");
  await page.goto("/?flavor=glowbot&entry=glowbot-demo");

  await expect(page.locator("#heroHeadline")).toContainText("Launch your GlowBot workspace");
  await expect(page.locator("#offerTitle")).toContainText("GlowBot package");
  await expect(page.locator("#entryContext")).toContainText("Entry source: glowbot-demo");

  await page.selectOption("#workspaceSelect", "tenant-ops");
  await page.locator("#selectWorkspaceBtn").click();

  await expect(page.locator("#appSelect")).toHaveValue("glowbot");
  await expect(page.locator("#appSummary")).toContainText("GlowBot");
  await expect(page.locator("#openTenantAppBtn")).toContainText("Open GlowBot workspace");
});

test("authenticated user with no workspace sees provisioning-in-progress diagnostics", async ({ page, context }) => {
  await setSessionCookie(context, "sid-provisioning");
  await page.goto("/?flavor=glowbot&entry=glowbot-demo");

  await expect(page.locator("#statusPill")).toContainText("Signed in as Provisioning User");
  await expect(page.locator("#workspaceCount")).toHaveText("0");
  await expect(page.locator("#workspaceSummary")).toContainText("No active workspace selected.");
  await expect(page.locator("#provisioningSummary")).toContainText("Provisioning in progress (tenant_bootstrap).");
  await expect(page.locator("#openTenantAppBtn")).toBeDisabled();
});

test("workspace with no launchable app surfaces explicit launch blocker", async ({ page, context }) => {
  await setSessionCookie(context, "sid-noapp");
  await page.goto("/");

  await expect(page.locator("#workspaceSummary")).toContainText("Tenant No App");
  await expect(page.locator("#statusPill")).toContainText(
    "Workspace launch blocked: runtime returned no launchable /app entries",
  );
  await expect(page.locator("#appSummary")).toContainText(
    "Launch blocked: runtime returned no launchable /app entries",
  );
  await expect(page.locator("#openTenantAppBtn")).toBeDisabled();
});

test("runtime unhealthy diagnostics are surfaced before launch click", async ({ page, context }) => {
  await setSessionCookie(context, "sid-runtime-down");
  await page.goto("/");

  await expect(page.locator("#workspaceSummary")).toContainText("Tenant Runtime Down");
  await expect(page.locator("#statusPill")).toContainText(
    "Workspace launch blocked: runtime health unavailable (nex_runtime_unavailable)",
  );
  await expect(page.locator("#appSummary")).toContainText(
    "Launch blocked: runtime health unavailable (nex_runtime_unavailable)",
  );
  await expect(page.locator("#openTenantAppBtn")).toBeDisabled();
});

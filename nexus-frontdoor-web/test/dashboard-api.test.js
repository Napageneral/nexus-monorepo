"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const operatorWorkspacesHandler = require("../api/operator-workspaces");
const workspaceUsageHandler = require("../api/workspace-usage");
const workspaceBillingSummaryHandler = require("../api/workspace-billing-summary");
const billingCheckoutSessionHandler = require("../api/billing-checkout-session");
const billingSubscriptionHandler = require("../api/billing-subscription");
const billingInvoicesHandler = require("../api/billing-invoices");
const { startServer, withEnv } = require("./helpers/http");

test("operator-workspaces requires app session cookie", async (t) => {
  const frontdoor = await startServer((_req, res) => {
    res.statusCode = 500;
    res.end("should-not-be-called");
  });
  const restore = withEnv({
    FRONTDOOR_ORIGIN: frontdoor.origin,
    APP_SESSION_COOKIE_NAME: "app_sid",
    FRONTDOOR_SESSION_COOKIE_NAME: "fd_sid",
  });
  const app = await startServer(operatorWorkspacesHandler);
  t.after(async () => {
    restore();
    await app.close();
    await frontdoor.close();
  });
  const response = await fetch(`${app.origin}/api/operator-workspaces`);
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
});

test("workspace usage and billing proxy correct workspace routes", async (t) => {
  const seenPaths = [];
  const seenCookies = [];
  const frontdoor = await startServer((req, res) => {
    seenPaths.push(String(req.url || ""));
    seenCookies.push(String(req.headers.cookie || ""));
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end('{"ok":true}');
  });
  const restore = withEnv({
    FRONTDOOR_ORIGIN: frontdoor.origin,
    APP_SESSION_COOKIE_NAME: "app_sid",
    FRONTDOOR_SESSION_COOKIE_NAME: "fd_sid",
  });
  const usageApp = await startServer(workspaceUsageHandler);
  const billingApp = await startServer(workspaceBillingSummaryHandler);
  t.after(async () => {
    restore();
    await usageApp.close();
    await billingApp.close();
    await frontdoor.close();
  });

  const usageResp = await fetch(`${usageApp.origin}/api/workspace-usage?workspace_id=tenant-dev`, {
    headers: { cookie: "app_sid=session-123" },
  });
  assert.equal(usageResp.status, 200);
  const billingResp = await fetch(
    `${billingApp.origin}/api/workspace-billing-summary?workspace_id=tenant-dev`,
    {
      headers: { cookie: "app_sid=session-123" },
    },
  );
  assert.equal(billingResp.status, 200);

  assert.deepEqual(seenPaths, [
    "/api/workspaces/tenant-dev/usage",
    "/api/workspaces/tenant-dev/billing/summary",
  ]);
  assert.deepEqual(seenCookies, ["fd_sid=session-123", "fd_sid=session-123"]);
});

test("workspace usage and billing require workspace_id query", async (t) => {
  const frontdoor = await startServer((_req, res) => {
    res.statusCode = 500;
    res.end("should-not-be-called");
  });
  const restore = withEnv({
    FRONTDOOR_ORIGIN: frontdoor.origin,
    APP_SESSION_COOKIE_NAME: "app_sid",
    FRONTDOOR_SESSION_COOKIE_NAME: "fd_sid",
  });
  const usageApp = await startServer(workspaceUsageHandler);
  const billingApp = await startServer(workspaceBillingSummaryHandler);
  t.after(async () => {
    restore();
    await usageApp.close();
    await billingApp.close();
    await frontdoor.close();
  });

  const usageResp = await fetch(`${usageApp.origin}/api/workspace-usage`, {
    headers: { cookie: "app_sid=session-123" },
  });
  assert.equal(usageResp.status, 400);
  const usageBody = await usageResp.json();
  assert.equal(usageBody.error, "missing_workspace_id");

  const billingResp = await fetch(`${billingApp.origin}/api/workspace-billing-summary`, {
    headers: { cookie: "app_sid=session-123" },
  });
  assert.equal(billingResp.status, 400);
  const billingBody = await billingResp.json();
  assert.equal(billingBody.error, "missing_workspace_id");
});

test("billing subscription and invoices proxy correct workspace routes", async (t) => {
  const seenPaths = [];
  const seenCookies = [];
  const frontdoor = await startServer((req, res) => {
    seenPaths.push(String(req.url || ""));
    seenCookies.push(String(req.headers.cookie || ""));
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end('{"ok":true}');
  });
  const restore = withEnv({
    FRONTDOOR_ORIGIN: frontdoor.origin,
    APP_SESSION_COOKIE_NAME: "app_sid",
    FRONTDOOR_SESSION_COOKIE_NAME: "fd_sid",
  });
  const subscriptionApp = await startServer(billingSubscriptionHandler);
  const invoicesApp = await startServer(billingInvoicesHandler);
  t.after(async () => {
    restore();
    await subscriptionApp.close();
    await invoicesApp.close();
    await frontdoor.close();
  });

  const subscriptionResp = await fetch(
    `${subscriptionApp.origin}/api/billing-subscription?workspace_id=tenant-dev`,
    {
      headers: { cookie: "app_sid=session-123" },
    },
  );
  assert.equal(subscriptionResp.status, 200);
  const invoicesResp = await fetch(`${invoicesApp.origin}/api/billing-invoices?workspace_id=tenant-dev`, {
    headers: { cookie: "app_sid=session-123" },
  });
  assert.equal(invoicesResp.status, 200);

  assert.deepEqual(seenPaths, [
    "/api/billing/tenant-dev/subscription",
    "/api/billing/tenant-dev/invoices",
  ]);
  assert.deepEqual(seenCookies, ["fd_sid=session-123", "fd_sid=session-123"]);
});

test("billing checkout proxies workspace route and payload", async (t) => {
  const seen = {
    path: "",
    cookie: "",
    body: "",
  };
  const frontdoor = await startServer(async (req, res) => {
    seen.path = String(req.url || "");
    seen.cookie = String(req.headers.cookie || "");
    let raw = "";
    for await (const chunk of req) {
      raw += String(chunk);
    }
    seen.body = raw;
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end('{"ok":true,"checkout_url":"https://checkout.example/session"}');
  });
  const restore = withEnv({
    FRONTDOOR_ORIGIN: frontdoor.origin,
    FRONTDOOR_WEB_ORIGIN: "https://shell.example",
    APP_SESSION_COOKIE_NAME: "app_sid",
    FRONTDOOR_SESSION_COOKIE_NAME: "fd_sid",
  });
  const app = await startServer(billingCheckoutSessionHandler);
  t.after(async () => {
    restore();
    await app.close();
    await frontdoor.close();
  });

  const response = await fetch(`${app.origin}/api/billing-checkout-session`, {
    method: "POST",
    headers: {
      origin: "https://shell.example",
      cookie: "app_sid=session-123",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      workspace_id: "tenant-dev",
      plan_id: "pro",
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.checkout_url, "https://checkout.example/session");
  assert.equal(seen.path, "/api/billing/tenant-dev/checkout-session");
  assert.equal(seen.cookie, "fd_sid=session-123");
  assert.equal(JSON.parse(seen.body).plan_id, "pro");
});

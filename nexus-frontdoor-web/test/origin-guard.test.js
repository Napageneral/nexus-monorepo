"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const loginHandler = require("../api/login");
const logoutHandler = require("../api/logout");
const runtimeTokenHandler = require("../api/runtime-token");
const runtimeTokenRefreshHandler = require("../api/runtime-token-refresh");
const runtimeTokenRevokeHandler = require("../api/runtime-token-revoke");
const workspacesCreateHandler = require("../api/workspaces-create");
const workspacesSelectHandler = require("../api/workspaces-select");
const invitesRedeemHandler = require("../api/invites-redeem");
const billingCheckoutSessionHandler = require("../api/billing-checkout-session");

const { startServer, withEnv } = require("./helpers/http");

const mutationRoutes = [
  { name: "login", path: "/api/login", handler: loginHandler },
  { name: "logout", path: "/api/logout", handler: logoutHandler },
  { name: "runtime-token", path: "/api/runtime-token", handler: runtimeTokenHandler },
  { name: "runtime-token-refresh", path: "/api/runtime-token-refresh", handler: runtimeTokenRefreshHandler },
  { name: "runtime-token-revoke", path: "/api/runtime-token-revoke", handler: runtimeTokenRevokeHandler },
  { name: "workspaces-create", path: "/api/workspaces-create", handler: workspacesCreateHandler },
  { name: "workspaces-select", path: "/api/workspaces-select", handler: workspacesSelectHandler },
  { name: "invites-redeem", path: "/api/invites-redeem", handler: invitesRedeemHandler },
  {
    name: "billing-checkout-session",
    path: "/api/billing-checkout-session",
    handler: billingCheckoutSessionHandler,
  },
];

test("all mutation routes reject cross-origin browser requests", async (t) => {
  const restore = withEnv({
    FRONTDOOR_ORIGIN: "https://frontdoor.nexushub.sh",
    FRONTDOOR_WEB_ORIGIN: "https://shell.example",
    FRONTDOOR_SESSION_COOKIE_NAME: "fd_sid",
    APP_SESSION_COOKIE_NAME: "app_sid",
  });
  t.after(() => restore());

  for (const route of mutationRoutes) {
    const app = await startServer(route.handler);
    t.after(async () => app.close());
    const response = await fetch(`${app.origin}${route.path}`, {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(response.status, 403, `${route.name} should reject cross-origin POST`);
    const body = await response.json();
    assert.equal(body.ok, false, `${route.name} must return error payload`);
    assert.equal(body.error, "origin_not_allowed", `${route.name} must return origin_not_allowed`);
  }
});

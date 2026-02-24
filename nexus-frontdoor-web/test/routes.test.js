"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const frontdoorOriginHandler = require("../api/frontdoor-origin");
const oidcStartHandler = require("../api/oidc-start");
const sessionHandler = require("../api/session");
const workspacesHandler = require("../api/workspaces");

const { startServer, withEnv } = require("./helpers/http");

test("frontdoor-origin returns trimmed origin and app URL", async (t) => {
  const restore = withEnv({
    FRONTDOOR_ORIGIN: "https://frontdoor.nexushub.sh/",
  });
  const app = await startServer(frontdoorOriginHandler);
  t.after(async () => {
    restore();
    await app.close();
  });

  const response = await fetch(`${app.origin}/api/frontdoor-origin`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.frontdoor_origin, "https://frontdoor.nexushub.sh");
  assert.equal(body.app_url, "https://frontdoor.nexushub.sh/app/");
});

test("oidc-start redirects to frontdoor provider start with return path", async (t) => {
  const restore = withEnv({
    FRONTDOOR_ORIGIN: "https://frontdoor.nexushub.sh",
  });
  const app = await startServer(oidcStartHandler);
  t.after(async () => {
    restore();
    await app.close();
  });

  const response = await fetch(
    `${app.origin}/api/oidc-start?provider=google&return_to=%2Fapp%2Fchat%3Fsession%3Dmain`,
    {
      redirect: "manual",
    },
  );
  assert.equal(response.status, 302);
  const location = response.headers.get("location") || "";
  assert.equal(
    location,
    "https://frontdoor.nexushub.sh/api/auth/oidc/start?provider=google&return_to=%2Fapp%2Fchat%3Fsession%3Dmain",
  );
});

test("session endpoint returns unauthenticated without app cookie", async (t) => {
  const frontdoor = await startServer((_req, res) => {
    res.statusCode = 500;
    res.end("should-not-be-called");
  });
  const restore = withEnv({
    FRONTDOOR_ORIGIN: frontdoor.origin,
    APP_SESSION_COOKIE_NAME: "app_sid",
    FRONTDOOR_SESSION_COOKIE_NAME: "fd_sid",
  });
  const app = await startServer(sessionHandler);
  t.after(async () => {
    restore();
    await app.close();
    await frontdoor.close();
  });

  const response = await fetch(`${app.origin}/api/session`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.authenticated, false);
});

test("workspaces endpoint returns unauthorized without app cookie", async (t) => {
  const frontdoor = await startServer((_req, res) => {
    res.statusCode = 500;
    res.end("should-not-be-called");
  });
  const restore = withEnv({
    FRONTDOOR_ORIGIN: frontdoor.origin,
    APP_SESSION_COOKIE_NAME: "app_sid",
    FRONTDOOR_SESSION_COOKIE_NAME: "fd_sid",
  });
  const app = await startServer(workspacesHandler);
  t.after(async () => {
    restore();
    await app.close();
    await frontdoor.close();
  });

  const response = await fetch(`${app.origin}/api/workspaces`);
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
});

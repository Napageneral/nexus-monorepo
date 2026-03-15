"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const runtimeTokenHandler = require("../api/runtime-token");
const { readBody, startServer, withEnv } = require("./helpers/http");

test("runtime token endpoint requires authenticated app cookie", async (t) => {
  const frontdoor = await startServer((_req, res) => {
    res.statusCode = 500;
    res.end("should-not-be-called");
  });
  const restore = withEnv({
    FRONTDOOR_ORIGIN: frontdoor.origin,
    FRONTDOOR_WEB_ORIGIN: "https://shell.example",
    FRONTDOOR_SESSION_COOKIE_NAME: "fd_sid",
    APP_SESSION_COOKIE_NAME: "app_sid",
  });
  const app = await startServer(runtimeTokenHandler);
  t.after(async () => {
    restore();
    await app.close();
    await frontdoor.close();
  });

  const response = await fetch(`${app.origin}/api/runtime-token`, {
    method: "POST",
    headers: {
      origin: "https://shell.example",
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
});

test("runtime token proxies body and maps app cookie to frontdoor cookie", async (t) => {
  let receivedPath = "";
  let receivedCookie = "";
  let receivedBody = "";
  const frontdoor = await startServer(async (req, res) => {
    receivedPath = req.url || "";
    receivedCookie = String(req.headers.cookie || "");
    receivedBody = await readBody(req);
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end('{"ok":true,"access_token":"rtok"}');
  });
  const restore = withEnv({
    FRONTDOOR_ORIGIN: frontdoor.origin,
    FRONTDOOR_WEB_ORIGIN: "https://shell.example",
    FRONTDOOR_SESSION_COOKIE_NAME: "fd_sid",
    APP_SESSION_COOKIE_NAME: "app_sid",
  });
  const app = await startServer(runtimeTokenHandler);
  t.after(async () => {
    restore();
    await app.close();
    await frontdoor.close();
  });

  const payload = { workspace_id: "tenant-dev", client_id: "shell-ui" };
  const response = await fetch(`${app.origin}/api/runtime-token`, {
    method: "POST",
    headers: {
      origin: "https://shell.example",
      cookie: "app_sid=app-session-456",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.access_token, "rtok");
  assert.equal(receivedPath, "/api/runtime/token");
  assert.equal(receivedCookie, "fd_sid=app-session-456");
  assert.deepEqual(JSON.parse(receivedBody), payload);
});

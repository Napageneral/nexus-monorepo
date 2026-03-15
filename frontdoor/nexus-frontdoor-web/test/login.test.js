"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const loginHandler = require("../api/login");
const { readBody, startServer, withEnv } = require("./helpers/http");

test("login rejects cross-origin browser mutations", async (t) => {
  let frontdoorCalled = false;
  const frontdoor = await startServer(async (_req, res) => {
    frontdoorCalled = true;
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end('{"ok":true}');
  });
  const restore = withEnv({
    FRONTDOOR_ORIGIN: `${frontdoor.origin}/`,
    FRONTDOOR_WEB_ORIGIN: "https://shell.example",
    FRONTDOOR_SESSION_COOKIE_NAME: "fd_sid",
    APP_SESSION_COOKIE_NAME: "app_sid",
  });
  const app = await startServer(loginHandler);
  t.after(async () => {
    restore();
    await app.close();
    await frontdoor.close();
  });

  const response = await fetch(`${app.origin}/api/login`, {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      "content-type": "application/json",
    },
    body: JSON.stringify({ username: "owner", password: "bad" }),
  });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "origin_not_allowed");
  assert.equal(frontdoorCalled, false);
});

test("login proxies to frontdoor and maps session cookie", async (t) => {
  let receivedPath = "";
  let receivedBody = "";
  let receivedContentType = "";
  const frontdoor = await startServer(async (req, res) => {
    receivedPath = req.url || "";
    receivedContentType = String(req.headers["content-type"] || "");
    receivedBody = await readBody(req);
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("set-cookie", "fd_sid=fd-session-123; Path=/; HttpOnly; SameSite=Lax");
    res.end('{"ok":true,"tenant":"tenant-dev"}');
  });
  const restore = withEnv({
    FRONTDOOR_ORIGIN: `${frontdoor.origin}/`,
    FRONTDOOR_WEB_ORIGIN: "https://shell.example",
    FRONTDOOR_SESSION_COOKIE_NAME: "fd_sid",
    APP_SESSION_COOKIE_NAME: "app_sid",
    APP_SESSION_TTL_SECONDS: "900",
  });
  const app = await startServer(loginHandler);
  t.after(async () => {
    restore();
    await app.close();
    await frontdoor.close();
  });

  const payload = { username: "owner", password: "pw" };
  const response = await fetch(`${app.origin}/api/login`, {
    method: "POST",
    headers: {
      origin: "https://shell.example",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 200);
  const setCookie = response.headers.get("set-cookie") || "";
  assert.match(setCookie, /app_sid=fd-session-123/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /Max-Age=900/);

  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.tenant, "tenant-dev");
  assert.equal(receivedPath, "/api/auth/login");
  assert.equal(receivedContentType, "application/json");
  assert.deepEqual(JSON.parse(receivedBody), payload);
});

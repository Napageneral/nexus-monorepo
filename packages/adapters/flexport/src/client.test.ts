import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  type FakeFlexport,
  startFakeFlexport,
} from "../testdata/fake-flexport.mjs";
import {
  type FlexportConfig,
  FlexportError,
  clientFingerprint,
  createFlexportClient,
  credentialFingerprint,
  normalizeBaseUrl,
  readFlexportConfig,
  readTokenStatus,
  retryAfterMs,
} from "./client.ts";

const CONNECTION_ID = "test-flexport";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function stateDir(): string {
  return mkdtempSync(join(tmpdir(), "nexus-flexport-client-"));
}

function clientFor(
  fake: FakeFlexport,
  dir: string,
  options: { config?: Record<string, unknown>; secret?: string; sleeps?: number[]; now?: () => number } = {},
) {
  const config: FlexportConfig = readFlexportConfig({ base_url: fake.url, ...options.config });
  return createFlexportClient({
    connectionId: CONNECTION_ID,
    clientId: FAKE_CLIENT_ID,
    clientSecret: options.secret ?? FAKE_CLIENT_SECRET,
    config,
    stateDir: dir,
    sleep: async (milliseconds) => {
      options.sleeps?.push(milliseconds);
    },
    ...(options.now ? { now: options.now } : {}),
  });
}

function iso(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

function readCache(dir: string) {
  return JSON.parse(readFileSync(tokenCachePath(dir), "utf8"));
}

/**
 * A scripted Flexport on a fake clock: the token endpoint is down until `tokenUp`, and every API
 * call answers an empty page. Nothing listens on the base URL; fetch never leaves the process.
 */
function scriptedFlexport(clock: { now: number }) {
  const calls = { token: 0, api: [] as string[], tokenUp: false };
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") {
      calls.token += 1;
      if (!calls.tokenUp) throw new TypeError("fetch failed");
      const exp = Math.floor((clock.now + 24 * HOUR) / 1000);
      return Response.json({ access_token: `${part({ alg: "none" })}.${part({ exp, n: calls.token })}.sig` });
    }
    calls.api.push(String((init?.headers as Record<string, string>).Authorization));
    return Response.json({ data: { data: [], next: null } });
  }) as typeof fetch;
  const client = (dir: string, options: { clientId?: string; secret?: string } = {}) =>
    createFlexportClient({
      connectionId: CONNECTION_ID,
      clientId: options.clientId ?? FAKE_CLIENT_ID,
      clientSecret: options.secret ?? FAKE_CLIENT_SECRET,
      config: readFlexportConfig({ base_url: "http://127.0.0.1:9" }),
      stateDir: dir,
      fetch: fetchImpl,
      now: () => clock.now,
    });
  return { calls, client };
}

function tokenCachePath(dir: string): string {
  return join(dir, "token-cache", `${CONNECTION_ID}.json`);
}

function writeCache(dir: string, value: unknown): void {
  mkdirSync(join(dir, "token-cache"), { recursive: true, mode: 0o700 });
  writeFileSync(tokenCachePath(dir), JSON.stringify(value), { mode: 0o600 });
  chmodSync(tokenCachePath(dir), 0o600);
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

async function withFake(
  run: (fake: FakeFlexport, dir: string) => Promise<void>,
  options: Parameters<typeof startFakeFlexport>[0] = {},
): Promise<void> {
  const fake = await startFakeFlexport(options);
  const dir = stateDir();
  try {
    await run(fake, dir);
  } finally {
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("base_url is production or loopback only, refused at client creation", () => {
  assert.equal(normalizeBaseUrl(undefined), "https://api.flexport.com");
  assert.equal(normalizeBaseUrl("https://api.flexport.com/"), "https://api.flexport.com");
  assert.equal(normalizeBaseUrl("http://127.0.0.1:4010"), "http://127.0.0.1:4010");
  assert.equal(normalizeBaseUrl("http://localhost:4010/"), "http://localhost:4010");
  for (const refused of [
    "https://api.flexport.com.example.net",
    "http://api.flexport.com",
    "https://evil.example.com",
    "http://127.0.0.1",
    "http://127.0.0.1:4010/v2",
    "http://10.0.0.5:4010",
    "http://user:pass@127.0.0.1:4010",
    "http://127.0.0.1:70000",
  ]) {
    assert.throws(() => normalizeBaseUrl(refused), /base_url must be/, refused);
  }
  assert.throws(
    () =>
      createFlexportClient({
        connectionId: CONNECTION_ID,
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_SECRET,
        config: { ...readFlexportConfig({}), base_url: "https://evil.example.com" },
      }),
    /base_url must be/,
  );
});

test("config defaults match the contract and caps hold", () => {
  assert.deepEqual(readFlexportConfig({}), {
    poll_interval_ms: 1_800_000,
    network_interval_ms: 86_400_000,
    lookback_days: 90,
    token_budget_per_day: 8,
    max_document_bytes: 52_428_800,
    base_url: "https://api.flexport.com",
  });
  const capped = readFlexportConfig({ token_budget_per_day: 50, max_document_bytes: 10 ** 9 });
  assert.equal(capped.token_budget_per_day, 10);
  assert.equal(capped.max_document_bytes, 52_428_800);
});

test("one token request serves many calls and a second client instance", async () => {
  await withFake(async (fake, dir) => {
    const client = clientFor(fake, dir);
    await client.listShipments();
    await client.bundle("1234567");
    await client.network();
    const second = clientFor(fake, dir);
    await second.listShipments();
    assert.equal(fake.tokenRequests, 1);
    for (const request of fake.apiRequests()) {
      assert.match(request.authorization ?? "", /^Bearer /);
      assert.equal(request.flexport_version, "2");
    }
    const cachePath = tokenCachePath(dir);
    assert.equal(statSync(cachePath).mode & 0o777, 0o600);
    assert.equal(statSync(join(dir, "token-cache")).mode & 0o777, 0o700);
    const text = readFileSync(cachePath, "utf8");
    assert.ok(!text.includes(FAKE_CLIENT_SECRET));
    const cache = JSON.parse(text);
    assert.equal(cache.version, 1);
    assert.equal(cache.credential_fingerprint, credentialFingerprint(FAKE_CLIENT_ID, FAKE_CLIENT_SECRET));
    assert.equal(
      cache.credential_fingerprint,
      createHash("sha256").update(`${FAKE_CLIENT_ID}\0${FAKE_CLIENT_SECRET}`).digest("hex"),
    );
    assert.equal(cache.requests.length, 1);
    assert.ok(Date.parse(cache.expires_at) > Date.now() + 23 * 60 * 60 * 1000);
  });
});

test("one token request across concurrent processes sharing the state dir", async () => {
  await withFake(async (fake, dir) => {
    const clientUrl = pathToFileURL(resolve(import.meta.dirname, "client.ts")).href;
    const code = [
      `import { createFlexportClient, readFlexportConfig } from ${JSON.stringify(clientUrl)};`,
      "const client = createFlexportClient({ connectionId: 'test-flexport', clientId: process.env.FAKE_ID,",
      "  clientSecret: process.env.FAKE_SECRET, config: readFlexportConfig({ base_url: process.env.FAKE_URL }),",
      "  stateDir: process.env.FAKE_STATE });",
      "const rows = await client.listShipments();",
      "process.stdout.write(String(rows.length));",
    ].join("\n");
    const runs = Array.from({ length: 5 }, () =>
      new Promise<{ code: number | null; stdout: string; stderr: string }>((resolvePromise, rejectPromise) => {
        const child = spawn(
          process.execPath,
          ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", code],
          {
            env: {
              ...process.env,
              FAKE_ID: FAKE_CLIENT_ID,
              FAKE_SECRET: FAKE_CLIENT_SECRET,
              FAKE_URL: fake.url,
              FAKE_STATE: dir,
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => (stdout += String(chunk)));
        child.stderr.on("data", (chunk) => (stderr += String(chunk)));
        child.once("error", rejectPromise);
        child.once("close", (exitCode) => resolvePromise({ code: exitCode, stdout, stderr }));
      }),
    );
    const results = await Promise.all(runs);
    for (const result of results) {
      assert.equal(result.code, 0, result.stderr);
      assert.equal(result.stdout, "1");
    }
    assert.equal(fake.tokenRequests, 1);
    assert.equal(JSON.parse(readFileSync(tokenCachePath(dir), "utf8")).requests.length, 1);
  });
});

test("a changed credential fingerprint discards the token but keeps the request history", async () => {
  await withFake(async (fake, dir) => {
    writeCache(dir, {
      version: 1,
      credential_fingerprint: credentialFingerprint(FAKE_CLIENT_ID, "old-secret"),
      access_token: "old.token.value",
      expires_at: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(),
      requests: [hoursAgo(3), hoursAgo(2), hoursAgo(30)],
    });
    await clientFor(fake, dir).listShipments();
    assert.equal(fake.tokenRequests, 1);
    assert.ok(!fake.requests.some((request) => request.authorization === "Bearer old.token.value"));
    const cache = JSON.parse(readFileSync(tokenCachePath(dir), "utf8"));
    assert.equal(cache.credential_fingerprint, credentialFingerprint(FAKE_CLIENT_ID, FAKE_CLIENT_SECRET));
    assert.equal(cache.requests.length, 3, "two kept from the trailing 24 h plus the new one");
  });
});

test("the token budget refuses a new request before anything is sent", async () => {
  await withFake(async (fake, dir) => {
    writeCache(dir, {
      version: 1,
      credential_fingerprint: credentialFingerprint(FAKE_CLIENT_ID, FAKE_CLIENT_SECRET),
      access_token: null,
      expires_at: null,
      requests: Array.from({ length: 8 }, (_, index) => hoursAgo(index + 1)),
    });
    await assert.rejects(clientFor(fake, dir).listShipments(), /token budget exhausted: 8 token requests/);
    assert.equal(fake.requests.length, 0);
    await assert.rejects(
      clientFor(fake, dir, { config: { token_budget_per_day: 3 } }).listShipments(),
      /budget 3/,
    );
    assert.equal(fake.requests.length, 0);
  });
});

test("a token close to expiry is replaced; a fresh one is reused", async () => {
  await withFake(async (fake, dir) => {
    writeCache(dir, {
      version: 1,
      credential_fingerprint: credentialFingerprint(FAKE_CLIENT_ID, FAKE_CLIENT_SECRET),
      access_token: "expiring.token.value",
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      requests: [hoursAgo(23)],
    });
    await clientFor(fake, dir).listShipments();
    assert.equal(fake.tokenRequests, 1);
    const status = readTokenStatus({
      stateDir: dir,
      connectionId: CONNECTION_ID,
      clientId: FAKE_CLIENT_ID,
      clientSecret: FAKE_CLIENT_SECRET,
    });
    assert.equal(status.token_cached, true);
    assert.equal(status.token_requests_24h, 2);
  });
});

test("a 401 on a token older than 10 min retires it once so the next call requests one new token", async () => {
  await withFake(async (fake, dir) => {
    await clientFor(fake, dir).listShipments();
    const later = () => Date.now() + 15 * MINUTE;
    fake.inject({ path: "/shipments", status: 401, body: { error: { code: "unauthorized", message: "expired" } } });
    await assert.rejects(clientFor(fake, dir, { now: later }).listShipments(), (error: FlexportError) => {
      assert.equal(error.message, "Flexport GET /shipments failed (HTTP 401, unauthorized)");
      assert.equal(error.status, 401);
      assert.equal(error.abortsPass, true);
      return true;
    });
    const cache = readCache(dir);
    assert.equal(cache.access_token, null);
    assert.equal(cache.auth_failed_at, null, "an old token's 401 is an expiry, not an authentication failure");
    await clientFor(fake, dir, { now: later }).listShipments();
    assert.equal(fake.tokenRequests, 2);
  });
});

test("a 401 on a token issued minutes earlier pauses new token requests for an hour", async () => {
  await withFake(async (fake, dir) => {
    const client = clientFor(fake, dir);
    await client.listShipments();
    fake.inject({ path: "/shipments", status: 401, body: { error: { code: "unauthorized", message: "no" } } });
    await assert.rejects(client.listShipments(), (error: FlexportError) => {
      assert.equal(
        error.message,
        "Flexport GET /shipments failed (HTTP 401, unauthorized); Flexport refused a fresh token, token requests paused for 1 h",
      );
      assert.equal(error.abortsPass, true);
      return true;
    });
    const cache = readCache(dir);
    assert.equal(cache.access_token, null);
    const failedAt = Date.parse(cache.auth_failed_at);
    assert.ok(failedAt <= Date.now() && failedAt > Date.now() - MINUTE);
    const sent = fake.requests.length;
    await assert.rejects(
      clientFor(fake, dir).listShipments(),
      /^FlexportError: Flexport token requests are paused until \S+: Flexport refused a token issued minutes earlier \(HTTP 401\); not requesting another$/,
    );
    assert.equal(fake.requests.length, sent, "nothing is sent during the pause");
    const status = readTokenStatus({ stateDir: dir, connectionId: CONNECTION_ID, clientId: FAKE_CLIENT_ID, clientSecret: FAKE_CLIENT_SECRET });
    assert.equal(status.auth_failed_at, cache.auth_failed_at);
    assert.equal(status.token_requests_paused_until, iso(failedAt + HOUR));
    await clientFor(fake, dir, { now: () => Date.now() + 61 * MINUTE }).listShipments();
    assert.equal(fake.tokenRequests, 2, "one new token request once the hour is over");
  });
});

test("renewal keeps the old token until a new one is in hand and backs off failed token requests", async () => {
  const dir = stateDir();
  try {
    const clock = { now: Date.parse("2026-10-21T12:00:00.000Z") };
    const flexport = scriptedFlexport(clock);
    writeCache(dir, {
      version: 1,
      credential_fingerprint: credentialFingerprint(FAKE_CLIENT_ID, FAKE_CLIENT_SECRET),
      access_token: "old.token.value",
      expires_at: iso(clock.now + 50 * MINUTE),
      issued_at: iso(clock.now - 23 * HOUR - 10 * MINUTE),
      requests: [iso(clock.now - 23 * HOUR - 10 * MINUTE)],
    });
    const client = flexport.client(dir);
    for (let index = 0; index < 3; index += 1) await client.listShipments();
    assert.equal(flexport.calls.token, 1, "one failed renewal, then a 15 min backoff");
    assert.deepEqual(flexport.calls.api, Array(3).fill("Bearer old.token.value"), "the old token is still used");
    let cache = readCache(dir);
    assert.equal(cache.access_token, "old.token.value", "the old token is kept while the renewal fails");
    assert.equal(cache.failed_requests, 1);
    assert.equal(cache.next_request_at, iso(clock.now + 15 * MINUTE));
    assert.equal(cache.requests.length, 2);

    clock.now += 16 * MINUTE;
    await client.listShipments();
    assert.equal(flexport.calls.token, 2);
    assert.equal(flexport.calls.api.at(-1), "Bearer old.token.value");
    cache = readCache(dir);
    assert.equal(cache.failed_requests, 2);
    assert.equal(cache.next_request_at, iso(clock.now + HOUR));

    clock.now += 35 * MINUTE;
    await assert.rejects(
      client.listShipments(),
      /token requests are backing off until \S+ after 2 failed token request\(s\); not requesting another$/,
    );
    assert.equal(flexport.calls.token, 2, "the old token has expired and the backoff holds");

    clock.now += 30 * MINUTE;
    await assert.rejects(client.listShipments(), /^FlexportError: Flexport token request failed \(TypeError\)$/);
    assert.equal(flexport.calls.token, 3);
    cache = readCache(dir);
    assert.equal(cache.failed_requests, 3);
    assert.equal(cache.next_request_at, iso(clock.now + 4 * HOUR));

    flexport.calls.tokenUp = true;
    clock.now += 4 * HOUR + MINUTE;
    await client.listShipments();
    assert.equal(flexport.calls.token, 4);
    cache = readCache(dir);
    assert.equal(cache.failed_requests, 0, "a success resets the backoff");
    assert.equal(cache.next_request_at, null);
    assert.equal(cache.issued_at, iso(clock.now));
    assert.notEqual(cache.access_token, "old.token.value");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a new secret keeps the client's request history but not its backoff; a new client id starts over", async () => {
  const dir = stateDir();
  try {
    const clock = { now: Date.parse("2026-10-21T12:00:00.000Z") };
    const flexport = scriptedFlexport(clock);
    flexport.calls.tokenUp = true;
    writeCache(dir, {
      version: 1,
      credential_fingerprint: credentialFingerprint(FAKE_CLIENT_ID, "mistyped-secret"),
      client_fingerprint: clientFingerprint(FAKE_CLIENT_ID),
      access_token: null,
      expires_at: null,
      requests: [iso(clock.now - 3 * HOUR), iso(clock.now - 2 * HOUR)],
      failed_requests: 2,
      next_request_at: iso(clock.now + 50 * MINUTE),
      auth_failed_at: iso(clock.now - 5 * MINUTE),
    });
    await flexport.client(dir).listShipments();
    assert.equal(flexport.calls.token, 1, "the corrected secret is not held back by the old secret's failures");
    let cache = readCache(dir);
    assert.equal(cache.credential_fingerprint, credentialFingerprint(FAKE_CLIENT_ID, FAKE_CLIENT_SECRET));
    assert.equal(cache.requests.length, 3, "Flexport counts token requests per client id");
    assert.equal(cache.failed_requests, 0);
    assert.equal(cache.auth_failed_at, null);

    await flexport.client(dir, { clientId: "another-client-id" }).listShipments();
    assert.equal(flexport.calls.token, 2);
    cache = readCache(dir);
    assert.equal(cache.client_fingerprint, clientFingerprint("another-client-id"));
    assert.equal(cache.requests.length, 1, "a new client id starts a new history");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an unsafe token cache is refused", async () => {
  await withFake(async (fake, dir) => {
    writeCache(dir, { version: 1, credential_fingerprint: "", access_token: null, expires_at: null, requests: [] });
    chmodSync(tokenCachePath(dir), 0o644);
    await assert.rejects(clientFor(fake, dir).listShipments(), /not a private 0600 file/);
    rmSync(tokenCachePath(dir));
    const elsewhere = join(dir, "elsewhere.json");
    writeFileSync(elsewhere, "{}", { mode: 0o600 });
    symlinkSync(elsewhere, tokenCachePath(dir));
    await assert.rejects(clientFor(fake, dir).listShipments(), /is a link/);
    assert.equal(fake.requests.length, 0);
  });
});

test("a stale token lock (older than 120 s) is taken over", async () => {
  await withFake(async (fake, dir) => {
    mkdirSync(join(dir, "token-cache"), { recursive: true, mode: 0o700 });
    const lock = `${tokenCachePath(dir)}.lock`;
    writeFileSync(lock, "99999 stale\n", { mode: 0o600 });
    const old = new Date(Date.now() - 200_000);
    utimesSync(lock, old, old);
    await clientFor(fake, dir).listShipments();
    assert.equal(fake.tokenRequests, 1);
    assert.equal(existsSync(lock), false);
  });
});

test("a redirect is an error and is never followed", async () => {
  const elsewhere = await startFakeFlexport();
  try {
    await withFake(async (fake, dir) => {
      fake.inject({ path: "/shipments", status: 302, headers: { location: `${elsewhere.url}/shipments` } });
      await assert.rejects(
        clientFor(fake, dir).listShipments(),
        /^FlexportError: Flexport GET \/shipments redirected \(HTTP 302\); not followed$/,
      );
      assert.equal(elsewhere.requests.length, 0);
    });
  } finally {
    await elsewhere.close();
  }
});

test("the token is never sent to another origin", async () => {
  const elsewhere = await startFakeFlexport();
  try {
    await withFake(async (fake, dir) => {
      const client = clientFor(fake, dir);
      await assert.rejects(client.getJson(`${elsewhere.url}/shipments`), /another origin/);
      await assert.rejects(client.getJson("https://api.flexport.com/shipments"), /another origin/);
      assert.equal(elsewhere.requests.length, 0);
      assert.equal(fake.requests.length, 0, "refused before even a token request");
    });
  } finally {
    await elsewhere.close();
  }
});

test("error text never carries the response body, the token or the secret", async () => {
  await withFake(async (fake, dir) => {
    const client = clientFor(fake, dir);
    await client.listShipments();
    fake.inject({
      path: "/shipments",
      status: 400,
      body: {
        _object: "/api/response",
        data: null,
        error: { status: 400, code: "invalid_param", message: `echo ${FAKE_CLIENT_SECRET} Bearer leaked` },
      },
    });
    await assert.rejects(client.listShipments(), (error: Error) => {
      assert.equal(error.message, "Flexport GET /shipments failed (HTTP 400, invalid_param)");
      return true;
    });
    fake.inject({
      path: "/shipments",
      status: 422,
      body: { error: { code: "Not A Slug <script>", message: FAKE_CLIENT_SECRET } },
    });
    await assert.rejects(client.listShipments(), (error: Error) => {
      assert.equal(error.message, "Flexport GET /shipments failed (HTTP 422)");
      return true;
    });
    const wrong = clientFor(fake, stateDir(), { secret: "wrong-secret-value" });
    await assert.rejects(wrong.listShipments(), (error: Error) => {
      assert.equal(error.message, "Flexport token request failed (HTTP 401, access_denied)");
      assert.ok(!error.message.includes("wrong-secret-value"));
      return true;
    });
  });
});

test("reads retry 429/5xx honoring Retry-After; long waits and writes are not retried", async () => {
  await withFake(async (fake, dir) => {
    const sleeps: number[] = [];
    const client = clientFor(fake, dir, { sleeps });
    fake.inject({ path: "/shipments", status: 429, headers: { "retry-after": "1" } });
    fake.inject({ path: "/shipments", status: 503 });
    assert.equal((await client.listShipments()).length, 1);
    assert.deepEqual(sleeps, [1000, 2000]);

    fake.inject({ path: "/shipments", status: 429, headers: { "retry-after": "120" } });
    await assert.rejects(client.listShipments(), /rate limited \(HTTP 429\); retry after 120 s/);

    fake.inject({ path: "/shipments", status: 502, times: 4 });
    await assert.rejects(client.listShipments(), /failed \(HTTP 502\)/);

    sleeps.length = 0;
    fake.inject({ path: "/bookings", method: "POST", status: 503 });
    await assert.rejects(client.send("POST", "/bookings", '{"name":"x"}'), /POST \/bookings failed \(HTTP 503\)/);
    assert.deepEqual(sleeps, []);
    fake.inject({ path: "/bookings", method: "POST", status: 429, headers: { "retry-after": "2" } });
    const sent = await client.send("POST", "/bookings", '{"name":"x"}');
    assert.equal((sent as { id: string }).id, "BK-1001");
    assert.deepEqual(sleeps, [2000]);
    assert.equal(fake.requests.filter((request) => request.path === "/bookings").length, 3);
  });
  assert.equal(retryAfterMs("Wed, 21 Oct 2026 00:00:10 GMT", 0, Date.parse("Wed, 21 Oct 2026 00:00:00 GMT")), 10_000);
  assert.equal(retryAfterMs(null, 2, 0), 4000);
});

test("collections page by number with the original filters; other shipments' rows are dropped", async () => {
  await withFake(
    async (fake, dir) => {
      const bundle = await clientFor(fake, dir).bundle("1234567");
      assert.deepEqual(Object.keys(bundle), ["shipment", "containers", "legs", "customs_entries", "invoices", "documents"]);
      assert.deepEqual(bundle.containers.map((row) => row.id), [11, 12]);
      assert.deepEqual(bundle.legs.map((row) => row.id), [21, 22], "filter ignored by the server, row 99 dropped");
      assert.deepEqual(bundle.customs_entries.map((row) => row.id), ["CE1"]);
      assert.deepEqual(bundle.documents.map((row) => row.id), ["D1", "D3"]);
      const containerPages = fake.requests.filter((request) => request.path === "/ocean/shipment_containers");
      assert.deepEqual(
        containerPages.map((request) => request.query),
        [
          { "f.shipment.id": "1234567", per: "100", page: "1" },
          { "f.shipment.id": "1234567", per: "100", page: "2" },
        ],
      );
    },
    { pageSize: 1, ignoreFilter: ["/shipment_legs"] },
  );
});

test("a final document is downloaded once into private sha256 custody", async () => {
  await withFake(async (fake, dir) => {
    const client = clientFor(fake, dir);
    const document = fake.fixtures.documents.find((row: { id: string }) => row.id === "D1");
    const first = await client.documentIntoCustody(document);
    const second = await client.documentIntoCustody(document);
    assert.ok("stored" in first && "stored" in second);
    assert.deepEqual(first, second);
    assert.equal(fake.downloads.D1, 1);
    const bytes = readFileSync(resolve(import.meta.dirname, "../testdata/fixtures/documents/D1.pdf"));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    assert.equal(first.stored.sha256, sha256);
    assert.equal(first.stored.size, bytes.length);
    assert.equal(first.stored.mime_type, "application/pdf");
    assert.equal(first.stored.local_path, join(realpathSync(dir), "attachment-custody", "sha256", sha256.slice(0, 2), sha256));
    assert.equal(statSync(first.stored.local_path).mode & 0o777, 0o600);
    assert.equal(statSync(join(dir, "attachment-custody")).mode & 0o777, 0o700);
    const download = fake.requests.find((request) => request.path === "/documents/D1/download");
    assert.equal(download?.accept, "*/*");

    const small = clientFor(fake, dir, { config: { max_document_bytes: 50 } });
    const other = { ...document, id: "D1-big", file_metadata: { size: 5000, uploaded_at: "2026-10-08T03:00:00Z" } };
    assert.deepEqual(await small.documentIntoCustody(other), { skipped: "too_large" });
    assert.deepEqual(await small.documentIntoCustody(other), { skipped: "too_large" });
    assert.equal(fake.downloads["D1-big"], undefined);
  });
});

test("token status for health reads no network and creates no directories", async () => {
  await withFake(async (fake, dir) => {
    const status = readTokenStatus({
      stateDir: dir,
      connectionId: CONNECTION_ID,
      clientId: FAKE_CLIENT_ID,
      clientSecret: FAKE_CLIENT_SECRET,
    });
    assert.deepEqual(status, {
      token_cached: false,
      token_expires_at: null,
      token_requests_24h: 0,
      token_request_failures: 0,
      token_requests_paused_until: null,
      auth_failed_at: null,
    });
    assert.equal(existsSync(join(dir, "token-cache")), false);
    assert.equal(fake.requests.length, 0);
  });
});

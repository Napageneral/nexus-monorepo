import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { format } from "node:util";
import {
  type AdapterContext,
  type AdapterInboundRecord,
  AdapterInboundRecordSchema,
} from "@nexus-project/adapter-sdk-ts";
import {
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  type FakeFlexport,
  startFakeFlexport,
} from "../testdata/fake-flexport.mjs";
import { REMOTE_WRITE_METHODS, flexportAdapter } from "./adapter.ts";

const CONNECTION_ID = "test-flexport";
const quiet = { debug() {}, info() {}, error() {} };

type Harness = {
  fake: FakeFlexport;
  dir: string;
  lines: string[];
  errors: string[];
  context: (options?: {
    config?: Record<string, unknown>;
    fields?: Record<string, string>;
    checkpoints?: Record<string, unknown> | undefined;
    signal?: AbortSignal;
  }) => AdapterContext;
};

async function withHarness(run: (harness: Harness) => Promise<void>): Promise<void> {
  const fake = await startFakeFlexport();
  const dir = mkdtempSync(join(tmpdir(), "nexus-flexport-adapter-"));
  const previous = process.env.NEXUS_ADAPTER_STATE_DIR;
  process.env.NEXUS_ADAPTER_STATE_DIR = dir;
  const lines: string[] = [];
  const errors: string[] = [];
  const stdout = {
    write(chunk: string) {
      lines.push(...String(chunk).split("\n").filter(Boolean));
      return true;
    },
  } as unknown as NodeJS.WriteStream;
  const harness: Harness = {
    fake,
    dir,
    lines,
    errors,
    context: (options = {}) => ({
      runtime: {
        platform: "flexport",
        connection_id: CONNECTION_ID,
        config: { base_url: fake.url, ...options.config },
        credential: {
          kind: "api_key",
          value: FAKE_CLIENT_SECRET,
          fields: options.fields ?? { client_id: FAKE_CLIENT_ID, client_secret: FAKE_CLIENT_SECRET, account: "moonsleep" },
          ref: `flexport/${CONNECTION_ID}`,
          service: "flexport",
          account: CONNECTION_ID,
          auth_id: "api_key",
          type: "api_key",
        },
        ...("checkpoints" in options ? (options.checkpoints ? { checkpoints: options.checkpoints } : {}) : { checkpoints: {} }),
      },
      signal: options.signal ?? new AbortController().signal,
      stdout,
      stderr: process.stderr,
      log: { ...quiet, error: (message: string, ...args: unknown[]) => errors.push(format(message, ...args)) },
    }),
  };
  try {
    await run(harness);
  } finally {
    if (previous === undefined) delete process.env.NEXUS_ADAPTER_STATE_DIR;
    else process.env.NEXUS_ADAPTER_STATE_DIR = previous;
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function info() {
  return await flexportAdapter.operations["adapter.info"]!({
    runtime: null,
    signal: new AbortController().signal,
    stdout: process.stdout,
    stderr: process.stderr,
    log: quiet,
  });
}

async function backfill(harness: Harness, context = harness.context()): Promise<AdapterInboundRecord[]> {
  const records: AdapterInboundRecord[] = [];
  await flexportAdapter.operations["records.backfill"]!(
    context,
    { connection_id: CONNECTION_ID, since: new Date("2001-01-01T00:00:00Z") },
    (record) => records.push(AdapterInboundRecordSchema.parse(record)),
  );
  return records;
}

async function call(harness: Harness, name: string, payload: Record<string, unknown>, context = harness.context()) {
  return await flexportAdapter.operations.methods![name]!(context, { connection_id: CONNECTION_ID, payload });
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("condition not reached");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

test("adapter.info declares the api_key auth, ingest operations and exactly eight methods", async () => {
  const reflected = await info();
  assert.equal(reflected.platform, "flexport");
  assert.equal(reflected.name, "flexport-adapter");
  assert.equal(reflected.version, "0.1.0");
  assert.equal(reflected.credential_service, "flexport");
  assert.deepEqual(reflected.auth?.methods, [
    {
      id: "flexport_client_credentials",
      type: "api_key",
      label: "Connect Flexport API client",
      icon: "key",
      service: "flexport",
      fields: [
        { name: "client_id", label: "Client ID", type: "text", required: true },
        { name: "client_secret", label: "Client secret", type: "secret", required: true },
        { name: "account", label: "Account", type: "text", required: false },
      ],
    },
  ]);
  assert.deepEqual(reflected.operations, [
    "adapter.info",
    "adapter.connections.list",
    "adapter.health",
    "adapter.monitor.start",
    "records.backfill",
  ]);
  assert.deepEqual(
    reflected.methods.map((entry) => [entry.name, entry.action, entry.mutates_remote, entry.connection_required]),
    [
      ["flexport.status", "read", false, true],
      ["flexport.shipments.list", "read", false, true],
      ["flexport.shipments.bundle", "read", false, true],
      ["flexport.network.get", "read", false, true],
      ["flexport.products.create", "write", true, true],
      ["flexport.products.update", "write", true, true],
      ["flexport.bookings.create", "write", true, true],
      ["flexport.documents.create", "write", true, true],
    ],
  );
});

test("health never calls the network and reports every write as guarded, none automatic", async () => {
  await withHarness(async (harness) => {
    const health = await flexportAdapter.operations["adapter.health"]!(harness.context(), { connection_id: CONNECTION_ID });
    assert.equal(health.connected, true);
    assert.deepEqual(health.account_contact, { platform: "flexport", space_id: "", contact_id: CONNECTION_ID });
    assert.equal(health.details?.automatic_writes, false);
    assert.deepEqual(health.details?.remote_write_methods, [...REMOTE_WRITE_METHODS]);
    assert.equal(health.details?.token_cached, false);
    assert.equal(health.details?.token_requests_24h, 0);
    assert.equal(health.details?.last_success_at, null);
    const status = await call(harness, "flexport.status", {});
    assert.deepEqual(status, health.details);
    const unreachable = harness.context({ config: { base_url: "http://127.0.0.1:9" } });
    assert.equal((await flexportAdapter.operations["adapter.health"]!(unreachable, { connection_id: CONNECTION_ID })).connected, true);
    assert.equal(harness.fake.requests.length, 0);
    assert.deepEqual(harness.lines, []);
  });
});

test("health refuses missing credential fields and never falls back to credential.value", async () => {
  await withHarness(async (harness) => {
    const context = harness.context({ fields: { client_id: FAKE_CLIENT_ID } });
    await assert.rejects(
      async () => await flexportAdapter.operations["adapter.health"]!(context, { connection_id: CONNECTION_ID }),
      /client_id and client_secret are required/,
    );
    const offsite = harness.context({ config: { base_url: "https://flexport.example.com" } });
    await assert.rejects(
      async () => await flexportAdapter.operations["adapter.health"]!(offsite, { connection_id: CONNECTION_ID }),
      /base_url must be/,
    );
    assert.equal(harness.fake.requests.length, 0);
  });
});

test("backfill emits the shipment bundle with its final document attached, and the network", async () => {
  await withHarness(async (harness) => {
    const records = await backfill(harness);
    assert.deepEqual(records.map((record) => record.payload.external_record_id), ["shipment:1234567", "network:me"]);
    const shipment = records[0]!;
    assert.equal(shipment.payload.source_record_type, "flexport_shipment_bundle");
    const bundle = JSON.parse(String((shipment.payload.payload as Record<string, unknown>).provider_object_json));
    assert.deepEqual(bundle.legs.map((row: { id: number }) => row.id), [21, 22]);
    assert.deepEqual(bundle.documents.map((row: { id: string }) => row.id), ["D1", "D3"]);
    assert.equal(shipment.payload.attachments?.length, 1);
    const attachment = shipment.payload.attachments![0]!;
    assert.equal(attachment.id, "document:D1");
    assert.ok(attachment.local_path?.startsWith(`${realpathSync(harness.dir)}/attachment-custody/sha256/`));
    assert.equal(
      createHash("sha256").update(readFileSync(attachment.local_path!)).digest("hex"),
      attachment.content_hash,
    );
    assert.equal(harness.fake.downloads.D1, 1);
    assert.equal(harness.fake.downloads.D3, undefined, "archived documents are not downloaded");
    assert.equal(harness.fake.downloads.D9, undefined, "another shipment's document is never touched");
    assert.equal(records[1]!.payload.source_record_type, "flexport_network");
    assert.equal(harness.fake.tokenRequests, 1);

    const again = await backfill(harness);
    assert.deepEqual(again, records, "a repeated backfill re-emits the identical Records");
    assert.equal(harness.fake.downloads.D1, 1, "the document is downloaded once");
    assert.equal(harness.fake.tokenRequests, 1);
  });
});

test("one failing shipment does not stop the pass, and the backfill still fails loudly", async () => {
  await withHarness(async (harness) => {
    harness.fake.fixtures.shipments.push({ ...harness.fake.fixtures.shipments[0], id: 2000002, name: "second" });
    harness.fake.inject({ path: "/shipments/1234567", status: 500, times: 1 });
    const records: AdapterInboundRecord[] = [];
    await assert.rejects(
      async () =>
        await flexportAdapter.operations["records.backfill"]!(
          harness.context(),
          { connection_id: CONNECTION_ID, since: new Date("2001-01-01T00:00:00Z") },
          (record) => records.push(record),
        ),
      /^Error: 1 Flexport shipment bundle\(s\) failed; first: shipment 1234567: Flexport GET \/shipments\/1234567 failed \(HTTP 500\)$/,
    );
    assert.deepEqual(records.map((record) => record.payload.external_record_id), ["shipment:2000002", "network:me"]);
  });
});

test("backfill honors since and to on shipment updated_at", async () => {
  await withHarness(async (harness) => {
    const records: AdapterInboundRecord[] = [];
    await flexportAdapter.operations["records.backfill"]!(
      harness.context(),
      { connection_id: CONNECTION_ID, since: new Date("2026-10-21T00:00:00Z"), to: new Date("2026-10-22T00:00:00Z") },
      (record) => records.push(record),
    );
    assert.deepEqual(records.map((record) => record.payload.external_record_id), ["network:me"]);
    assert.equal(harness.fake.requests.some((request) => request.path === "/shipments/1234567"), false);
  });
});

test("the monitor emits changed bundles only, checkpoints each pass and records status", async () => {
  await withHarness(async (harness) => {
    const controller = new AbortController();
    const records: AdapterInboundRecord[] = [];
    const checkpoints = () => harness.lines.map((line) => JSON.parse(line)).filter((line) => line.nex === "checkpoint");
    const running = flexportAdapter.operations["adapter.monitor.start"]!(
      harness.context({ config: { poll_interval_ms: 20 }, signal: controller.signal }),
      { connection_id: CONNECTION_ID },
      (record) => records.push(AdapterInboundRecordSchema.parse(record)),
    );
    await waitFor(() => checkpoints().length >= 2);
    assert.deepEqual(records.map((record) => record.payload.external_record_id), ["shipment:1234567", "network:me"]);
    harness.fake.fixtures.shipments[0].status = "arrival_port";
    harness.fake.fixtures.shipments[0].updated_at = "2026-10-21T06:00:00.000Z";
    await waitFor(() => records.length >= 3);
    const passesBefore = checkpoints().length;
    await waitFor(() => checkpoints().length >= passesBefore + 2);
    controller.abort();
    await running;
    assert.deepEqual(records.map((record) => record.payload.external_record_id), [
      "shipment:1234567",
      "network:me",
      "shipment:1234567",
    ], "unchanged bundles are not re-emitted; the network is daily");
    assert.match(records[2]!.payload.content, /: arrival_port;/);
    const [first, second] = checkpoints();
    assert.equal(first.scope, "monitor");
    assert.equal(first.key, "poll");
    assert.deepEqual(Object.keys(first.value).sort(), [
      "bundles_read",
      "last_success_at",
      "network_at",
      "records_emitted",
      "shipments_listed",
    ]);
    assert.equal(first.value.records_emitted, 2);
    assert.equal(second.value.records_emitted, 0);
    assert.equal(second.value.network_at, first.value.network_at);
    const status = JSON.parse(readFileSync(join(harness.dir, "status", `${CONNECTION_ID}.json`), "utf8"));
    assert.ok(status.last_success_at);
    assert.equal(harness.fake.downloads.D1, 1);
    assert.equal(harness.fake.tokenRequests, 1);
    const health = await flexportAdapter.operations["adapter.health"]!(harness.context(), { connection_id: CONNECTION_ID });
    assert.equal(health.details?.last_success_at, checkpoints().at(-1).value.last_success_at);
    assert.equal(health.details?.token_cached, true);
    assert.equal(health.details?.token_requests_24h, 1);
  });
});

test("the monitor selects recent or undelivered shipments and skips old delivered ones", async () => {
  await withHarness(async (harness) => {
    const base = harness.fake.fixtures.shipments[0];
    harness.fake.fixtures.shipments.push(
      { ...base, id: 2000001, name: "old delivered", updated_at: "2025-01-01T00:00:00.000Z", actual_delivered_in_full_date: "2025-01-01T00:00:00.000Z" },
      { ...base, id: 2000002, name: "old undelivered", updated_at: "2025-01-01T00:00:00.000Z", actual_delivered_in_full_date: null },
    );
    const controller = new AbortController();
    const records: AdapterInboundRecord[] = [];
    const running = flexportAdapter.operations["adapter.monitor.start"]!(
      harness.context({ signal: controller.signal, checkpoints: undefined }),
      { connection_id: CONNECTION_ID },
      (record) => records.push(record),
    );
    await waitFor(() => existsSync(join(harness.dir, "status", `${CONNECTION_ID}.json`)));
    controller.abort();
    await running;
    assert.deepEqual(records.map((record) => record.payload.external_record_id).sort(), [
      "network:me",
      "shipment:1234567",
      "shipment:2000002",
    ]);
    assert.equal(harness.lines.length, 0, "no checkpoint line without runtime-managed checkpoints");
  });
});

test("a failing pass logs one line without the body, records the error and keeps running", async () => {
  await withHarness(async (harness) => {
    harness.fake.inject({
      path: "/shipments",
      status: 500,
      times: 10,
      body: { error: { code: "unknown_error", message: `leak ${FAKE_CLIENT_SECRET}` } },
    });
    const controller = new AbortController();
    const running = flexportAdapter.operations["adapter.monitor.start"]!(
      harness.context({ signal: controller.signal }),
      { connection_id: CONNECTION_ID },
      () => {},
    );
    const statusPath = join(harness.dir, "status", `${CONNECTION_ID}.json`);
    await waitFor(() => existsSync(statusPath));
    controller.abort();
    await running;
    const status = JSON.parse(readFileSync(statusPath, "utf8"));
    assert.equal(status.last_error, "Flexport GET /shipments failed (HTTP 500, unknown_error)");
    assert.ok(status.last_error_at);
    assert.deepEqual(harness.errors, ["Flexport monitor pass failed: Flexport GET /shipments failed (HTTP 500, unknown_error)"]);
    assert.ok(!JSON.stringify(status).includes(FAKE_CLIENT_SECRET));
    const health = await flexportAdapter.operations["adapter.health"]!(harness.context(), { connection_id: CONNECTION_ID });
    assert.equal(health.connected, true);
    assert.equal(health.details?.last_error_at, status.last_error_at);
  });
});

test("the read methods list, bundle and read the network", async () => {
  await withHarness(async (harness) => {
    assert.deepEqual(await call(harness, "flexport.shipments.list", { limit: 5 }), {
      shipments: [
        {
          id: "1234567",
          name: "SWRC26012 S3 Ningbo to Vernon",
          status: "in_transit_to_arrival_port",
          updated_at: "2026-10-20T12:00:00.000Z",
          transportation_mode: "ocean",
        },
      ],
    });
    await assert.rejects(call(harness, "flexport.shipments.list", { limit: 500 }), /limit must be an integer/);
    const bundled = (await call(harness, "flexport.shipments.bundle", { shipment_id: "1234567" })) as {
      bundle: Record<string, unknown>;
      bundle_sha256: string;
    };
    assert.equal(bundled.bundle_sha256, sha256(JSON.stringify(bundled.bundle)));
    await assert.rejects(call(harness, "flexport.shipments.bundle", { shipment_id: "../oauth/token" }), /shipment_id is invalid/);
    const network = (await call(harness, "flexport.network.get", {})) as { network: Record<string, unknown> };
    assert.deepEqual(Object.keys(network.network), ["companies", "company_entities", "locations", "me_company"]);
    assert.equal(harness.fake.downloads.D1, undefined, "read methods never download documents");
  });
});

const WRITES: Array<{ name: string; extra?: Record<string, string>; method: string; path: string; id: string }> = [
  { name: "flexport.products.create", method: "POST", path: "/products", id: "9001" },
  { name: "flexport.products.update", extra: { product_id: "P-77" }, method: "PATCH", path: "/products/P-77", id: "P-77" },
  { name: "flexport.bookings.create", method: "POST", path: "/bookings", id: "BK-1001" },
  { name: "flexport.documents.create", method: "POST", path: "/documents", id: "DOC-2001" },
];

test("every write refuses before any network call without go, confirm and a matching sha", async () => {
  await withHarness(async (harness) => {
    const bodyJson = '{"name":"S3 booking",  "zeta":1, "alpha":"é"}';
    const valid = { body_json: bodyJson, body_sha256: sha256(bodyJson), go: "Tyler: book it", confirm: "SEND_TO_FLEXPORT" };
    for (const write of WRITES) {
      const base = { ...write.extra, ...valid };
      const refusals: Array<[Record<string, unknown>, RegExp]> = [
        [{ ...base, go: "" }, /go \(Tyler's words\) is required/],
        [{ ...base, go: undefined }, /go \(Tyler's words\) is required/],
        [{ ...base, confirm: "yes" }, /confirm must be SEND_TO_FLEXPORT/],
        [{ ...base, body_sha256: sha256(`${bodyJson} `) }, /body_sha256 does not match body_json/],
        [{ ...base, body_sha256: "ABC" }, /lowercase sha256/],
        [{ ...base, body_json: "[1]", body_sha256: sha256("[1]") }, /must be a JSON object/],
        [{ ...base, body_json: "{oops", body_sha256: sha256("{oops") }, /not valid JSON/],
        [{ ...base, extra_field: "x" }, /unexpected fields extra_field/],
      ];
      if (write.extra) refusals.push([{ ...base, product_id: "../x" }, /product_id is invalid/]);
      for (const [payload, expected] of refusals) {
        await assert.rejects(call(harness, write.name, payload), (error: Error) => {
          assert.match(error.message, expected, write.name);
          assert.ok(!error.message.includes("S3 booking"), "the body is never echoed");
          return true;
        });
      }
    }
    assert.equal(harness.fake.requests.length, 0, "no token request and no write was sent");
  });
});

test("every write sends body_json byte for byte and returns the Flexport object", async () => {
  await withHarness(async (harness) => {
    for (const write of WRITES) {
      const bodyJson = `{"name":"${write.name}",  "file_name":"CI.pdf", "nested":{"b":2,"a":1},"note":"é"}`;
      const result = await call(harness, write.name, {
        ...write.extra,
        body_json: bodyJson,
        body_sha256: sha256(bodyJson),
        go: "Tyler: send it",
        confirm: "SEND_TO_FLEXPORT",
      });
      const sent = harness.fake.requests.at(-1)!;
      assert.equal(sent.method, write.method);
      assert.equal(sent.path, write.path);
      assert.ok(sent.body.equals(Buffer.from(bodyJson, "utf8")), `${write.name} body is byte for byte`);
      assert.equal(sent.flexport_version, "2");
      const typed = result as { status: string; path: string; flexport_id: string; object: Record<string, unknown> };
      assert.equal(typed.status, "sent");
      assert.equal(typed.path, write.path);
      assert.equal(typed.flexport_id, write.id);
      assert.equal(String(typed.object.id), write.id);
      assert.ok(!JSON.stringify(result).includes(FAKE_CLIENT_SECRET));
    }
    const document = (await call(harness, "flexport.documents.create", {
      body_json: '{"file_name":"PL.pdf","document_type":"packing_list"}',
      body_sha256: sha256('{"file_name":"PL.pdf","document_type":"packing_list"}'),
      go: "Tyler: upload",
      confirm: "SEND_TO_FLEXPORT",
    })) as { object: Record<string, unknown> };
    assert.deepEqual(document.object, {
      _object: "/document",
      id: "DOC-2001",
      file_name: "PL.pdf",
      document_type: "packing_list",
    }, "documents.create maps data[0]");
    assert.equal(harness.fake.tokenRequests, 1);
  });
});

test("a refused write reports the HTTP status and slug code only", async () => {
  await withHarness(async (harness) => {
    harness.fake.inject({
      path: "/bookings",
      method: "POST",
      status: 400,
      body: { error: { code: "invalid_param", message: "origin_address_ref does not exist in your network" } },
    });
    const bodyJson = '{"name":"x"}';
    await assert.rejects(
      call(harness, "flexport.bookings.create", { body_json: bodyJson, body_sha256: sha256(bodyJson), go: "go", confirm: "SEND_TO_FLEXPORT" }),
      (error: Error) => {
        assert.equal(error.message, "Flexport POST /bookings failed (HTTP 400, invalid_param)");
        return true;
      },
    );
  });
});

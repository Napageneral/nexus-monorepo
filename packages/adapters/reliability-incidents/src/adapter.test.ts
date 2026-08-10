import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { AdapterContext, AdapterInboundRecord } from "@nexus-project/adapter-sdk-ts";

import {
  buildRecordIngestEnvelope,
  captureBatch,
  captureNormalizedEvent,
  normalizeIncidentTransition,
  readRuntimeConfig,
  reliabilityIncidentsAdapter,
} from "./adapter.ts";

function fixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 1,
    event_id: "evt-checkout-001-detected",
    incident_id: "inc-checkout-001",
    source_id: "moonsleep-production",
    detector_id: "checkout-tripwire",
    occurred_at: "2026-08-10T21:00:00.000Z",
    observed_at: "2026-08-10T21:00:05.000Z",
    transition: "detected",
    status: "open",
    incident_class: "checkout.availability",
    severity: "critical",
    title: "Checkout completion collapsed",
    summary: "Completion is below the same-clock baseline with sufficient volume.",
    affected_components: ["shopify-checkout", "checkout-health"],
    customer_impact: {
      status: "possible",
      summary: "Some shoppers may be unable to complete checkout.",
    },
    correlation_key: "checkout:completion-collapse",
    evidence_refs: [
      {
        ref_type: "health_receipt",
        uri: "receipt://checkout-health/2026-08-10T21:00:00Z",
        digest: "sha256:abc123",
      },
    ],
    change_refs: ["release:checkout-20260810"],
    metadata: { window_starts: 40, window_completed: 2 },
    ...overrides,
  };
}

function context(): AdapterContext {
  return {
    signal: new AbortController().signal,
    runtime: {
      platform: "reliability-incidents",
      connection_id: "conn-reliability-1",
      config: {
        source_id: "moonsleep-production",
        display_name: "MoonSleep Production",
        environment: "production",
      },
    },
    log: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    stdout: process.stdout,
    stderr: process.stderr,
  } as AdapterContext;
}

async function withStateDir<T>(work: () => Promise<T>): Promise<T> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "reliability-incidents-test-"));
  const previous = process.env.NEXUS_ADAPTER_STATE_DIR;
  process.env.NEXUS_ADAPTER_STATE_DIR = directory;
  try {
    return await work();
  } finally {
    if (previous === undefined) delete process.env.NEXUS_ADAPTER_STATE_DIR;
    else process.env.NEXUS_ADAPTER_STATE_DIR = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("normalizes a complete incident transition and binds it to the configured source", () => {
  const normalized = normalizeIncidentTransition(fixture(), "moonsleep-production");
  assert.equal(normalized.event_id, "evt-checkout-001-detected");
  assert.equal(normalized.source_id, "moonsleep-production");
  assert.equal(normalized.occurred_at, "2026-08-10T21:00:00.000Z");
  assert.deepEqual(normalized.affected_components, ["shopify-checkout", "checkout-health"]);
  assert.equal(normalized.customer_impact.status, "possible");
});

test("projects source, channel, incident thread, and immutable event identity into Nex", () => {
  const ctx = context();
  const config = readRuntimeConfig(ctx);
  const event = normalizeIncidentTransition(fixture(), config.source_id);
  const envelope = buildRecordIngestEnvelope(ctx, config, event);

  assert.equal(envelope.routing.platform, "reliability-incidents");
  assert.equal(envelope.routing.receiver_id, "conn-reliability-1");
  assert.equal(envelope.routing.space_id, "moonsleep-production");
  assert.equal(envelope.routing.container_id, "incidents:moonsleep-production");
  assert.equal(envelope.routing.thread_id, "inc-checkout-001");
  assert.equal(envelope.payload.external_record_id, "moonsleep-production:evt-checkout-001-detected");
  assert.match(envelope.payload.content, /Checkout completion collapsed/u);
  assert.equal((envelope.payload.metadata?.incident_event as Record<string, unknown>).transition, "detected");
});

test("suppresses an exact replay after the first accepted emission", async () => {
  await withStateDir(async () => {
    const ctx = context();
    const config = readRuntimeConfig(ctx);
    const event = normalizeIncidentTransition(fixture(), config.source_id);
    const emitted: AdapterInboundRecord[] = [];
    const emit = async (record: AdapterInboundRecord) => {
      emitted.push(record);
    };

    const first = await captureNormalizedEvent(ctx, config, event, emit);
    const second = await captureNormalizedEvent(ctx, config, event, emit);

    assert.equal(first.deduped, false);
    assert.equal(second.deduped, true);
    assert.equal(emitted.length, 1);
  });
});

test("emits a corrected event as a revision with the same external record id", async () => {
  await withStateDir(async () => {
    const ctx = context();
    const config = readRuntimeConfig(ctx);
    const emitted: AdapterInboundRecord[] = [];
    const emit = async (record: AdapterInboundRecord) => {
      emitted.push(record);
    };
    const first = normalizeIncidentTransition(fixture(), config.source_id);
    const corrected = normalizeIncidentTransition(
      fixture({ summary: "Corrected summary after detector evidence was reconciled." }),
      config.source_id,
    );

    await captureNormalizedEvent(ctx, config, first, emit);
    const result = await captureNormalizedEvent(ctx, config, corrected, emit);

    assert.equal(result.revision, true);
    assert.equal(emitted.length, 2);
    assert.equal(emitted[0]?.payload.external_record_id, emitted[1]?.payload.external_record_id);
    assert.notEqual(emitted[0]?.payload.content, emitted[1]?.payload.content);
  });
});

test("rejects reuse of an event id for a different incident identity", async () => {
  await withStateDir(async () => {
    const ctx = context();
    const config = readRuntimeConfig(ctx);
    const emitted: AdapterInboundRecord[] = [];
    const emit = async (record: AdapterInboundRecord) => {
      emitted.push(record);
    };
    await captureNormalizedEvent(
      ctx,
      config,
      normalizeIncidentTransition(fixture(), config.source_id),
      emit,
    );

    const drifted = normalizeIncidentTransition(
      fixture({ incident_id: "inc-different-999" }),
      config.source_id,
    );
    await assert.rejects(
      captureNormalizedEvent(ctx, config, drifted, emit),
      /event_id identity drift detected/u,
    );
    assert.equal(emitted.length, 1);
  });
});

test("validates an entire batch before emitting any record", async () => {
  await withStateDir(async () => {
    const ctx = context();
    const config = readRuntimeConfig(ctx);
    const emitted: AdapterInboundRecord[] = [];
    await assert.rejects(
      captureBatch(
        ctx,
        config,
        [fixture(), fixture({ event_id: "evt-invalid", severity: "panic" })],
        async (record) => {
          emitted.push(record);
        },
      ),
      /severity is not supported/u,
    );
    assert.equal(emitted.length, 0);
  });
});

test("rejects credential-like metadata keys while allowing incident prose", () => {
  assert.throws(
    () =>
      normalizeIncidentTransition(
        fixture({ metadata: { api_token: "must-not-enter-nex" } }),
        "moonsleep-production",
      ),
    /not allowed in reliability incident metadata/u,
  );

  const normalized = normalizeIncidentTransition(
    fixture({ summary: "The upstream token refresh operation failed without exposing the token." }),
    "moonsleep-production",
  );
  assert.match(normalized.summary, /token refresh/u);
});

test("fails closed when a producer claims a different source", () => {
  assert.throws(
    () => normalizeIncidentTransition(fixture({ source_id: "other-production" }), "moonsleep-production"),
    /source_id does not match/u,
  );
});

test("declares only inbound serve operations and no remote mutation methods", async () => {
  const handler = reliabilityIncidentsAdapter.operations["adapter.info"];
  assert.ok(handler);
  const info = await handler(context());
  assert.ok(info.operations.includes("adapter.serve.start"));
  assert.ok(info.operations.includes("adapter.setup.start"));
  assert.ok(info.operations.includes("adapter.setup.submit"));
  assert.equal(info.auth?.methods.length, 1);
  assert.deepEqual(info.methods, []);
  assert.equal(info.platform, "reliability-incidents");
});

test("setup returns a credential-free source binding and requires the read-only boundary", async () => {
  const start = reliabilityIncidentsAdapter.operations["adapter.setup.start"];
  const submit = reliabilityIncidentsAdapter.operations["adapter.setup.submit"];
  assert.ok(start);
  assert.ok(submit);
  const started = await start(context(), { session_id: "setup-1" });
  assert.equal(started.status, "requires_input");
  assert.equal(started.fields?.some((field) => field.type === "secret"), false);

  const completed = await submit(context(), {
    session_id: "setup-1",
    payload: {
      source_id: "moonsleep-production",
      display_name: "MoonSleep Production",
      environment: "production",
      confirm_source_boundary: "REGISTER_RELIABILITY_SOURCE_READ_ONLY",
    },
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.connection_id, "moonsleep-production");
  assert.equal(completed.secret_fields, undefined);
  assert.equal(completed.metadata?.remote_write_authority, false);
  assert.equal(completed.metadata?.remediation_authority, false);

  await assert.rejects(
    async () =>
      await submit(context(), {
        payload: {
          source_id: "moonsleep-production",
          display_name: "MoonSleep Production",
          confirm_source_boundary: "wrong",
        },
      }),
    /confirmation is invalid/u,
  );
});

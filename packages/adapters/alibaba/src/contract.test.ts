import assert from "node:assert/strict";
import test from "node:test";
import { alibabaAdapter } from "./adapter.ts";

test("adapter reflection is read-only and exposes only ingest operations", async () => {
  const infoOperation = alibabaAdapter.operations["adapter.info"];
  assert.ok(infoOperation);
  const info = await infoOperation({
    runtime: null,
    signal: new AbortController().signal,
    stdout: process.stdout,
    stderr: process.stderr,
    log: {
      debug() {},
      info() {},
      error() {},
    },
  });
  assert.equal(info.platform, "alibaba");
  assert.equal(info.version, "0.2.2");
  assert.deepEqual(info.auth?.methods, [
    {
      id: "alibaba_browser_snapshot",
      type: "custom_flow",
      label: "Attach sanitized Alibaba browser capture",
      icon: "browser",
      service: "alibaba",
    },
  ]);
  assert.match(info.auth?.setupGuide ?? "", /never receives Alibaba login credentials/u);
  assert.deepEqual(info.methods, []);
  assert.ok(info.operations.includes("records.backfill"));
  assert.ok(info.operations.includes("adapter.monitor.start"));
  assert.ok(info.operations.includes("adapter.setup.start"));
  assert.ok(info.operations.includes("adapter.setup.submit"));
  assert.ok(!info.operations.includes("adapter.serve.start"));
  assert.equal(info.platform_capabilities.supports_media, true);
});

test("browser capture setup validates sealed evidence and returns a credential-free connection", async () => {
  const start = alibabaAdapter.operations["adapter.setup.start"];
  const submit = alibabaAdapter.operations["adapter.setup.submit"];
  assert.ok(start);
  assert.ok(submit);

  const controller = new AbortController();
  const context = {
    runtime: null,
    signal: controller.signal,
    stdout: process.stdout,
    stderr: process.stderr,
    log: {
      debug() {},
      info() {},
      error() {},
    },
  };
  const started = await start(context, {
    session_id: "setup-test",
    connection_id: "provisional",
  });
  assert.equal(started.status, "requires_input");
  assert.equal(started.fields?.some((field) => field.type === "secret"), false);

  const snapshotRoot = new URL("../testdata/snapshots", import.meta.url).pathname;
  const objectRoot = snapshotRoot;
  const completed = await submit(context, {
    session_id: "setup-test",
    connection_id: "provisional",
    payload: {
      snapshot_root: snapshotRoot,
      object_root: objectRoot,
      account_id: "moonsleep-alibaba",
      account_label: "MoonSleep Alibaba",
      confirm_read_only_capture: "ATTACH_SANITIZED_ALIBABA_CAPTURE",
    },
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.connection_id, "moonsleep-alibaba");
  assert.deepEqual(completed.account_contact, {
    platform: "alibaba",
    space_id: "moonsleep-alibaba",
    contact_id: "moonsleep-alibaba",
  });
  assert.equal(completed.secret_fields, undefined);
  assert.equal(completed.metadata?.provider_credentials_received, false);
  assert.equal(completed.metadata?.provider_write_authority, false);

  await assert.rejects(
    async () =>
      await submit(context, {
        session_id: "setup-test",
        payload: {
          snapshot_root: snapshotRoot,
          object_root: objectRoot,
          account_id: "moonsleep-alibaba",
          account_label: "MoonSleep Alibaba",
          confirm_read_only_capture: "wrong",
        },
      }),
    /confirmation is invalid/u,
  );
});

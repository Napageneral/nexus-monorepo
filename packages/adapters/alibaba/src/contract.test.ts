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
  assert.equal(info.version, "0.2.0");
  assert.deepEqual(info.methods, []);
  assert.ok(info.operations.includes("records.backfill"));
  assert.ok(info.operations.includes("adapter.monitor.start"));
  assert.ok(!info.operations.includes("adapter.serve.start"));
  assert.equal(info.platform_capabilities.supports_media, true);
});

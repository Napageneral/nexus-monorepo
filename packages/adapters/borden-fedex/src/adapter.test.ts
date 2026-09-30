import test from "node:test";
import assert from "node:assert/strict";
import { __test__, bordenFedexAdapter } from "./adapter.ts";

const validPayload = {
  account_id: "borden-production",
  account_label: "Borden FedEx Billing",
  source_custody_ref: "private://borden-fedex/artifacts",
  confirm_read_only_source: "REGISTER_BORDEN_FEDEX_EXTERNAL_CAPTURE_READ_ONLY",
};

test("adapter advertises only the external read-only setup flow", async () => {
  const infoOperation = bordenFedexAdapter.operations["adapter.info"];
  assert.ok(infoOperation);
  const info = await infoOperation({
    runtime: null,
    signal: new AbortController().signal,
    stdout: process.stdout,
    stderr: process.stderr,
    log: { debug() {}, info() {}, error() {} },
  });
  assert.equal(info.platform, "fedex_billing_online");
  assert.equal(info.auth?.methods.length, 1);
  assert.deepEqual(info.auth?.methods[0], {
    id: "borden_fedex_external_capture",
    type: "custom_flow",
    label: "Register Borden FedEx external capture",
    icon: "browser",
    service: "fedex-billing-online",
    fields: __test__.setupFields(),
  });
  assert.deepEqual(info.methods, []);
  assert.ok(!info.operations.includes("records.backfill"));
  assert.ok(!info.operations.includes("adapter.monitor.start"));
  assert.ok(info.operations.includes("adapter.setup.start"));
  assert.ok(info.operations.includes("adapter.setup.submit"));
});

test("setup creates an exact non-secret account binding", () => {
  assert.deepEqual(__test__.setupConfig(validPayload), {
    account_id: "borden-production",
    account_label: "Borden FedEx Billing",
    source_contract: "moonsleep.borden_fedex_source_capture_receipt.v1",
    source_custody_ref: "private://borden-fedex/artifacts",
  });
});

test("setup rejects extra fields, credentials, and missing read-only confirmation", () => {
  assert.throws(() => __test__.setupConfig({ ...validPayload, password: "never" }), /unexpected fields/);
  assert.throws(() => __test__.setupConfig({ ...validPayload, confirm_read_only_source: "yes" }), /confirmation is invalid/);
  assert.throws(() => __test__.setupConfig({ ...validPayload, source_custody_ref: "/tmp/export.csv" }), /custody_ref is invalid/);
});

test("health declares every mutation authority false", () => {
  const result = __test__.health(__test__.setupConfig(validPayload));
  assert.equal(result.connected, true);
  assert.equal(result.details?.provider_credentials_received, false);
  assert.equal(result.details?.provider_write_authority, false);
  assert.equal(result.details?.source_registration_authority, false);
  assert.equal(result.details?.dispatch_write_authority, false);
  assert.equal(result.details?.finance_write_authority, false);
  assert.equal(result.details?.claims_write_authority, false);
});

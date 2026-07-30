import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { verifyDormantUpgradeReadback } from "../scripts/verify-dormant-upgrade-postflight.mjs";

const contract = JSON.parse(
  readFileSync(
    new URL("../contracts/partner-production-release.v1.json", import.meta.url),
    "utf8",
  ),
);

function noProhibitedSchemaField(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(noProhibitedSchemaField);
  if (!value || typeof value !== "object") return true;
  return Object.entries(value as Record<string, unknown>).every(
    ([field, nested]) => field !== "kind" && noProhibitedSchemaField(nested),
  );
}

function readback(phase: "upgraded" | "rolled_back") {
  return {
    contract_id: "moonsleep.partner.dormant-upgrade-readback.v1",
    phase,
    app: {
      present: true,
      app_id: "moonsleep-partner-desk",
      app_version: phase === "upgraded" ? "0.3.2" : "0.3.1",
      state: "active",
    },
    health: {
      status: "ok",
      continuous_projection: "dormant_pending_backfill_parity_and_activation_receipt",
      canonical_evidence: {
        fact_profiles_registered: 5,
        observation_profiles_registered: 3,
        set_profiles_registered_in_package: 3,
        registration_complete: true,
        canonical_promotion_enabled: false,
      },
      provider_write_authority: false,
      reply_authority: false,
    },
    work: {
      owned_job_count: 1,
      owned_job_status: "inactive",
      owned_subscription_count: 2,
      enabled_subscription_count: 0,
    },
    profiles: { registration_delta: 0 },
    state_deltas: Object.fromEntries(
      Object.entries(contract.forbidden_effects)
        .filter(([field]) => field !== "provider_call_count")
        .map(([field]) => [field, 0]),
    ),
    effects: {
      provider_call_count: 0,
      ...Object.fromEntries(Object.keys(contract.authority).map((field) => [field, false])),
    },
  };
}

test("release contract is exact, dormant, rollback-bound, and has no prohibited schema field", () => {
  assert.equal(contract.app.app_id, "moonsleep-partner-desk");
  assert.equal(contract.app.app_version, "0.3.2");
  assert.equal(contract.governing_core.commit, "f6ff4816befeba60a480e05597f2fa904b4144a3");
  assert.equal(contract.governing_core.tree, "75de9b1a5b813933187c2a685945760bf1737329");
  assert.equal(contract.dormant_upgrade.endpoint, "/api/apps/upgrade");
  assert.deepEqual(contract.dormant_upgrade.request, {
    appId: "moonsleep-partner-desk",
    targetVersion: "0.3.2",
    packageRef: "${HOST_EXTRACTED_PACKAGE_DIR}",
  });
  assert.equal(contract.dormant_upgrade.preconditions.current_app_version, "0.3.1");
  assert.equal(contract.rollback.endpoint, "/api/apps/upgrade");
  assert.equal(contract.rollback.request.targetVersion, "0.3.1");
  assert.equal(
    contract.rollback.request.packageRef,
    "/var/lib/nex/state/packages/installed/app/moonsleep-partner-desk/releases/0.3.1",
  );
  assert.equal(contract.dormant_upgrade.expected_owned_job_status, "inactive");
  assert.equal(contract.dormant_upgrade.expected_enabled_subscription_count, 0);
  assert.ok(Object.values(contract.authority).every((value) => value === false));
  assert.equal(noProhibitedSchemaField(contract), true);
});

test("accepts the exact upgraded dormant readback", () => {
  const receipt = verifyDormantUpgradeReadback(readback("upgraded"), contract);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.phase, "upgraded");
  assert.equal(receipt.provider_calls, 0);
});

test("accepts exact rollback to the retained dormant 0.3.1 release", () => {
  const receipt = verifyDormantUpgradeReadback(readback("rolled_back"), contract);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.phase, "rolled_back");
  assert.equal(receipt.profile_registration_delta, 0);
});

test("fails closed on any provider call, enabled subscription, or local evidence write", () => {
  const providerCall = readback("upgraded");
  providerCall.effects.provider_call_count = 1;
  assert.throws(
    () => verifyDormantUpgradeReadback(providerCall, contract),
    /provider calls are forbidden/,
  );

  const enabledSubscription = readback("upgraded");
  enabledSubscription.work.enabled_subscription_count = 1;
  assert.throws(
    () => verifyDormantUpgradeReadback(enabledSubscription, contract),
    /work is not dormant/,
  );

  const factWrite = readback("upgraded");
  factWrite.state_deltas.fact_delta = 1;
  assert.throws(
    () => verifyDormantUpgradeReadback(factWrite, contract),
    /fact_delta must equal 0/,
  );
});

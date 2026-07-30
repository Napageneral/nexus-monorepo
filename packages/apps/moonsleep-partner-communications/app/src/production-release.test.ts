import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { verifyDormantInstallReadback } from "../scripts/verify-dormant-install-postflight.mjs";

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

function readback(phase: "installed" | "rolled_back") {
  return {
    contract_id: "moonsleep.partner.dormant-install-readback.v1",
    phase,
    app:
      phase === "installed"
        ? {
            present: true,
            app_id: "moonsleep-partner-desk",
            app_version: "0.3.1",
            state: "active",
          }
        : { present: false },
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
    work:
      phase === "installed"
        ? {
            owned_job_count: 1,
            owned_job_status: "inactive",
            owned_subscription_count: 2,
            enabled_subscription_count: 0,
          }
        : {
            owned_job_count: 0,
            owned_subscription_count: 0,
            enabled_subscription_count: 0,
          },
    profiles: { registration_delta: 8 },
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
  assert.equal(contract.app.app_version, "0.3.1");
  assert.equal(contract.governing_core.commit, "f6ff4816befeba60a480e05597f2fa904b4144a3");
  assert.equal(contract.governing_core.tree, "75de9b1a5b813933187c2a685945760bf1737329");
  assert.equal(contract.dormant_install.endpoint, "/api/apps/install");
  assert.deepEqual(contract.dormant_install.request, {
    appId: "moonsleep-partner-desk",
    packageRef: "${HOST_EXTRACTED_PACKAGE_DIR}",
  });
  assert.equal(contract.rollback.endpoint, "/api/apps/uninstall");
  assert.equal(contract.dormant_install.expected_owned_job_status, "inactive");
  assert.equal(contract.dormant_install.expected_enabled_subscription_count, 0);
  assert.ok(Object.values(contract.authority).every((value) => value === false));
  assert.equal(noProhibitedSchemaField(contract), true);
});

test("accepts the exact installed dormant readback", () => {
  const receipt = verifyDormantInstallReadback(readback("installed"), contract);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.phase, "installed");
  assert.equal(receipt.provider_calls, 0);
});

test("accepts exact first-install rollback and immutable profile-registry residue", () => {
  const receipt = verifyDormantInstallReadback(readback("rolled_back"), contract);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.phase, "rolled_back");
  assert.equal(receipt.profile_registration_delta, 8);
});

test("fails closed on any provider call, enabled subscription, or local evidence write", () => {
  const providerCall = readback("installed");
  providerCall.effects.provider_call_count = 1;
  assert.throws(
    () => verifyDormantInstallReadback(providerCall, contract),
    /provider calls are forbidden/,
  );

  const enabledSubscription = readback("installed");
  enabledSubscription.work.enabled_subscription_count = 1;
  assert.throws(
    () => verifyDormantInstallReadback(enabledSubscription, contract),
    /work is not dormant/,
  );

  const factWrite = readback("installed");
  factWrite.state_deltas.fact_delta = 1;
  assert.throws(
    () => verifyDormantInstallReadback(factWrite, contract),
    /fact_delta must equal 0/,
  );
});

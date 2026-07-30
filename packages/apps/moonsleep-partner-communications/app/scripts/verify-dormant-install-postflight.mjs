#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_CONTRACT_PATH = resolve(
  ROOT_DIR,
  "contracts/partner-production-release.v1.json",
);

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function row(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} must be a nonnegative integer`);
  return value;
}

function falseValue(value, label) {
  if (value !== false) fail(`${label} must be false`);
}

function zeroDeltas(input, contract) {
  const deltas = row(input.state_deltas, "state_deltas");
  for (const [field, expected] of Object.entries(contract.forbidden_effects)) {
    if (field === "provider_call_count") continue;
    if (integer(deltas[field], `state_deltas.${field}`) !== expected) {
      fail(`state_deltas.${field} must equal ${expected}`);
    }
  }
}

function zeroAuthority(input, contract) {
  const effects = row(input.effects, "effects");
  if (integer(effects.provider_call_count, "effects.provider_call_count") !== 0) {
    fail("provider calls are forbidden");
  }
  for (const field of Object.keys(contract.authority)) {
    falseValue(effects[field], `effects.${field}`);
  }
}

export function verifyDormantInstallReadback(input, contract) {
  const readback = row(input, "readback");
  if (readback.contract_id !== "moonsleep.partner.dormant-install-readback.v1") {
    fail("readback contract identity is invalid");
  }
  if (!["installed", "rolled_back"].includes(readback.phase)) {
    fail("readback phase is invalid");
  }
  zeroDeltas(readback, contract);
  zeroAuthority(readback, contract);

  const app = row(readback.app, "app");
  const work = row(readback.work, "work");
  const profiles = row(readback.profiles, "profiles");
  const profileDelta = integer(profiles.registration_delta, "profiles.registration_delta");
  if (!contract.allowed_local_mutations.profile_registration_count.includes(profileDelta)) {
    fail("profile registration delta is outside the dormant-install allowance");
  }

  if (readback.phase === "installed") {
    if (
      app.present !== true ||
      app.app_id !== contract.app.app_id ||
      app.app_version !== contract.app.app_version ||
      app.state !== contract.dormant_install.expected_app_state
    ) {
      fail("installed app identity or state is invalid");
    }
    const health = row(readback.health, "health");
    if (
      health.status !== "ok" ||
      health.continuous_projection !== contract.dormant_install.expected_continuous_projection ||
      health.canonical_evidence?.fact_profiles_registered !==
        contract.dormant_install.expected_fact_profile_count ||
      health.canonical_evidence?.observation_profiles_registered !==
        contract.dormant_install.expected_observation_profile_count ||
      health.canonical_evidence?.set_profiles_registered_in_package !==
        contract.dormant_install.expected_set_profile_count ||
      health.canonical_evidence?.registration_complete !== true ||
      health.canonical_evidence?.canonical_promotion_enabled !== false ||
      health.provider_write_authority !== false ||
      health.reply_authority !== false
    ) {
      fail("installed Partner health is not dormant and exact");
    }
    if (
      work.owned_job_count !== 1 ||
      work.owned_job_status !== contract.dormant_install.expected_owned_job_status ||
      work.owned_subscription_count !==
        contract.dormant_install.expected_owned_subscription_count ||
      work.enabled_subscription_count !==
        contract.dormant_install.expected_enabled_subscription_count
    ) {
      fail("installed Partner work is not dormant and exact");
    }
  } else {
    if (app.present !== false) fail("rolled-back app must be absent");
    if (
      work.owned_job_count !== contract.rollback.expected_owned_job_count ||
      work.owned_subscription_count !== contract.rollback.expected_owned_subscription_count ||
      work.enabled_subscription_count !== 0
    ) {
      fail("rollback left owned Partner work behind");
    }
  }

  return {
    ok: true,
    contract_id: "moonsleep.partner.dormant-install-postflight-receipt.v1",
    phase: readback.phase,
    app_id: contract.app.app_id,
    app_version: contract.app.app_version,
    readback_sha256: sha256(`${JSON.stringify(readback)}\n`),
    profile_registration_delta: profileDelta,
    provider_calls: 0,
    authority: contract.authority,
  };
}

function parseArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || !value) fail("usage: --input <path> --out <path>");
    values[flag.slice(2)] = value;
  }
  if (!values.input || !values.out) fail("usage: --input <path> --out <path>");
  return values;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalValue(nested)]),
    );
  }
  return value;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const inputBytes = readFileSync(resolve(args.input), "utf8");
  const contract = JSON.parse(readFileSync(RELEASE_CONTRACT_PATH, "utf8"));
  const receipt = verifyDormantInstallReadback(JSON.parse(inputBytes), contract);
  writeFileSync(
    resolve(args.out),
    `${JSON.stringify(canonicalValue(receipt), null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

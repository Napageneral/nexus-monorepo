#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  cleanupServer,
  createFreshServer,
  fail,
  freshServerDisplayName,
  mintRuntimeToken,
  numberEnv,
  resolveFrontdoorHeaders,
  runtimeGetJson,
  smokeError,
  text,
  waitForServerRunning,
} from "./frontdoor-smoke-lib.mjs";

function writeBundleArtifact(relativePath, value) {
  const bundleDir = text(process.env.NEXUS_CLEANROOM_PROOF_BUNDLE_DIR);
  if (!bundleDir) {
    return;
  }
  const outputPath = path.join(bundleDir, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const origin = text(process.env.FRONTDOOR_SMOKE_ORIGIN) || "https://frontdoor.nexushub.sh";
  const plan = text(process.env.FRONTDOOR_SMOKE_PLAN) || "cax11";
  const serverClass = text(process.env.FRONTDOOR_SMOKE_SERVER_CLASS) || "standard";
  const displayName =
    text(process.env.FRONTDOOR_SMOKE_DISPLAY_NAME) || freshServerDisplayName("Runtime Health");
  const cleanupMode = text(process.env.FRONTDOOR_SMOKE_CLEANUP_MODE).toLowerCase() || "destroy";
  if (!["destroy", "archive", "retain"].includes(cleanupMode)) {
    fail("invalid cleanup mode", {
      cleanup_mode: cleanupMode,
      allowed: ["destroy", "archive", "retain"],
    });
  }
  const timeoutMs = numberEnv("FRONTDOOR_SMOKE_PROVISION_TIMEOUT_MS", 15 * 60 * 1000);
  const pollMs = numberEnv("FRONTDOOR_SMOKE_PROVISION_POLL_MS", 5000);
  const healthPath = text(process.env.FRONTDOOR_SMOKE_RUNTIME_HEALTH_PATH) || "/health";

  const headers = await resolveFrontdoorHeaders(origin);
  let created = null;
  let waitResult = null;
  let tokenResult = null;
  let healthResult = null;
  let cleanupResult = null;
  let failure = null;

  try {
    created = await createFreshServer({
      origin,
      headers,
      plan,
      displayName,
      serverClass,
    });
    waitResult = await waitForServerRunning({
      origin,
      headers,
      serverId: created.serverId,
      timeoutMs,
      pollMs,
    });
    tokenResult = await mintRuntimeToken({
      origin,
      headers,
      serverId: created.serverId,
      clientId: "frontdoor-sandbox-runtime-health-proof",
    });
    const health = await runtimeGetJson(
      `${tokenResult.runtime.httpBaseUrl}${healthPath}`,
      tokenResult.accessToken,
    );
    if (!health.response.ok) {
      throw smokeError("runtime health failed", {
        runtime_health: {
          status: health.response.status,
          ok: health.response.ok,
          body: health.body ?? health.raw,
        },
      });
    }
    healthResult = {
      status: health.response.status,
      ok: health.response.ok,
      body: health.body ?? health.raw,
    };
    writeBundleArtifact("runtime/runtime-descriptor.json", tokenResult);
    writeBundleArtifact("runtime/health.json", healthResult);
  } catch (error) {
    failure = error;
  } finally {
    if (created?.serverId) {
      try {
        cleanupResult = await cleanupServer({
          origin,
          headers,
          serverId: created.serverId,
          cleanupMode,
        });
      } catch (error) {
        cleanupResult = {
          cleanupMode,
          ok: false,
          thrown: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  if (cleanupResult && cleanupResult.ok !== true) {
    fail("runtime health proof cleanup failed", {
      created_server: created,
      cleanup: cleanupResult,
      runtime_token: tokenResult,
      runtime_health: healthResult,
      failure:
        failure instanceof Error
          ? {
              message: failure.message,
              details: failure.details ?? null,
            }
          : failure ?? null,
    });
  }

  if (failure) {
    fail(
      failure instanceof Error ? failure.message : "runtime health proof failed",
      {
        created_server: created,
        provisioning: waitResult
          ? {
              status: waitResult.status,
              waited_ms: waitResult.waitedMs,
            }
          : null,
        runtime_token: tokenResult,
        runtime_health: healthResult,
        cleanup: cleanupResult,
        details: failure instanceof Error ? failure.details ?? null : failure,
      },
    );
  }

  const result = {
    ok: true,
    origin,
    created_server: created,
    provisioning: waitResult
      ? {
          status: waitResult.status,
          waited_ms: waitResult.waitedMs,
        }
      : null,
    runtime_token: tokenResult,
    runtime_health: healthResult,
    cleanup: cleanupResult,
  };
  writeBundleArtifact("proof/runtime-health-proof.json", result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  fail("unexpected_failure", {
    detail: error instanceof Error ? error.message : String(error),
  });
});

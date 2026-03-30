#!/usr/bin/env node
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { promisify } from "node:util";
import {
  cleanupServer,
  createFreshServer,
  fail,
  freshServerDisplayName,
  mintRuntimeToken,
  numberEnv,
  parseJsonOrNull,
  resolveFrontdoorHeaders,
  smokeError,
  text,
  waitForServerRunning,
} from "./frontdoor-smoke-lib.mjs";

const execFileAsync = promisify(execFile);

function writeProofBundle(payload) {
  const root = text(process.env.NEXUS_CLEANROOM_PROOF_BUNDLE_DIR);
  if (!root) {
    return;
  }
  const proofDir = path.join(root, "proof");
  fs.mkdirSync(proofDir, { recursive: true });
  fs.writeFileSync(
    path.join(proofDir, "fresh-server-adapter-cleanroom-smoke.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
}

function parseAdapterIds() {
  const raw =
    text(process.env.FRONTDOOR_SMOKE_ADAPTERS) ||
    text(process.env.FRONTDOOR_SMOKE_ADAPTER_ID) ||
    "eve,git,jira,slack";
  const ids = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
  if (ids.length < 1) {
    fail("FRONTDOOR_SMOKE_ADAPTERS produced no adapter ids", { value: raw });
  }
  return ids;
}

async function runAdapterLifecycleSmoke({ serverId, adapterId }) {
  const scriptPath = fileURLToPath(
    new URL("./frontdoor-package-lifecycle-smoke.mjs", import.meta.url),
  );
  try {
    const child = await execFileAsync(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        FRONTDOOR_SMOKE_KIND: "adapter",
        FRONTDOOR_SMOKE_SERVER_ID: serverId,
        FRONTDOOR_SMOKE_ADAPTER_ID: adapterId,
      },
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    const payload = parseJsonOrNull(child.stdout);
    if (!payload || payload.ok !== true) {
      throw smokeError("adapter lifecycle smoke produced invalid output", {
        server_id: serverId,
        adapter_id: adapterId,
        stdout: child.stdout,
        stderr: child.stderr,
      });
    }
    return payload;
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    const parsedStdout = parseJsonOrNull(stdout);
    const parsedStderr = parseJsonOrNull(stderr);
    throw smokeError("adapter lifecycle smoke failed on fresh server", {
      server_id: serverId,
      adapter_id: adapterId,
      smoke_stdout: parsedStdout ?? (stdout || null),
      smoke_stderr: parsedStderr ?? (stderr || null),
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runProofCapture({ serverId, adapterId, origin, runtimeToken }) {
  const proofCommand = text(process.env.FRONTDOOR_SMOKE_ADAPTER_PROOF_COMMAND);
  if (!proofCommand) {
    return {
      ok: true,
      status: "pending_operator_supplied_proof",
      adapter_id: adapterId,
      server_id: serverId,
    };
  }
  try {
    const child = await execFileAsync("/bin/bash", ["-lc", proofCommand], {
      env: {
        ...process.env,
        FRONTDOOR_SMOKE_ORIGIN: origin,
        FRONTDOOR_SMOKE_SERVER_ID: serverId,
        FRONTDOOR_SMOKE_ADAPTER_ID: adapterId,
        FRONTDOOR_SMOKE_ADAPTER_IDS: text(process.env.FRONTDOOR_SMOKE_ADAPTERS) || adapterId,
        FRONTDOOR_SMOKE_RUNTIME_ACCESS_TOKEN: runtimeToken.accessToken,
        FRONTDOOR_SMOKE_RUNTIME_BASE_URL: runtimeToken.runtime.baseUrl,
        FRONTDOOR_SMOKE_RUNTIME_HTTP_BASE_URL: runtimeToken.runtime.httpBaseUrl,
        FRONTDOOR_SMOKE_RUNTIME_WS_URL: runtimeToken.runtime.wsUrl || "",
        FRONTDOOR_SMOKE_RUNTIME_SSE_URL: runtimeToken.runtime.sseUrl || "",
        FRONTDOOR_SMOKE_RUNTIME_ENTITY_ID: runtimeToken.entityId || "",
        FRONTDOOR_SMOKE_RUNTIME_TENANT_ID: runtimeToken.tenantId || "",
      },
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    const payload = parseJsonOrNull(child.stdout);
    return {
      ok: true,
      status: "captured",
      adapter_id: adapterId,
      server_id: serverId,
      command: proofCommand,
      stdout: payload ?? (child.stdout || null),
      stderr: child.stderr || null,
    };
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    const parsedStdout = parseJsonOrNull(stdout);
    const parsedStderr = parseJsonOrNull(stderr);
    throw smokeError("adapter proof capture failed", {
      server_id: serverId,
      adapter_id: adapterId,
      command: proofCommand,
      stdout: parsedStdout ?? (stdout || null),
      stderr: parsedStderr ?? (stderr || null),
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function main() {
  const origin = text(process.env.FRONTDOOR_SMOKE_ORIGIN) || "https://frontdoor.nexushub.sh";
  const plan = text(process.env.FRONTDOOR_SMOKE_PLAN) || "cax11";
  const serverClass = text(process.env.FRONTDOOR_SMOKE_SERVER_CLASS) || "standard";
  const displayName = text(process.env.FRONTDOOR_SMOKE_DISPLAY_NAME) || freshServerDisplayName();
  const cleanupMode = text(process.env.FRONTDOOR_SMOKE_CLEANUP_MODE).toLowerCase() || "destroy";
  if (!["destroy", "archive", "retain"].includes(cleanupMode)) {
    fail("invalid cleanup mode", {
      cleanup_mode: cleanupMode,
      allowed: ["destroy", "archive", "retain"],
    });
  }
  const timeoutMs = numberEnv("FRONTDOOR_SMOKE_PROVISION_TIMEOUT_MS", 15 * 60 * 1000);
  const pollMs = numberEnv("FRONTDOOR_SMOKE_PROVISION_POLL_MS", 5000);
  const adapterIds = parseAdapterIds();

  const headers = await resolveFrontdoorHeaders(origin);
  let created = null;
  let waitResult = null;
  let runtimeToken = null;
  let adapterResults = [];
  let proofResults = [];
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
    runtimeToken = await mintRuntimeToken({
      origin,
      headers,
      serverId: created.serverId,
    });
    for (const adapterId of adapterIds) {
      const lifecycle = await runAdapterLifecycleSmoke({
        serverId: created.serverId,
        adapterId,
      });
      adapterResults.push(lifecycle);
      const proofCapture = await runProofCapture({
        serverId: created.serverId,
        adapterId,
        origin,
        runtimeToken,
      });
      proofResults.push(proofCapture);
    }
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
    fail("fresh server adapter smoke cleanup failed", {
      created_server: created,
      cleanup: cleanupResult,
      adapters: adapterResults,
      proof_capture: proofResults,
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
      failure instanceof Error ? failure.message : "fresh server adapter smoke failed",
      {
        created_server: created,
        provisioning: waitResult
          ? {
              status: waitResult.status,
              waited_ms: waitResult.waitedMs,
            }
          : null,
        runtime_token: runtimeToken
          ? {
              server_id: runtimeToken.serverId,
              tenant_id: runtimeToken.tenantId,
              entity_id: runtimeToken.entityId,
              runtime: {
                base_url: runtimeToken.runtime.baseUrl,
                http_base_url: runtimeToken.runtime.httpBaseUrl,
                ws_url: runtimeToken.runtime.wsUrl,
                sse_url: runtimeToken.runtime.sseUrl,
              },
            }
          : null,
        adapters: adapterResults,
        proof_capture: proofResults,
        cleanup: cleanupResult,
        details: failure instanceof Error ? failure.details ?? null : failure,
      },
    );
  }

  const payload = {
    ok: true,
    origin,
    created_server: created,
    provisioning: waitResult
      ? {
          status: waitResult.status,
          waited_ms: waitResult.waitedMs,
        }
      : null,
    adapters: adapterResults,
    proof_capture: proofResults,
    cleanup: cleanupResult,
  };
  writeProofBundle(payload);
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  fail("unexpected_failure", {
    detail: error instanceof Error ? error.message : String(error),
  });
});

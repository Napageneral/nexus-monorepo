#!/usr/bin/env node
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { promisify } from "node:util";
import {
  cleanupServer,
  createFreshServer,
  fail,
  freshServerDisplayName,
  numberEnv,
  parseJsonOrNull,
  resolveFrontdoorHeaders,
  smokeError,
  text,
  waitForServerRunning,
} from "./frontdoor-smoke-lib.mjs";

const execFileAsync = promisify(execFile);

async function runMultiAppSmoke({ serverId }) {
  const scriptPath = fileURLToPath(
    new URL("./frontdoor-one-server-multi-app-smoke.mjs", import.meta.url),
  );
  try {
    const child = await execFileAsync(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        FRONTDOOR_SMOKE_SERVER_ID: serverId,
      },
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    const payload = parseJsonOrNull(child.stdout);
    if (!payload || payload.ok !== true) {
      throw smokeError("fresh server multi-app smoke produced invalid output", {
        server_id: serverId,
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
    throw smokeError("multi-app smoke failed on fresh server", {
      server_id: serverId,
      smoke_stdout: parsedStdout ?? (stdout || null),
      smoke_stderr: parsedStderr ?? (stderr || null),
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

  const headers = await resolveFrontdoorHeaders(origin);
  let created = null;
  let waitResult = null;
  let smokeResult = null;
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
    smokeResult = await runMultiAppSmoke({
      serverId: created.serverId,
    });
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
    fail("fresh server smoke cleanup failed", {
      created_server: created,
      cleanup: cleanupResult,
      smoke: smokeResult,
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
      failure instanceof Error ? failure.message : "fresh server smoke failed",
      {
        created_server: created,
        provisioning: waitResult
          ? {
              status: waitResult.status,
              waited_ms: waitResult.waitedMs,
            }
          : null,
        smoke: smokeResult,
        cleanup: cleanupResult,
        details: failure instanceof Error ? failure.details ?? null : failure,
      },
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        origin,
        created_server: created,
        provisioning: waitResult
          ? {
              status: waitResult.status,
              waited_ms: waitResult.waitedMs,
            }
          : null,
        smoke: smokeResult,
        cleanup: cleanupResult,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  fail("unexpected_failure", {
    detail: error instanceof Error ? error.message : String(error),
  });
});

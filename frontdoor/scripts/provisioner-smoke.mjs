#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function fail(message) {
  process.stderr.write(`provisioner-smoke: ${message}\n`);
  process.exit(1);
}

function resolveConfigPath() {
  const override = text(process.env.FRONTDOOR_CONFIG_PATH);
  if (override) {
    return path.resolve(override);
  }
  return path.resolve(process.cwd(), "config", "frontdoor.config.json");
}

function parseCommand() {
  const fromEnv = text(process.env.FRONTDOOR_AUTOPROVISION_COMMAND);
  if (fromEnv) {
    return fromEnv;
  }
  const configPath = resolveConfigPath();
  if (!fs.existsSync(configPath)) {
    fail(`config not found at ${configPath}. Set FRONTDOOR_AUTOPROVISION_COMMAND or FRONTDOOR_CONFIG_PATH.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    fail(`failed to parse config ${configPath}: ${String(error)}`);
  }
  const command = text(parsed?.autoProvision?.command);
  if (!command) {
    fail("autoProvision.command is empty. Set FRONTDOOR_AUTOPROVISION_COMMAND for smoke validation.");
  }
  return command;
}

function parseURLField(obj, field, allowedSchemes, required = true) {
  const raw = text(obj?.[field]);
  if (!raw) {
    if (required) {
      fail(`missing required field: ${field}`);
    }
    return "";
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail(`invalid URL in ${field}: ${raw}`);
  }
  const protocol = parsed.protocol.toLowerCase();
  if (!allowedSchemes.includes(protocol)) {
    fail(`invalid URL scheme in ${field}: ${protocol}`);
  }
  return parsed.toString();
}

function validateOutput(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`command did not return JSON: ${String(error)}`);
  }
  const obj = asObject(parsed);
  if (!obj) {
    fail("command payload must be a JSON object");
  }
  const tenantID = text(obj.tenant_id);
  if (!tenantID) {
    fail("missing required field: tenant_id");
  }
  parseURLField(obj, "runtime_url", ["http:", "https:"], true);
  parseURLField(obj, "runtime_public_base_url", ["http:", "https:"], true);
  parseURLField(obj, "runtime_ws_url", ["ws:", "wss:"], false);
  parseURLField(obj, "runtime_sse_url", ["http:", "https:"], false);
  return {
    tenant_id: tenantID,
    runtime_url: text(obj.runtime_url),
    runtime_public_base_url: text(obj.runtime_public_base_url),
  };
}

async function runCommand(command, payload) {
  const child = spawn("bash", ["-lc", command], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      FRONTDOOR_PROVISIONER_DRY_RUN: "1",
    },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const exitPromise = new Promise((resolve) => {
    child.once("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  child.stdin.write(`${JSON.stringify(payload)}\n`);
  child.stdin.end();
  const code = await exitPromise;
  if (code !== 0) {
    fail(`command failed with exit code ${String(code)}: ${text(stderr) || text(stdout) || "no output"}`);
  }
  return stdout;
}

async function main() {
  const command = parseCommand();
  const basePayload = {
    request_id: "smoke-request",
    provider: "google",
    sub: "smoke-subject",
    email: "smoke@example.com",
    display_name: "Smoke User",
    user_id: "oidc:google:smoke-subject",
    entity_id: "entity:google:smoke-subject",
    roles: ["operator"],
    scopes: ["operator.admin"],
    runtime_token: {
      issuer: "https://frontdoor.smoke",
      audience: "runtime-api",
      secret: "smoke-secret",
    },
  };
  const glowbotStdout = await runCommand(command, {
    ...basePayload,
    tenant_id: "smoke-tenant-glowbot",
    product_id: "glowbot",
  });
  const glowbotSummary = validateOutput(glowbotStdout);

  const spikeStdout = await runCommand(command, {
    ...basePayload,
    tenant_id: "smoke-tenant-spike",
    product_id: "spike",
  });
  const spikeSummary = validateOutput(spikeStdout);

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      command,
      output: {
        glowbot: glowbotSummary,
        spike: spikeSummary,
      },
    })}\n`,
  );
}

main().catch((error) => {
  fail(String(error));
});

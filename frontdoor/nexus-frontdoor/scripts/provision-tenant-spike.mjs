#!/usr/bin/env node
import process from "node:process";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function main() {
  const raw = await readStdin();
  let payload = {};
  try {
    payload = asObject(raw.trim() ? JSON.parse(raw) : {});
  } catch {
    process.stderr.write("invalid_json_input\n");
    process.exit(1);
  }

  const tenantId = text(payload.tenant_id) || `tenant-${Date.now()}`;
  const runtimeUrl = text(process.env.FRONTDOOR_SPIKE_RUNTIME_URL) || "http://127.0.0.1:7422";
  const runtimePublicBaseUrl =
    text(process.env.FRONTDOOR_SPIKE_RUNTIME_PUBLIC_BASE_URL) || "https://api.spike.fyi";
  const runtimeWsUrl = text(process.env.FRONTDOOR_SPIKE_RUNTIME_WS_URL);
  const runtimeSseUrl = text(process.env.FRONTDOOR_SPIKE_RUNTIME_SSE_URL);
  const runtimeAuthToken =
    text(process.env.FRONTDOOR_SPIKE_RUNTIME_AUTH_TOKEN) || text(process.env.SPIKE_AUTH_TOKEN);

  const response = {
    tenant_id: tenantId,
    runtime_url: runtimeUrl,
    runtime_public_base_url: runtimePublicBaseUrl,
    runtime_ws_url: runtimeWsUrl || undefined,
    runtime_sse_url: runtimeSseUrl || undefined,
    runtime_auth_token: runtimeAuthToken || undefined,
  };

  process.stdout.write(`${JSON.stringify(response)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});

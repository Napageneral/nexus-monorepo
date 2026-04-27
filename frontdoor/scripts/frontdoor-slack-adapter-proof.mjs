#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  fail,
  parseJsonOrNull,
  responseSummary,
  runtimePostJson,
  text,
} from "./frontdoor-smoke-lib.mjs";

function requiredEnv(name) {
  const value = text(process.env[name]);
  if (!value) {
    fail("missing required environment variable", { env: name });
  }
  return value;
}

function callRuntimeRpc(method, params) {
  const scriptPath = fileURLToPath(new URL("./frontdoor-runtime-rpc.mjs", import.meta.url));
  const stdout = execFileSync(
    process.execPath,
    [
      scriptPath,
      "--method",
      method,
      "--params",
      JSON.stringify(params ?? {}),
    ],
    {
      env: process.env,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const parsed = parseJsonOrNull(stdout);
  if (!parsed || parsed.ok !== true) {
    fail("runtime websocket RPC returned invalid output", {
      method,
      stdout: stdout || null,
    });
  }
  return parsed.payload ?? null;
}

async function callRuntimeOperation(runtimeHttpBaseUrl, accessToken, method, params) {
  const url = `${runtimeHttpBaseUrl.replace(/\/+$/g, "")}/runtime/operations/${encodeURIComponent(method)}`;
  const result = await runtimePostJson(url, params, accessToken);
  if (!result.response.ok || result.body?.ok !== true) {
    fail("runtime operation failed", {
      method,
      response: responseSummary(result.response, result.body, result.raw),
    });
  }
  return result.body?.payload ?? null;
}

function requireConnectionId(payload) {
  const connectionId =
    text(payload?.connectionId) ||
    text(payload?.connection_id) ||
    text(payload?.id);
  if (!connectionId) {
    fail("slack setup submit did not return connectionId", { payload });
  }
  return connectionId;
}

function boolFromPayload(payload) {
  if (payload?.ok === true || payload?.success === true || payload?.connected === true) {
    return true;
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCurrentOwnerEntity(runtimeHttpBaseUrl, accessToken, timeoutMs = 30_000, pollMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  let lastSummary = null;
  let lastEntities = null;
  while (Date.now() < deadline) {
    const summary = await callRuntimeOperation(
      runtimeHttpBaseUrl,
      accessToken,
      "orientation.summary",
      {},
    );
    lastSummary = summary;
    const currentOwnerEntityId =
      text(summary?.self_index?.owner_role_group?.current_owner_entity_id) ||
      text(summary?.selfIndex?.owner_role_group?.current_owner_entity_id) ||
      text(summary?.selfIndex?.ownerRoleGroup?.currentOwnerEntityId);
    if (currentOwnerEntityId) {
      return {
        current_owner_entity_id: currentOwnerEntityId,
        summary,
      };
    }

    const entities = await callRuntimeOperation(
      runtimeHttpBaseUrl,
      accessToken,
      "entities.list",
      {
        is_user: true,
        limit: 10,
      },
    );
    lastEntities = entities;
    const ownerEntity = Array.isArray(entities?.entities)
      ? entities.entities.find((entity) => entity && entity.is_user === true)
      : null;
    if (ownerEntity && text(ownerEntity.id)) {
      return {
        current_owner_entity_id: text(ownerEntity.id),
        summary,
      };
    }

    await sleep(pollMs);
  }

  fail("timed out waiting for hosted owner bootstrap materialization", {
    timeout_ms: timeoutMs,
    last_orientation_summary: lastSummary,
    last_entities_list: lastEntities,
  });
}

async function waitForAdapterMethod(runtimeHttpBaseUrl, accessToken, adapterId, methodName, timeoutMs = 30_000, pollMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  let lastCatalog = null;
  while (Date.now() < deadline) {
    const catalog = await callRuntimeOperation(
      runtimeHttpBaseUrl,
      accessToken,
      "adapters.methods",
      {
        id: adapterId,
      },
    );
    lastCatalog = catalog;
    const methods = Array.isArray(catalog?.methods) ? catalog.methods : [];
    if (methods.some((entry) => text(entry?.name) === methodName)) {
      return catalog;
    }
    await sleep(pollMs);
  }

  fail("timed out waiting for hosted adapter method registration", {
    adapter_id: adapterId,
    method_name: methodName,
    timeout_ms: timeoutMs,
    last_catalog: lastCatalog,
  });
}

async function main() {
  const runtimeHttpBaseUrl = requiredEnv("FRONTDOOR_SMOKE_RUNTIME_HTTP_BASE_URL");
  const accessToken = requiredEnv("FRONTDOOR_SMOKE_RUNTIME_ACCESS_TOKEN");
  const serverId = requiredEnv("FRONTDOOR_SMOKE_SERVER_ID");
  const adapterId = text(process.env.FRONTDOOR_SMOKE_ADAPTER_ID) || "slack";
  if (adapterId !== "slack") {
    fail("frontdoor-slack-adapter-proof.mjs requires FRONTDOOR_SMOKE_ADAPTER_ID=slack", {
      adapter_id: adapterId,
    });
  }

  const authMethodId = text(process.env.FRONTDOOR_SMOKE_SLACK_AUTH_METHOD_ID) || "slack_socket_mode";
  const botToken = requiredEnv("SLACK_BOT_TOKEN");
  const appToken = requiredEnv("SLACK_APP_TOKEN");
  const channelId = requiredEnv("SLACK_CHANNEL_ID");
  const threadTs = text(process.env.SLACK_THREAD_TS);
  const proofMessage =
    text(process.env.SLACK_PROOF_MESSAGE) ||
    `Frontdoor hosted Slack cleanroom proof ${new Date().toISOString()} server=${serverId}`;
  const ownerBootstrap = await waitForCurrentOwnerEntity(runtimeHttpBaseUrl, accessToken);

  const complete = await callRuntimeOperation(
    runtimeHttpBaseUrl,
    accessToken,
    "adapters.connections.create",
    {
      adapter: adapterId,
      authMethodId,
      fields: {
        bot_token: botToken,
        app_token: appToken,
      },
    },
  );
  if (text(complete?.status) !== "connected") {
    fail("slack connection create did not return connected", {
      payload: complete,
    });
  }
  const connectionId = requireConnectionId(complete);

  const connectionStatus = await callRuntimeOperation(
    runtimeHttpBaseUrl,
    accessToken,
    "adapters.connections.status",
    {
      connectionId,
    },
  );
  if (text(connectionStatus?.status) !== "connected") {
    fail("slack connection status is not connected", {
      connection_id: connectionId,
      payload: connectionStatus,
    });
  }

  const connectionTest = await callRuntimeOperation(
    runtimeHttpBaseUrl,
    accessToken,
    "adapters.connections.test",
    {
      connectionId,
    },
  );
  if (!boolFromPayload(connectionTest)) {
    fail("slack connection health check failed", {
      connection_id: connectionId,
      payload: connectionTest,
    });
  }

  const monitorStart = await callRuntimeOperation(
    runtimeHttpBaseUrl,
    accessToken,
    "adapter.monitor.start",
    {
      adapter: adapterId,
      connection_id: connectionId,
    },
  );

  const adapterMethods = await waitForAdapterMethod(
    runtimeHttpBaseUrl,
    accessToken,
    adapterId,
    "slack.send",
  );

  const sendPayload = {
    connection_id: connectionId,
    payload: {
      target: {
        connection_id: connectionId,
        channel: {
          platform: "slack",
          container_id: channelId,
          ...(threadTs ? { thread_id: threadTs } : {}),
        },
      },
      text: proofMessage,
    },
  };

  const sendResult = callRuntimeRpc(
    "slack.send",
    sendPayload,
  );
  if (!boolFromPayload(sendResult)) {
    fail("slack send did not succeed", {
      connection_id: connectionId,
      payload: sendResult,
    });
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        adapter_id: adapterId,
        server_id: serverId,
        connection_id: connectionId,
        auth_method_id: authMethodId,
        owner_bootstrap: ownerBootstrap,
        proof_message: proofMessage,
        connection_create: complete,
        connection_status: connectionStatus,
        connection_test: connectionTest,
        monitor_start: monitorStart,
        adapter_methods: adapterMethods,
        send_result: sendResult,
        inbound_sync_status:
          "not_proven_here: hosted Slack inbound still needs a second actor or real records.backfill implementation",
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

#!/usr/bin/env node
import process from "node:process";
import {
  fail,
  responseSummary,
  runtimePostJson,
  text,
} from "./frontdoor-smoke-lib.mjs";

const DEFAULT_BACKFILL_SINCE = "2026-01-01T00:00:00Z";
const DEFAULT_ISSUE_TYPE = "Task";
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_POLL_TIMEOUT_MS = 90_000;

function requiredEnv(name) {
  const value = text(process.env[name]);
  if (!value) {
    fail("missing required environment variable", { env: name });
  }
  return value;
}

function numberEnv(name, fallback) {
  const raw = text(process.env[name]);
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJobRun(runtimeHttpBaseUrl, accessToken, runId, timeoutMs, pollIntervalMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const payload = await callRuntimeOperation(
      runtimeHttpBaseUrl,
      accessToken,
      "jobs.runs.get",
      { id: runId },
    );
    const run = payload?.run ?? null;
    const status = text(run?.status);
    if (status === "completed") {
      return run;
    }
    if (status === "failed" || status === "cancelled") {
      fail("jira backfill job did not complete successfully", {
        job_run_id: runId,
        run,
      });
    }
    await sleep(pollIntervalMs);
  }
  fail("timed out waiting for jira backfill job completion", {
    job_run_id: runId,
    timeout_ms: timeoutMs,
  });
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
    fail("adapter connection create did not return connectionId", {
      payload,
    });
  }
  return connectionId;
}

function requireIssueKey(payload) {
  const messageIds = Array.isArray(payload?.message_ids)
    ? payload.message_ids.map((value) => text(value)).filter(Boolean)
    : [];
  const issueKey =
    messageIds[0] ||
    text(payload?.issue_key) ||
    text(payload?.key);
  if (!issueKey) {
    fail("jira issue create did not return an issue key", {
      payload,
    });
  }
  return issueKey;
}

function recordsContainIssue(records, issueKey) {
  if (!Array.isArray(records)) {
    return false;
  }
  return records.some((record) => {
    const raw = JSON.stringify(record);
    return raw.includes(`"platform":"jira"`) && raw.includes(issueKey);
  });
}

async function main() {
  const runtimeHttpBaseUrl = requiredEnv("FRONTDOOR_SMOKE_RUNTIME_HTTP_BASE_URL");
  const accessToken = requiredEnv("FRONTDOOR_SMOKE_RUNTIME_ACCESS_TOKEN");
  const serverId = requiredEnv("FRONTDOOR_SMOKE_SERVER_ID");
  const adapterId = text(process.env.FRONTDOOR_SMOKE_ADAPTER_ID) || "jira";
  if (adapterId !== "jira") {
    fail("frontdoor-jira-adapter-proof.mjs requires FRONTDOOR_SMOKE_ADAPTER_ID=jira", {
      adapter_id: adapterId,
    });
  }
  const site = requiredEnv("JIRA_SITE");
  const email = requiredEnv("JIRA_EMAIL");
  const apiToken = requiredEnv("JIRA_API_TOKEN");
  const projectKey = requiredEnv("JIRA_PROJECT_KEY");
  const issueType = text(process.env.JIRA_ISSUE_TYPE) || DEFAULT_ISSUE_TYPE;
  const backfillSince = text(process.env.JIRA_BACKFILL_SINCE) || DEFAULT_BACKFILL_SINCE;
  const pollIntervalMs = numberEnv("JIRA_RECORD_POLL_INTERVAL_MS", DEFAULT_POLL_INTERVAL_MS);
  const pollTimeoutMs = numberEnv("JIRA_RECORD_POLL_TIMEOUT_MS", DEFAULT_POLL_TIMEOUT_MS);

  const start = await callRuntimeOperation(
    runtimeHttpBaseUrl,
    accessToken,
    "adapters.connections.custom.start",
    {
      adapter: adapterId,
      authMethodId: "atlassian_api_key",
    },
  );
  if (text(start?.status) !== "requires_input") {
    fail("jira setup start did not return requires_input", {
      payload: start,
    });
  }
  const sessionId = text(start?.sessionId);
  if (!sessionId) {
    fail("jira setup start did not return sessionId", {
      payload: start,
    });
  }

  const complete = await callRuntimeOperation(
    runtimeHttpBaseUrl,
    accessToken,
    "adapters.connections.custom.submit",
    {
      adapter: adapterId,
      sessionId,
      payload: {
        site,
        email,
        api_token: apiToken,
      },
    },
  );
  if (text(complete?.status) !== "completed") {
    fail("jira setup submit did not complete", {
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
    fail("jira connection status is not connected", {
      connection_id: connectionId,
      payload: connectionStatus,
    });
  }
  if (
    text(connectionStatus?.adapter) !== "jira" ||
    text(connectionStatus?.service) !== "atlassian" ||
    text(connectionStatus?.authMethodId) !== "atlassian_api_key" ||
    text(connectionStatus?.accountContact?.platform) !== "jira"
  ) {
    fail("jira connection status did not return the expected stable contract", {
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
  if (connectionTest?.ok !== true) {
    fail("jira connection health check failed", {
      connection_id: connectionId,
      payload: connectionTest,
    });
  }

  const issueCreate = await callRuntimeOperation(
    runtimeHttpBaseUrl,
    accessToken,
    "jira.issues.create",
    {
      connection_id: connectionId,
      payload: {
        target: {
          connection_id: connectionId,
          channel: {
            platform: "jira",
            space_id: site,
            container_kind: "group",
            container_id: projectKey,
          },
        },
        issuetype: issueType,
        summary: `Frontdoor Jira cleanroom smoke ${new Date().toISOString()}`,
        description: `server=${serverId}\nadapter=${adapterId}\nproject=${projectKey}`,
      },
    },
  );
  const issueKey = requireIssueKey(issueCreate);

  const backfill = await callRuntimeOperation(
    runtimeHttpBaseUrl,
    accessToken,
    "adapters.connections.backfill",
    {
      connectionId,
      since: backfillSince,
    },
  );
  const jobRunId = text(backfill?.job_run_id);
  const backfillRun = jobRunId
    ? await waitForJobRun(
        runtimeHttpBaseUrl,
        accessToken,
        jobRunId,
        pollTimeoutMs,
        pollIntervalMs,
      )
    : null;

  const deadline = Date.now() + pollTimeoutMs;
  let matchedRecord = null;
  while (Date.now() < deadline) {
    const records = await callRuntimeOperation(
      runtimeHttpBaseUrl,
      accessToken,
      "records.list",
      {
        limit: 500,
      },
    );
    const recordList = Array.isArray(records?.records) ? records.records : [];
    matchedRecord =
      recordList.find((record) => JSON.stringify(record).includes(issueKey)) ?? null;
    if (recordsContainIssue(recordList, issueKey)) {
      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            server_id: serverId,
            adapter_id: adapterId,
            session_id: sessionId,
            connection_id: connectionId,
            account: text(complete?.account) || null,
            account_contact: complete?.accountContact ?? null,
            metadata: complete?.metadata ?? null,
            status: connectionStatus,
            health: connectionTest,
            issue_key: issueKey,
            backfill_status: text(backfill?.status) || null,
            queue_entry_id: text(backfill?.queue_entry_id) || null,
            job_definition_id: text(backfill?.job_definition_id) || null,
            job_run_id: jobRunId || null,
            backfill_run: backfillRun,
            record: matchedRecord,
          },
          null,
          2,
        )}\n`,
      );
      return;
    }
    await sleep(pollIntervalMs);
  }

  fail("jira issue did not reappear via runtime ingest", {
    server_id: serverId,
    adapter_id: adapterId,
    session_id: sessionId,
    connection_id: connectionId,
    status: connectionStatus,
    health: connectionTest,
    issue_key: issueKey,
    backfill_status: text(backfill?.status) || null,
    queue_entry_id: text(backfill?.queue_entry_id) || null,
    job_definition_id: text(backfill?.job_definition_id) || null,
    job_run_id: jobRunId || null,
  });
}

main().catch((error) => {
  fail("unexpected_failure", {
    detail: error instanceof Error ? error.message : String(error),
  });
});

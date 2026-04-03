#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { DatabaseSync } from "node:sqlite";
import { spawn, spawnSync } from "node:child_process";

const NEXUS_MJS = "/app/nexus.mjs";
const WORKSPACE_ROOT = "/cleanroom-home/nexus";
const HOME_DIR = "/cleanroom-home";
const STATE_DIR = path.join(WORKSPACE_ROOT, "state");
const PORT = process.env.FORGE_RUNTIME_PORT?.trim() || "18795";
const RUNTIME_TOKEN = process.env.FORGE_RUNTIME_TOKEN?.trim() || "cleanroom-forge";
const RUNTIME_URL = `http://127.0.0.1:${PORT}`;
const RUNTIME_CALL_TIMEOUT_MS = String(
  process.env.FORGE_RUNTIME_CALL_TIMEOUT_MS?.trim() || "180000",
);
const SETUP_CALL_TIMEOUT_MS = String(
  process.env.FORGE_SETUP_TIMEOUT_MS?.trim() || RUNTIME_CALL_TIMEOUT_MS,
);
const SOURCE_ROOT = process.env.FORGE_SOURCE_ROOT?.trim() || "/umbrella";
const ADAPTER_ID = requireEnv("FORGE_ADAPTER_ID");
const DISPLAY_NAME = requireEnv("FORGE_DISPLAY_NAME");
const AUTH_METHOD_ID = requireEnv("FORGE_AUTH_METHOD_ID");
const HOST = requireEnv("FORGE_HOST");
const TOKEN = requireEnv("FORGE_TOKEN");
const USERNAME = process.env.FORGE_USERNAME?.trim() || "";
const SETUP_WORKSPACE = process.env.FORGE_SETUP_WORKSPACE?.trim() || "";
const EXPECTED_METHODS = parseJsonEnv("FORGE_EXPECTED_METHODS", []);
const PROOF_CALLS = parseJsonEnv("FORGE_PROOF_CALLS", []);
const PROOF_REPOSITORY_FULL_NAME = String(process.env.FORGE_PROOF_REPOSITORY_FULL_NAME ?? "").trim();
const PROOF_PULL_REQUEST_REPOSITORY_FULL_NAME = String(
  process.env.FORGE_PROOF_PULL_REQUEST_REPOSITORY_FULL_NAME ?? "",
).trim();
const ENABLE_INGEST_PROOF = String(process.env.FORGE_ENABLE_INGEST_PROOF ?? "").trim() === "1";
const MONITOR_PROOF_REPOSITORY_FULL_NAME = String(
  process.env.FORGE_MONITOR_PROOF_REPOSITORY_FULL_NAME ?? "",
).trim();
const MONITOR_PROOF_PULL_REQUEST_ID = String(
  process.env.FORGE_MONITOR_PROOF_PULL_REQUEST_ID ?? "",
).trim();
const MONITOR_PROOF_COMMENT_BODY_PREFIX = String(
  process.env.FORGE_MONITOR_PROOF_COMMENT_BODY_PREFIX ?? "Nex cleanroom monitor proof",
).trim();
const MONITOR_PROOF_TIMEOUT_MS = Number.parseInt(
  String(process.env.FORGE_MONITOR_PROOF_TIMEOUT_MS ?? "").trim(),
  10,
);
const MONITOR_PROOF_POLL_MS = Number.parseInt(
  String(process.env.FORGE_MONITOR_PROOF_POLL_MS ?? "").trim(),
  10,
);
const PREFERRED_REPOSITORIES = parseJsonEnv("FORGE_PREFERRED_REPOSITORIES", []);
const SETUP_REPOSITORY_SELECTION = String(
  process.env.FORGE_SETUP_REPOSITORY_SELECTION ?? "",
).trim();
const INITIAL_BACKFILL_SINCE = String(process.env.FORGE_INITIAL_BACKFILL_SINCE ?? "").trim();
const INGEST_PROOF = parseJsonEnv("FORGE_INGEST_PROOF", null);
const SOURCE_PACKAGE_ROOT = path.join(SOURCE_ROOT, "packages", "adapters", ADAPTER_ID);
const SOURCE_SDKS_ROOT = path.join(
  SOURCE_ROOT,
  "packages",
  "adapters",
  "nexus-adapter-sdks",
);
const BUILD_ROOT = `/tmp/${ADAPTER_ID}-cleanroom-src`;
const BUILD_ADAPTER_ROOT = path.join(BUILD_ROOT, "packages", "adapters", ADAPTER_ID);
const BUILD_SDKS_ROOT = path.join(BUILD_ROOT, "packages", "adapters", "nexus-adapter-sdks");
const PROOF_DIR =
  process.env.NEXUS_CLEANROOM_PROOF_BUNDLE_DIR?.trim() || `/tmp/${ADAPTER_ID}-cleanroom-proof`;

process.env.HOME = HOME_DIR;
process.env.NEXUS_HOME = HOME_DIR;
process.env.NEXUS_ROOT = WORKSPACE_ROOT;
process.env.NEXUS_STATE_DIR = STATE_DIR;
process.env.NEXUS_SKIP_CHANNELS = "1";
process.env.NEXUS_SKIP_GMAIL_WATCHER = "1";
process.env.NEXUS_SKIP_SCHEDULES = "1";
process.env.NEXUS_SKIP_CANVAS_HOST = "1";
process.env.NEXUS_SKIP_BROWSER_CONTROL_SERVER = "1";
process.env.NEXUS_RUNTIME_PORT = PORT;
process.env.NEXUS_RUNTIME_TOKEN = RUNTIME_TOKEN;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseJsonEnv(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  return JSON.parse(raw);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function clearDirectory(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

function writeJson(name, value) {
  mkdirp(PROOF_DIR);
  fs.writeFileSync(path.join(PROOF_DIR, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readMaybe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: "utf8",
    input: options.input,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (options.stdoutPath) {
    fs.writeFileSync(options.stdoutPath, result.stdout ?? "", "utf8");
  }
  if (options.stderrPath) {
    fs.writeFileSync(options.stderrPath, result.stderr ?? "", "utf8");
  }
  if (result.status !== 0) {
    const signalNote = result.signal ? ` signal=${result.signal}` : "";
    throw new Error(
      `${command} ${args.join(" ")} failed with code ${result.status}${signalNote}\n${result.stderr ?? ""}`,
    );
  }
  return result.stdout ?? "";
}

function parseMixedJson(raw) {
  const trimmed = (raw ?? "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  assert(start !== -1 && end !== -1 && end >= start, `no JSON object found in output:\n${trimmed}`);
  return JSON.parse(trimmed.slice(start, end + 1));
}

async function waitForRuntime(runtime, port, runtimeLogPath) {
  let runtimeExit = null;
  let runtimeSpawnError = null;

  runtime.once("error", (error) => {
    runtimeSpawnError = error;
  });
  runtime.once("exit", (code, signal) => {
    runtimeExit = { code, signal };
  });

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (runtimeSpawnError) {
      const logOutput = readMaybe(runtimeLogPath).trim();
      throw new Error(
        `runtime failed to start: ${runtimeSpawnError.message}${logOutput ? `\n${logOutput}` : ""}`,
      );
    }
    if (runtimeExit) {
      const logOutput = readMaybe(runtimeLogPath).trim();
      const exitBits = [
        runtimeExit.code == null ? null : `code ${runtimeExit.code}`,
        runtimeExit.signal ? `signal ${runtimeExit.signal}` : null,
      ].filter(Boolean);
      throw new Error(
        `runtime exited before binding (${exitBits.join(", ") || "unknown"})${logOutput ? `\n${logOutput}` : ""}`,
      );
    }

    const ok = await new Promise((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port: Number(port) });
      const onFail = () => {
        socket.destroy();
        resolve(false);
      };
      socket.once("connect", () => {
        socket.end();
        resolve(true);
      });
      socket.once("error", onFail);
      socket.setTimeout(400, onFail);
    });
    if (ok) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const logOutput = readMaybe(runtimeLogPath).trim();
  throw new Error(`runtime failed to bind 127.0.0.1:${port}${logOutput ? `\n${logOutput}` : ""}`);
}

function copySourceTree() {
  fs.rmSync(BUILD_ROOT, { recursive: true, force: true });
  mkdirp(path.dirname(BUILD_ADAPTER_ROOT));
  fs.cpSync(SOURCE_PACKAGE_ROOT, BUILD_ADAPTER_ROOT, {
    recursive: true,
    preserveTimestamps: false,
    filter: (source) => {
      const base = path.basename(source);
      return base !== "node_modules" && base !== "dist" && base !== "bin";
    },
  });
  fs.cpSync(SOURCE_SDKS_ROOT, BUILD_SDKS_ROOT, {
    recursive: true,
    preserveTimestamps: false,
    filter: (source) => {
      const base = path.basename(source);
      return base !== "node_modules" && base !== "dist";
    },
  });
}

function packageVersion() {
  const manifest = JSON.parse(fs.readFileSync(path.join(BUILD_ADAPTER_ROOT, "adapter.nexus.json"), "utf8"));
  assert(typeof manifest.version === "string" && manifest.version.trim(), "adapter version missing");
  return manifest.version.trim();
}

function findReleaseArchive(version) {
  const archive = path.join(BUILD_ADAPTER_ROOT, "dist", `${ADAPTER_ID}-${version}.tar.gz`);
  assert(fs.existsSync(archive), `release archive missing: ${archive}`);
  return archive;
}

function stageArchive(archivePath, version) {
  const operationId = `cleanroom-${ADAPTER_ID}-${Date.now()}`;
  const stagingDir = path.join(STATE_DIR, "packages", "staging", operationId);
  mkdirp(stagingDir);
  const stagedPath = path.join(stagingDir, path.basename(archivePath));
  fs.copyFileSync(archivePath, stagedPath);
  const raw = fs.readFileSync(stagedPath);
  return {
    operationId,
    stagedPath,
    sizeBytes: raw.byteLength,
    sha256: createHash("sha256").update(raw).digest("hex"),
    releaseId: `rel_${ADAPTER_ID}_${version.replaceAll(".", "_")}`,
  };
}

function seedCurrentOwnerIdentity() {
  const identityDbPath = path.join(STATE_DIR, "data", "identity.db");
  const db = new DatabaseSync(identityDbPath);
  try {
    db.prepare(
      `INSERT INTO entities (
        id, name, type, merged_into, normalized, is_user, is_agent, origin, created_at, updated_at, deleted_at
      ) VALUES (?, ?, 'person', NULL, ?, 1, 0, 'manual', ?, ?, NULL)`,
    ).run("entity-owner", "Cleanroom Owner", "cleanroom owner", Date.now(), Date.now());
    db.prepare(
      `INSERT INTO groups (id, name, description, parent_group_id, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, NULL, ?, ?, NULL)`,
    ).run("group-owner", "Owner", "Owner role", Date.now(), Date.now());
    db.prepare(
      `INSERT INTO group_members (id, group_id, entity_id, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("owner-membership", "group-owner", "entity-owner", "owner", Date.now(), Date.now());
  } finally {
    db.close();
  }
}

async function operatorInstall(staged, version) {
  const body = {
    kind: "adapter",
    package_id: ADAPTER_ID,
    version,
    release_id: staged.releaseId,
    operation_id: staged.operationId,
    staged_artifact: {
      server_path: staged.stagedPath,
      sha256: staged.sha256,
      size_bytes: staged.sizeBytes,
    },
    manifest: {
      id: ADAPTER_ID,
      version,
    },
  };
  writeJson("install-body.json", body);
  const response = await fetch(`${RUNTIME_URL}/api/operator/packages/install`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RUNTIME_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  writeJson("install.json", {
    status: response.status,
    ok: response.ok,
    body: parsed,
  });
  assert(response.ok, `operator install failed (${response.status})`);
  assert(parsed?.ok === true, `operator install body was not ok: ${JSON.stringify(parsed)}`);
}

function cliJson(args, name) {
  const stdoutPath = path.join(PROOF_DIR, `${name}.stdout.txt`);
  const stderrPath = path.join(PROOF_DIR, `${name}.stderr.txt`);
  const raw = run("node", [NEXUS_MJS, ...args], {
    stdoutPath,
    stderrPath,
  });
  const parsed = parseMixedJson(raw);
  writeJson(`${name}.json`, parsed);
  return parsed;
}

function runtimeCall(method, params, name, timeoutMs = RUNTIME_CALL_TIMEOUT_MS) {
  return cliJson(
    [
      "runtime",
      "call",
      method,
      "--json",
      "--timeout",
      String(timeoutMs),
      "--params",
      JSON.stringify(params),
    ],
    name,
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveBackfillRunId(connection, connectionStatus) {
  const connectionRunId =
    connection?.metadata?.automatic_activation?.backfill?.jobRunId;
  if (typeof connectionRunId === "string" && connectionRunId.trim()) {
    return connectionRunId.trim();
  }
  const statusRunId = connectionStatus?.summary?.backfill?.jobRunId;
  if (typeof statusRunId === "string" && statusRunId.trim()) {
    return statusRunId.trim();
  }
  return "";
}

function openWorkDb() {
  return new DatabaseSync(path.join(STATE_DIR, "data", "work.db"));
}

function findBackfillRun(connectionId, hintedRunId = "") {
  const db = openWorkDb();
  try {
    const connectionLike = `%\"connectionId\":\"${connectionId}\"%`;
    const latest = db
      .prepare(
        `SELECT id, status, input_json, output_json, error, metrics_json, started_at, completed_at, created_at
         FROM job_runs
         WHERE job_definition_id = 'jobdef_internal_adapter_backfill_execute'
           AND input_json LIKE ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(connectionLike);
    if (latest) {
      return latest;
    }
    if (!hintedRunId) {
      return null;
    }
    return (
      db
        .prepare(
          `SELECT id, status, input_json, output_json, error, metrics_json, started_at, completed_at, created_at
           FROM job_runs
           WHERE id = ?
           LIMIT 1`,
        )
        .get(hintedRunId) ?? null
    );
  } finally {
    db.close();
  }
}

async function waitForConnectionBackfillQuiescence(connection, connectionStatus) {
  if (String(process.env.FORGE_SKIP_BACKFILL_WAIT ?? "").trim() === "1") {
    writeJson("connection-backfill-wait.json", {
      ok: true,
      skipped: true,
      reason: "skip_requested",
      initial_connection_status: connectionStatus,
    });
    return connectionStatus;
  }
  const timeoutMs = Number.parseInt(process.env.FORGE_BACKFILL_WAIT_TIMEOUT_MS ?? "", 10);
  const pollMs = Number.parseInt(process.env.FORGE_BACKFILL_WAIT_POLL_MS ?? "", 10);
  const deadline = Date.now() + (Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 240_000);
  const intervalMs = Number.isFinite(pollMs) && pollMs > 0 ? pollMs : 2_000;
  const hintedRunId = resolveBackfillRunId(connection, connectionStatus);
  const samples = [];
  const isTerminalStatus = (status) =>
    status === "completed" || status === "failed" || status === "cancelled";
  let lastObservedRun = null;

  while (Date.now() < deadline) {
    const runStatus = findBackfillRun(connection.connectionId, hintedRunId);
    writeJson(`connection-backfill-run-${samples.length + 1}.json`, { run: runStatus });
    samples.push({
      observed_at: new Date().toISOString(),
      run: runStatus,
    });
    if (!runStatus) {
      await sleep(intervalMs);
      continue;
    }
    lastObservedRun = runStatus;

    const currentStatus = String(runStatus?.status ?? "").trim();
    if (isTerminalStatus(currentStatus)) {
      const finalConnectionStatus = runtimeCall(
        "adapters.connections.status",
        { connectionId: connection.connectionId },
        "connection-status-after-backfill",
      );
      const ok = currentStatus === "completed";
      writeJson("connection-backfill-wait.json", {
        ok,
        backfill_run_id: runStatus.id,
        terminal_status: currentStatus,
        waited_ms: samples.length > 1 ? intervalMs * (samples.length - 1) : 0,
        polls: samples.length,
        final_run: runStatus,
        final_connection_status: finalConnectionStatus,
      });
      if (!ok) {
        throw new Error(
          `automatic adapter backfill finished with ${currentStatus}: ${JSON.stringify(runStatus)}`,
        );
      }
      return finalConnectionStatus;
    }
    await sleep(intervalMs);
  }

  const finalRunStatus = findBackfillRun(connection.connectionId, hintedRunId) ?? lastObservedRun;
  const finalConnectionStatus = runtimeCall(
    "adapters.connections.status",
    { connectionId: connection.connectionId },
    "connection-status-timeout-final",
  );
  samples.push({
    observed_at: new Date().toISOString(),
    run: finalRunStatus,
  });
  writeJson("connection-backfill-wait.json", {
    ok: false,
    backfill_run_id: String(finalRunStatus?.id ?? hintedRunId ?? "").trim(),
    waited_ms: samples.length > 1 ? intervalMs * (samples.length - 1) : 0,
    polls: samples.length,
    final_run: finalRunStatus,
    final_connection_status: finalConnectionStatus,
  });
  throw new Error(
    `automatic adapter backfill did not quiesce before proof reads: ${JSON.stringify(finalRunStatus)}`,
  );
}

function openRecordsDb() {
  return new DatabaseSync(path.join(STATE_DIR, "data", "records.db"));
}

function queryForgeRecordCounts(providerID, repoFullName) {
  const db = openRecordsDb();
  try {
    const prefix = `git:${providerID}:${repoFullName}:`;
    const rows = db
      .prepare(
        `SELECT COALESCE(json_extract(metadata, '$.entity_type'), '') AS entity_type, COUNT(*) AS count
         FROM records
         WHERE platform = 'git'
           AND COALESCE(json_extract(metadata, '$.external_record_id'), '') LIKE ?
         GROUP BY 1`,
      )
      .all(`${prefix}%`);
    const counts = {
      commit: 0,
      pull_request: 0,
      pr_comment: 0,
    };
    for (const row of rows) {
      const entityType = String(row?.entity_type ?? "").trim();
      const count = Number(row?.count ?? 0);
      if (Object.prototype.hasOwnProperty.call(counts, entityType)) {
        counts[entityType] = count;
      }
    }
    return counts;
  } finally {
    db.close();
  }
}

function queryForgeWorkspaceRecordCounts(providerID, repositories) {
  const normalizedRepos = Array.isArray(repositories)
    ? repositories
        .map((repo) => normalizeSelectedRepo(repo))
        .filter((repo) => String(repo.fullName ?? "").trim())
    : [];
  const perRepository = [];
  const totals = {
    commit: 0,
    pull_request: 0,
    pr_comment: 0,
  };
  for (const repo of normalizedRepos) {
    const counts = queryForgeRecordCounts(providerID, repo.fullName);
    perRepository.push({
      repository: repo.fullName,
      counts,
      total: counts.commit + counts.pull_request + counts.pr_comment,
    });
    totals.commit += counts.commit;
    totals.pull_request += counts.pull_request;
    totals.pr_comment += counts.pr_comment;
  }
  const repositoriesWithRecords = perRepository.filter((entry) => entry.total > 0);
  repositoriesWithRecords.sort((left, right) => right.total - left.total);
  return {
    tracked_repository_count: normalizedRepos.length,
    repositories_with_records: repositoriesWithRecords.length,
    totals,
    top_repositories: repositoriesWithRecords.slice(0, 20),
  };
}

function queryForgeCommentRecord(providerID, repoFullName, prID, commentID, body) {
  const db = openRecordsDb();
  try {
    if (commentID) {
      const row = db
        .prepare(
          `SELECT id, record_id, content, timestamp, metadata
           FROM records
           WHERE platform = 'git'
             AND COALESCE(json_extract(metadata, '$.external_record_id'), '') = ?
           LIMIT 1`,
        )
        .get(`git:${providerID}:${repoFullName}:pr/${prID}:comment/${commentID}`);
      if (row) {
        return row;
      }
    }
    return db
      .prepare(
        `SELECT id, record_id, content, timestamp, metadata
         FROM records
         WHERE platform = 'git'
           AND COALESCE(json_extract(metadata, '$.external_record_id'), '') LIKE ?
           AND COALESCE(json_extract(metadata, '$.entity_type'), '') = 'pr_comment'
           AND content = ?
         ORDER BY timestamp DESC
         LIMIT 1`,
      )
      .get(`git:${providerID}:${repoFullName}:pr/${prID}:comment/%`, body);
  } finally {
    db.close();
  }
}

function resolveMonitorProofRepository(firstRepo) {
  const candidate = MONITOR_PROOF_REPOSITORY_FULL_NAME || PROOF_REPOSITORY_FULL_NAME;
  if (candidate && candidate.toLowerCase() === firstRepo.fullName.toLowerCase()) {
    return firstRepo;
  }
  if (candidate) {
    return normalizeSelectedRepo({ full_name: candidate });
  }
  return firstRepo;
}

function resolveMonitorProofCallTimeout() {
  if (Number.isFinite(MONITOR_PROOF_TIMEOUT_MS) && MONITOR_PROOF_TIMEOUT_MS > 0) {
    return MONITOR_PROOF_TIMEOUT_MS;
  }
  return 180_000;
}

function resolveMonitorProofPollInterval() {
  if (Number.isFinite(MONITOR_PROOF_POLL_MS) && MONITOR_PROOF_POLL_MS > 0) {
    return MONITOR_PROOF_POLL_MS;
  }
  return 5_000;
}

function resolveMonitorProofDeadlineMs() {
  return resolveMonitorProofCallTimeout();
}

async function runForgeIngestProof(connectionId, firstRepo) {
  const monitorRepo = resolveMonitorProofRepository(firstRepo);
  const backfillCounts = queryForgeRecordCounts(ADAPTER_ID, monitorRepo.fullName);
  writeJson("ingest-backfill-counts.json", {
    provider: ADAPTER_ID,
    repository: monitorRepo.fullName,
    counts: backfillCounts,
  });
  assert(backfillCounts.commit > 0, `expected backfill commit records for ${monitorRepo.fullName}`);
  assert(backfillCounts.pull_request > 0, `expected backfill pull request records for ${monitorRepo.fullName}`);
  assert(backfillCounts.pr_comment > 0, `expected backfill pull request comment records for ${monitorRepo.fullName}`);

  let prID = MONITOR_PROOF_PULL_REQUEST_ID;
  if (!prID) {
    const prList = runtimeCall(
      `${ADAPTER_ID}.pull_requests.list`,
      {
        connection_id: connectionId,
        payload: {
          repository: monitorRepo.fullName,
        },
      },
      "ingest-monitor-pr-list",
    );
    const pullRequests = Array.isArray(prList?.pull_requests) ? prList.pull_requests : [];
    const chosen = pullRequests.find((entry) => String(entry?.state ?? "").trim().toLowerCase() === "open") ?? pullRequests[0];
    prID = String(chosen?.id ?? "").trim();
  }
  assert(prID, `no pull request available for monitor proof on ${monitorRepo.fullName}`);

  const beforeCounts = queryForgeRecordCounts(ADAPTER_ID, monitorRepo.fullName);
  const commentBody = `${MONITOR_PROOF_COMMENT_BODY_PREFIX} ${new Date().toISOString()}`;
  const createResult = runtimeCall(
    `${ADAPTER_ID}.pull_requests.comments.create`,
    {
      connection_id: connectionId,
      payload: {
        target: {
          connection_id: connectionId,
          channel: {
            platform: ADAPTER_ID,
            container_id: monitorRepo.fullName,
            thread_id: `pr/${prID}`,
          },
        },
        body: commentBody,
      },
    },
    "ingest-monitor-comment-create",
  );
  assert(createResult?.success === true, `monitor proof comment create failed: ${JSON.stringify(createResult)}`);
  const messageIDs = Array.isArray(createResult?.message_ids) ? createResult.message_ids : [];
  const commentID =
    String(messageIDs.find((entry) => String(entry ?? "").startsWith("comment/")) ?? "")
      .replace(/^comment\//, "")
      .trim();

  const deadline = Date.now() + resolveMonitorProofDeadlineMs();
  const pollMs = resolveMonitorProofPollInterval();
  let observedRecord = null;
  let observedCounts = beforeCounts;
  while (Date.now() < deadline) {
    observedRecord = queryForgeCommentRecord(ADAPTER_ID, monitorRepo.fullName, prID, commentID, commentBody);
    observedCounts = queryForgeRecordCounts(ADAPTER_ID, monitorRepo.fullName);
    if (observedRecord) {
      break;
    }
    await sleep(pollMs);
  }
  writeJson("ingest-monitor-proof.json", {
    ok: Boolean(observedRecord),
    provider: ADAPTER_ID,
    repository: monitorRepo.fullName,
    pull_request_id: prID,
    create_result: createResult,
    comment_body: commentBody,
    counts_before: beforeCounts,
    counts_after: observedCounts,
    observed_record: observedRecord,
  });
  assert(observedRecord, `monitor proof comment record was not ingested for ${monitorRepo.fullName} pr/${prID}`);
  assert(
    observedCounts.pr_comment > beforeCounts.pr_comment,
    `expected pr_comment count to increase for ${monitorRepo.fullName}; before=${beforeCounts.pr_comment} after=${observedCounts.pr_comment}`,
  );
  return {
    repository: monitorRepo.fullName,
    pull_request_id: prID,
    counts_before: beforeCounts,
    counts_after: observedCounts,
    observed_record_id: observedRecord?.record_id ?? "",
  };
}

function resolveRepositorySelection(setupResult) {
  if (SETUP_REPOSITORY_SELECTION) {
    if (SETUP_REPOSITORY_SELECTION.toLowerCase() === "all") {
      return { selection: "all", chosen: null };
    }
    const firstRequested = SETUP_REPOSITORY_SELECTION.split(",")[0]?.trim() ?? "";
    const parts = firstRequested.split("/");
    return {
      selection: SETUP_REPOSITORY_SELECTION,
      chosen: firstRequested
        ? {
            fullName: firstRequested,
            name: parts[parts.length - 1] ?? firstRequested,
          }
        : null,
    };
  }
  const available = Array.isArray(setupResult?.metadata?.available_repos)
    ? setupResult.metadata.available_repos
    : [];
  const preferred = [
    PROOF_REPOSITORY_FULL_NAME,
    ...(Array.isArray(PREFERRED_REPOSITORIES) ? PREFERRED_REPOSITORIES : []),
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (preferred.length === 0) {
    return { selection: "all", chosen: null };
  }
  const lookup = new Map();
  for (const candidate of available) {
    const fullName = String(candidate?.full_name ?? "").trim();
    const name = String(candidate?.name ?? "").trim();
    if (fullName) {
      lookup.set(fullName.toLowerCase(), { fullName, name });
    }
    if (name) {
      lookup.set(name.toLowerCase(), { fullName, name });
    }
  }
  for (const preferredValue of preferred) {
    const match = lookup.get(preferredValue);
    if (!match) {
      continue;
    }
    return {
      selection: match.fullName || match.name,
      chosen: {
        fullName: match.fullName,
        name: match.name,
      },
    };
  }
  const fallback = preferred[0] ?? "";
  if (fallback) {
    const parts = fallback.split("/");
    return {
      selection: fallback,
      chosen: {
        fullName: fallback,
        name: parts[parts.length - 1] ?? fallback,
      },
    };
  }
  return { selection: "all", chosen: null };
}

function normalizeSelectedRepo(repo) {
  const fullName = String(repo?.full_name ?? "").trim();
  const parts = fullName.split("/");
  const name = String(repo?.name ?? parts[parts.length - 1] ?? "").trim();
  const spaceID =
    parts.length > 1 ? parts.slice(0, parts.length - 1).join("/") : "";
  return {
    fullName,
    name,
    spaceID,
    defaultBranch: String(repo?.default_branch ?? "").trim(),
    id: String(repo?.id ?? "").trim(),
  };
}

function firstTrackedRepository(connectionResult) {
  const repositories = connectionResult?.metadata?.adapter_config?.repositories;
  if (!Array.isArray(repositories) || repositories.length === 0) {
    throw new Error("connection result did not include tracked repositories");
  }
  const selected =
    repositories.find(
      (repository) =>
        String(repository?.full_name ?? "")
          .trim()
          .toLowerCase() === PROOF_REPOSITORY_FULL_NAME.toLowerCase(),
    ) ?? repositories[0];
  const repo = normalizeSelectedRepo(selected ?? {});
  const fullName = repo.fullName;
  if (!fullName) {
    throw new Error("first tracked repository was missing full_name");
  }
  return {
    fullName,
    name: repo.name,
    spaceID: repo.spaceID,
    defaultBranch: repo.defaultBranch,
    id: repo.id,
  };
}

function substitutePlaceholders(value, placeholders) {
  if (typeof value === "string") {
    if (Object.prototype.hasOwnProperty.call(placeholders, value)) {
      return placeholders[value];
    }
    let next = value;
    for (const [token, replacement] of Object.entries(placeholders)) {
      next = next.split(token).join(String(replacement ?? ""));
    }
    return next;
  }
  if (Array.isArray(value)) {
    return value.map((item) => substitutePlaceholders(item, placeholders));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        substitutePlaceholders(child, placeholders),
      ]),
    );
  }
  return value;
}

function enrichProofPlaceholders(placeholders, result) {
  if (!result || typeof result !== "object") {
    return;
  }
  const repositories = Array.isArray(result.repositories) ? result.repositories : [];
  if (repositories.length > 0) {
    const first = normalizeSelectedRepo(repositories[0]);
    if (!String(placeholders["$FIRST_REPO_FULL_NAME"] ?? "").trim()) {
      placeholders["$FIRST_REPO_FULL_NAME"] = first.fullName;
    }
    if (!String(placeholders["$FIRST_REPO_NAME"] ?? "").trim()) {
      placeholders["$FIRST_REPO_NAME"] = first.name;
    }
    if (!String(placeholders["$FIRST_REPO_SPACE_ID"] ?? "").trim()) {
      placeholders["$FIRST_REPO_SPACE_ID"] = first.spaceID;
    }
    if (!String(placeholders["$FIRST_REPO_DEFAULT_BRANCH"] ?? "").trim()) {
      placeholders["$FIRST_REPO_DEFAULT_BRANCH"] = first.defaultBranch;
    }
    if (!String(placeholders["$FIRST_REPO_ID"] ?? "").trim()) {
      placeholders["$FIRST_REPO_ID"] = first.id;
    }
  }

  const commits = Array.isArray(result.commits) ? result.commits : [];
  if (commits.length > 0) {
    const firstCommit = commits[0];
    placeholders["$FIRST_COMMIT_SHA"] = String(firstCommit.sha ?? "").trim();
  }

  const pullRequests = Array.isArray(result.pull_requests) ? result.pull_requests : [];
  if (pullRequests.length > 0) {
    const firstPR = pullRequests[0];
    placeholders["$FIRST_PULL_REQUEST_ID"] = String(firstPR.id ?? "").trim();
    placeholders["$FIRST_PULL_REQUEST_HEAD_SHA"] = String(firstPR.head_commit_sha ?? "").trim();
  }
}

function validateProofResult(method, result) {
  assert(result && typeof result === "object", `${method} returned no result object`);
  if (!String(method).endsWith(".pull_requests.source_archive.get")) {
    return;
  }
  const attachment = result.attachment;
  assert(attachment && typeof attachment === "object", `${method} missing attachment metadata`);
  const attachmentId = String(attachment.id ?? "").trim();
  const filename = String(attachment.filename ?? "").trim();
  const localPath = String(attachment.local_path ?? "").trim();
  const artifactKind = String(attachment?.metadata?.artifact_kind ?? "").trim();
  assert(attachmentId, `${method} missing attachment.id`);
  assert(filename, `${method} missing attachment.filename`);
  assert(localPath, `${method} missing attachment.local_path`);
  assert(artifactKind === "source_archive", `${method} returned unexpected artifact_kind=${JSON.stringify(artifactKind)}`);
  assert(fs.existsSync(localPath), `${method} attachment.local_path does not exist: ${localPath}`);
}

function queryIngestRecords(filters = {}) {
  const db = new DatabaseSync(path.join(STATE_DIR, "data", "records.db"));
  try {
    const clauses = ["platform = ?"];
    const params = [String(filters.platform ?? "git").trim() || "git"];
    if (filters.externalRecordPrefix) {
      clauses.push("json_extract(metadata, '$.external_record_id') LIKE ?");
      params.push(`${String(filters.externalRecordPrefix).trim()}%`);
    }
    if (filters.entityType) {
      clauses.push("json_extract(metadata, '$.entity_type') = ?");
      params.push(String(filters.entityType).trim());
    }
    if (filters.containerID) {
      clauses.push("container_id = ?");
      params.push(String(filters.containerID).trim());
    }
    if (filters.threadID) {
      clauses.push("thread_id = ?");
      params.push(String(filters.threadID).trim());
    }
    if (filters.contentContains) {
      clauses.push("content LIKE ?");
      params.push(`%${String(filters.contentContains)}%`);
    }
    if (Number.isFinite(filters.timestampAfter) && filters.timestampAfter > 0) {
      clauses.push("timestamp >= ?");
      params.push(Number(filters.timestampAfter));
    }
    const limit = Number.isFinite(filters.limit) && filters.limit > 0 ? Number(filters.limit) : 50;
    const query = `
      SELECT
        id,
        record_id,
        content,
        timestamp,
        container_id,
        thread_id,
        reply_to_id,
        json_extract(metadata, '$.external_record_id') AS external_record_id,
        json_extract(metadata, '$.entity_type') AS entity_type,
        metadata
      FROM records
      WHERE ${clauses.join(" AND ")}
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    return db.prepare(query).all(...params, limit);
  } finally {
    db.close();
  }
}

function assertIngestHistory(proofConfig, placeholders) {
  const repository = String(
    substitutePlaceholders(proofConfig?.repository ?? "$FIRST_REPO_FULL_NAME", placeholders),
  ).trim();
  assert(repository, "ingest proof repository resolved empty");
  const requiredEntityTypes = Array.isArray(proofConfig?.required_entity_types)
    ? proofConfig.required_entity_types.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
  const externalRecordPrefix = `git:${ADAPTER_ID}:${repository}:`;
  const assertions = requiredEntityTypes.map((entityType) => {
    const rows = queryIngestRecords({
      externalRecordPrefix,
      entityType,
      limit: 5,
    });
    return {
      entity_type: entityType,
      count: rows.length,
      sample: rows[0] ?? null,
    };
  });
  writeJson("backfill-ingest-history.proof.json", {
    repository,
    external_record_prefix: externalRecordPrefix,
    assertions,
  });
  for (const assertion of assertions) {
    assert(assertion.count > 0, `expected backfill to ingest at least one ${assertion.entity_type} record for ${repository}`);
  }
  return { repository, externalRecordPrefix, assertions };
}

async function waitForIngestMatch(expectation) {
  const timeoutMs = Number.parseInt(String(expectation?.timeout_ms ?? ""), 10);
  const pollMs = Number.parseInt(String(expectation?.poll_ms ?? ""), 10);
  const deadline = Date.now() + (Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 150_000);
  const intervalMs = Number.isFinite(pollMs) && pollMs > 0 ? pollMs : 5_000;
  const samples = [];
  while (Date.now() < deadline) {
    const rows = queryIngestRecords({
      externalRecordPrefix: expectation.externalRecordPrefix,
      entityType: expectation.entityType,
      threadID: expectation.threadID,
      contentContains: expectation.contentContains,
      timestampAfter: expectation.timestampAfter,
      limit: 10,
    });
    samples.push({
      observed_at: new Date().toISOString(),
      count: rows.length,
      sample: rows[0] ?? null,
    });
    if (rows.length > 0) {
      return { rows, polls: samples.length, samples };
    }
    await sleep(intervalMs);
  }
  return { rows: [], polls: samples.length, samples };
}

async function runIngestProof(proofConfig, placeholders) {
  if (!proofConfig || typeof proofConfig !== "object") {
    return null;
  }
  const history = assertIngestHistory(proofConfig, placeholders);
  const stimulusConfig = proofConfig.stimulus;
  const expectationConfig = proofConfig.expectation;
  if (!stimulusConfig || !expectationConfig) {
    return {
      repository: history.repository,
      history,
      monitor: null,
    };
  }

  const marker = `${ADAPTER_ID}-monitor-proof-${Date.now()}`;
  const ingestPlaceholders = {
    ...placeholders,
    "$MONITOR_PROOF_MARKER": marker,
  };
  const stimulusName = String(stimulusConfig.name ?? "monitor-stimulus").trim() || "monitor-stimulus";
  const stimulusMethod = String(stimulusConfig.method ?? "").trim();
  assert(stimulusMethod, "ingest proof stimulus.method is required");
  const stimulusParams = substitutePlaceholders(stimulusConfig.params ?? {}, ingestPlaceholders);
  const stimulusStartedAt = Date.now();
  const stimulusResult = runtimeCall(
    stimulusMethod,
    stimulusParams,
    `${stimulusName}.call`,
    String(stimulusConfig.timeout_ms ?? RUNTIME_CALL_TIMEOUT_MS),
  );
  writeJson(`${stimulusName}.proof.json`, {
    name: stimulusName,
    method: stimulusMethod,
    params: stimulusParams,
    result: stimulusResult,
    marker,
  });
  assert(stimulusResult?.success === true, `ingest proof stimulus failed: ${JSON.stringify(stimulusResult)}`);

  const expectation = {
    externalRecordPrefix: `git:${ADAPTER_ID}:${String(
      substitutePlaceholders(expectationConfig.repository ?? history.repository, ingestPlaceholders),
    ).trim()}:`,
    entityType: String(
      substitutePlaceholders(expectationConfig.entity_type ?? "", ingestPlaceholders),
    ).trim(),
    threadID: String(substitutePlaceholders(expectationConfig.thread_id ?? "", ingestPlaceholders)).trim(),
    contentContains: String(
      substitutePlaceholders(expectationConfig.content_contains ?? marker, ingestPlaceholders),
    ).trim(),
    timestampAfter:
      Number.isFinite(expectationConfig.timestamp_after) && expectationConfig.timestamp_after > 0
        ? Number(expectationConfig.timestamp_after)
        : stimulusStartedAt,
    timeout_ms: expectationConfig.timeout_ms,
    poll_ms: expectationConfig.poll_ms,
  };
  assert(expectation.entityType, "ingest proof expectation.entity_type is required");

  const monitor = await waitForIngestMatch(expectation);
  writeJson("monitor-ingest-proof.json", {
    ok: monitor.rows.length > 0,
    marker,
    expectation,
    polls: monitor.polls,
    first_match: monitor.rows[0] ?? null,
    samples: monitor.samples,
  });
  assert(
    monitor.rows.length > 0,
    `monitor did not ingest expected ${expectation.entityType} record for ${history.repository}`,
  );

  return {
    repository: history.repository,
    history,
    stimulus: {
      name: stimulusName,
      method: stimulusMethod,
      marker,
    },
    monitor: {
      entity_type: expectation.entityType,
      thread_id: expectation.threadID,
      content_contains: expectation.contentContains,
      matched_record_id: monitor.rows[0]?.record_id ?? "",
    },
  };
}

async function main() {
  mkdirp(PROOF_DIR);
  clearDirectory(PROOF_DIR);
  writeJson("proof-config.json", {
    adapter_id: ADAPTER_ID,
    proof_repository_full_name: PROOF_REPOSITORY_FULL_NAME,
    preferred_repositories: PREFERRED_REPOSITORIES,
    initial_backfill_since: INITIAL_BACKFILL_SINCE,
  });
  copySourceTree();

  run("go", ["test", "-vet=off", "./..."], {
    cwd: BUILD_ADAPTER_ROOT,
    env: {
      GOFLAGS: "-p=1",
      GOMAXPROCS: "1",
      GOMEMLIMIT: "1GiB",
    },
    stdoutPath: path.join(PROOF_DIR, "go-test.stdout.txt"),
    stderrPath: path.join(PROOF_DIR, "go-test.stderr.txt"),
  });
  run("go", ["build", "-o", `./bin/${ADAPTER_ID}-adapter`, "."], {
    cwd: BUILD_ADAPTER_ROOT,
    env: {
      GOFLAGS: "-p=1",
      GOMAXPROCS: "1",
      GOMEMLIMIT: "1GiB",
    },
    stdoutPath: path.join(PROOF_DIR, "go-build.stdout.txt"),
    stderrPath: path.join(PROOF_DIR, "go-build.stderr.txt"),
  });

  const validate = cliJson(["package", "validate", BUILD_ADAPTER_ROOT], "package-validate");
  assert(validate.ok === true, `package validate failed: ${JSON.stringify(validate)}`);

  const release = cliJson(["package", "release", BUILD_ADAPTER_ROOT], "package-release");
  assert(release.ok === true, `package release failed: ${JSON.stringify(release)}`);
  const version = packageVersion();
  const archivePath = findReleaseArchive(version);

  run("node", [NEXUS_MJS, "init", "--workspace", WORKSPACE_ROOT, "--json"], {
    stdoutPath: path.join(PROOF_DIR, "nexus-init.stdout.txt"),
    stderrPath: path.join(PROOF_DIR, "nexus-init.stderr.txt"),
  });
  seedCurrentOwnerIdentity();

  const runtimeLogPath = path.join(PROOF_DIR, "runtime.log");
  const runtimeLogFd = fs.openSync(runtimeLogPath, "w");
  const runtime = spawn(
    "node",
    [
      NEXUS_MJS,
      "runtime",
      "run",
      "--workspace",
      WORKSPACE_ROOT,
      "--port",
      PORT,
      "--bind",
      "loopback",
      "--auth",
      "token",
      "--token",
      RUNTIME_TOKEN,
    ],
    {
      env: process.env,
      stdio: ["ignore", runtimeLogFd, runtimeLogFd],
    },
  );

  const cleanup = () => {
    if (!runtime.killed) {
      runtime.kill("SIGTERM");
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  await waitForRuntime(runtime, PORT, runtimeLogPath);

  const staged = stageArchive(archivePath, version);
  await operatorInstall(staged, version);

  const packageHealth = await fetch(`${RUNTIME_URL}/api/operator/packages/adapter/${ADAPTER_ID}/health`, {
    headers: { Authorization: `Bearer ${RUNTIME_TOKEN}` },
  });
  writeJson("package-health.json", {
    status: packageHealth.status,
    ok: packageHealth.ok,
    body: await packageHealth.json(),
  });

  const methods = cliJson(
    [
      "runtime",
      "call",
      "adapters.methods",
      "--json",
      "--timeout",
      RUNTIME_CALL_TIMEOUT_MS,
      "--params",
      JSON.stringify({ id: ADAPTER_ID }),
    ],
    "methods",
  );
  const methodNames = Array.isArray(methods.methods)
    ? methods.methods.map((entry) => entry?.name).filter(Boolean)
    : [];
  for (const methodName of EXPECTED_METHODS) {
    assert(methodNames.includes(methodName), `${methodName} missing from method catalog`);
  }

  const setupStart = cliJson(
    [
      "adapters",
      "connections",
      "custom-start",
      "--json",
      "--timeout",
      SETUP_CALL_TIMEOUT_MS,
      "--params",
      JSON.stringify({
        adapter: ADAPTER_ID,
        authMethodId: AUTH_METHOD_ID,
      }),
    ],
    "connection-custom-start",
  );
  assert(setupStart.status === "requires_input", `custom start failed: ${JSON.stringify(setupStart)}`);

  const setupPayload = {
    host: HOST,
    token: TOKEN,
  };
  if (USERNAME) {
    setupPayload.username = USERNAME;
  }
  if (SETUP_WORKSPACE) {
    setupPayload.workspace = SETUP_WORKSPACE;
  }

  const setupCredentials = cliJson(
    [
      "adapters",
      "connections",
      "custom-submit",
      "--json",
      "--timeout",
      SETUP_CALL_TIMEOUT_MS,
      "--params",
      JSON.stringify({
        adapter: ADAPTER_ID,
        sessionId: setupStart.sessionId,
        payload: setupPayload,
      }),
    ],
    "connection-custom-submit-credentials",
  );
  assert(
    setupCredentials.status === "requires_input",
    `credential submit failed: ${JSON.stringify(setupCredentials)}`,
  );
  const repositorySelection = resolveRepositorySelection(setupCredentials);
  const activeSessionId = String(
    setupCredentials.sessionId ?? setupStart.sessionId ?? "",
  ).trim();
  assert(activeSessionId, "credential submit did not return a setup session id");

  const connection = cliJson(
    [
      "adapters",
      "connections",
      "custom-submit",
      "--json",
      "--timeout",
      SETUP_CALL_TIMEOUT_MS,
      "--params",
      JSON.stringify({
        adapter: ADAPTER_ID,
        sessionId: activeSessionId,
        payload: {
          repositories: repositorySelection.selection,
          ...(INITIAL_BACKFILL_SINCE
            ? { backfill_since: INITIAL_BACKFILL_SINCE }
            : {}),
        },
      }),
    ],
    "connection-custom-submit-repositories",
  );
  assert(connection.status === "completed", `connection completion failed: ${JSON.stringify(connection)}`);
  const connectionId = connection.connectionId;
  assert(typeof connectionId === "string" && connectionId.length > 0, "missing connection id");

  const initialConnectionStatus = runtimeCall(
    "adapters.connections.status",
    { connectionId },
    "connection-status",
  );
  assert(
    initialConnectionStatus.status === "connected",
    `connection status failed: ${JSON.stringify(initialConnectionStatus)}`,
  );
  const connectionStatus = await waitForConnectionBackfillQuiescence(
    connection,
    initialConnectionStatus,
  );

  const trackedRepositories =
    connection?.metadata?.adapter_config?.repositories && Array.isArray(connection.metadata.adapter_config.repositories)
      ? connection.metadata.adapter_config.repositories
      : [];
  if (trackedRepositories.length > 1) {
    writeJson(
      "ingest-backfill-workspace-counts.json",
      queryForgeWorkspaceRecordCounts(ADAPTER_ID, trackedRepositories),
    );
  }

  const firstRepo = firstTrackedRepository(connection);
  let ingestProofResult = null;
  if (ENABLE_INGEST_PROOF) {
    ingestProofResult = await runForgeIngestProof(connectionId, firstRepo);
  }
  const proofCallResults = [];
  if (Array.isArray(PROOF_CALLS) && PROOF_CALLS.length > 0) {
    const placeholders = {
      "$CONNECTION_ID": connectionId,
      "$ACCOUNT": String(connection.account ?? connectionStatus.account ?? "").trim(),
      "$FIRST_REPO_FULL_NAME": firstRepo.fullName,
      "$FIRST_REPO_NAME": firstRepo.name,
      "$FIRST_REPO_SPACE_ID": firstRepo.spaceID,
      "$FIRST_REPO_DEFAULT_BRANCH": firstRepo.defaultBranch,
      "$FIRST_REPO_ID": firstRepo.id,
    };
    const firstPullRequestRepo = PROOF_PULL_REQUEST_REPOSITORY_FULL_NAME
      ? normalizeSelectedRepo({ full_name: PROOF_PULL_REQUEST_REPOSITORY_FULL_NAME })
      : firstRepo;
    placeholders["$FIRST_PULL_REQUEST_REPOSITORY_FULL_NAME"] = firstPullRequestRepo.fullName;
    placeholders["$FIRST_PULL_REQUEST_REPOSITORY_NAME"] = firstPullRequestRepo.name;
    placeholders["$FIRST_PULL_REQUEST_REPOSITORY_SPACE_ID"] = firstPullRequestRepo.spaceID;
    for (const [index, call] of PROOF_CALLS.entries()) {
      const method = String(call?.method ?? "").trim();
      assert(method, `proof call ${index} missing method`);
      const name = String(call?.name ?? `proof-call-${index + 1}`).trim();
      const timeoutRaw = String(call?.timeout_ms ?? call?.timeoutMs ?? RUNTIME_CALL_TIMEOUT_MS).trim();
      const timeoutMs = Number.parseInt(timeoutRaw, 10);
      const params = substitutePlaceholders(call?.params ?? {}, placeholders);
      const runtimeParams =
        Number.isFinite(timeoutMs) && timeoutMs > 0 && params && typeof params === "object" && !Array.isArray(params)
          ? { ...params, timeout_ms: timeoutMs }
          : params;
      const result = runtimeCall(
        method,
        runtimeParams,
        name,
        Number.isFinite(timeoutMs) && timeoutMs > 0 ? String(timeoutMs) : RUNTIME_CALL_TIMEOUT_MS,
      );
      validateProofResult(method, result);
      enrichProofPlaceholders(placeholders, result);
      proofCallResults.push({ name, method, params: runtimeParams, result });
      writeJson(`${name}.proof.json`, { name, method, params: runtimeParams, result });
    }
  }

  const summary = {
    adapter: ADAPTER_ID,
    display_name: DISPLAY_NAME,
    version,
    archive_path: archivePath,
    expected_methods: EXPECTED_METHODS,
    repository_selection: repositorySelection.selection,
    connection_id: connectionId,
    initial_connection_status: initialConnectionStatus.status,
    connection_status: connectionStatus.status,
    connected_account: connection.account ?? connectionStatus.account ?? "",
    first_repository: firstRepo,
    proof_calls: proofCallResults.map((entry) => ({
      name: entry.name,
      method: entry.method,
    })),
    ingest_proof: ingestProofResult ?? null,
  };
  writeJson("summary.json", summary);
  writeJson("result.json", { ok: true, summary });
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  writeJson("result.json", { ok: false, error: message });
  console.error(message);
  process.exitCode = 1;
});

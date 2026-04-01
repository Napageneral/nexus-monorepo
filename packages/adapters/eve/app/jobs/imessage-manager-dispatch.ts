import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { JobScriptContext } from "../../../../../nex/src/api/server-work.js";
import { initializeDatabase, openInitializedLedger, upsertSession } from "../../../../../nex/src/storage/index.js";

type JsonRecord = Record<string, unknown>;

type JobConfig = {
  assistant_entity_id?: string;
  assistant_workspace_id?: string;
  manager_session_id?: string;
  reply_image_path?: string;
  reply_caption?: string;
  require_content_prefix?: string;
  require_platform?: string;
  require_sender_entity_id?: string;
  require_receiver_entity_id?: string;
  require_sender_contact_id?: string;
  require_receiver_contact_id?: string;
  require_container_id?: string;
  target_contact_name?: string;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeConfig(value: unknown): JobConfig {
  const record = asRecord(value);
  return {
    assistant_entity_id: asString(record.assistant_entity_id) || undefined,
    assistant_workspace_id: asString(record.assistant_workspace_id) || undefined,
    manager_session_id: asString(record.manager_session_id) || undefined,
    reply_image_path: asString(record.reply_image_path) || undefined,
    reply_caption: asString(record.reply_caption) || undefined,
    require_content_prefix: asString(record.require_content_prefix) || undefined,
    require_platform: asString(record.require_platform) || undefined,
    require_sender_entity_id: asString(record.require_sender_entity_id) || undefined,
    require_receiver_entity_id: asString(record.require_receiver_entity_id) || undefined,
    require_sender_contact_id: asString(record.require_sender_contact_id) || undefined,
    require_receiver_contact_id: asString(record.require_receiver_contact_id) || undefined,
    require_container_id: asString(record.require_container_id) || undefined,
    target_contact_name: asString(record.target_contact_name) || undefined,
  };
}

function mergeConfig(base: JobConfig, override: JobConfig): JobConfig {
  return {
    assistant_entity_id: override.assistant_entity_id ?? base.assistant_entity_id,
    assistant_workspace_id: override.assistant_workspace_id ?? base.assistant_workspace_id,
    manager_session_id: override.manager_session_id ?? base.manager_session_id,
    reply_image_path: override.reply_image_path ?? base.reply_image_path,
    reply_caption: override.reply_caption ?? base.reply_caption,
    require_content_prefix: override.require_content_prefix ?? base.require_content_prefix,
    require_platform: override.require_platform ?? base.require_platform,
    require_sender_entity_id: override.require_sender_entity_id ?? base.require_sender_entity_id,
    require_receiver_entity_id:
      override.require_receiver_entity_id ?? base.require_receiver_entity_id,
    require_sender_contact_id:
      override.require_sender_contact_id ?? base.require_sender_contact_id,
    require_receiver_contact_id:
      override.require_receiver_contact_id ?? base.require_receiver_contact_id,
    require_container_id: override.require_container_id ?? base.require_container_id,
    target_contact_name: override.target_contact_name ?? base.target_contact_name,
  };
}

function parseJobConfigJson(value: unknown): JobConfig {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return normalizeConfig(value);
  }
  const raw = asString(value);
  if (!raw) {
    return {};
  }
  try {
    return normalizeConfig(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return {};
  }
}

function loadJobConfigFromWorkLedger(jobId: string, jobName: string): JobConfig {
  const workDb = openInitializedLedger("work", process.env);
  try {
    initializeDatabase("work", workDb);
    const byId = workDb
      .prepare("SELECT config_json FROM job_definitions WHERE id = ? LIMIT 1")
      .get(jobId) as { config_json?: string | null } | undefined;
    const byName =
      byId?.config_json != null
        ? byId
        : ((workDb
            .prepare("SELECT config_json FROM job_definitions WHERE name = ? ORDER BY created_at DESC LIMIT 1")
            .get(jobName) as { config_json?: string | null } | undefined) ??
          undefined);
    return parseJobConfigJson(byName?.config_json);
  } finally {
    workDb.close();
  }
}

async function loadJobConfigFromRuntime(ctx: JobScriptContext): Promise<JobConfig> {
  try {
    const byIdResult = resolveRuntimePayload(
      await ctx.runtime.callMethod("jobs.get", {
        id: ctx.job.id,
      }),
    );
    const byIdConfig = parseJobConfigJson(asRecord(byIdResult.job).config_json);
    if (byIdConfig.reply_image_path) {
      return byIdConfig;
    }
  } catch {
    // Fall through to name lookup.
  }

  const listResult = resolveRuntimePayload(
    await ctx.runtime.callMethod("jobs.list", {
      status: "active",
      limit: 200,
    }),
  );
  const jobs = Array.isArray(listResult.jobs) ? listResult.jobs : [];
  for (const candidate of jobs) {
    const record = asRecord(candidate);
    if (asString(record.name) !== ctx.job.name) {
      continue;
    }
    const config = parseJobConfigJson(record.config_json);
    if (config.reply_image_path) {
      return config;
    }
  }
  return {};
}

async function resolveConfigWithFallback(
  ctx: JobScriptContext,
): Promise<{ config: JobConfig; diagnostics: string }> {
  const direct = normalizeConfig(ctx.job.config);
  if (direct.reply_image_path) {
    return { config: direct, diagnostics: "direct" };
  }

  let runtimeStatus = "miss";
  try {
    const runtimeConfig = await loadJobConfigFromRuntime(ctx);
    if (runtimeConfig.reply_image_path) {
      return { config: mergeConfig(runtimeConfig, direct), diagnostics: "runtime" };
    }
    runtimeStatus = "empty";
  } catch {
    runtimeStatus = "error";
  }

  const ledgerConfig = loadJobConfigFromWorkLedger(ctx.job.id, ctx.job.name);
  const ledgerStatus = ledgerConfig.reply_image_path ? "hit" : "miss";
  return {
    config: mergeConfig(ledgerConfig, direct),
    diagnostics: `runtime=${runtimeStatus},ledger=${ledgerStatus}`,
  };
}

function resolveRuntimePayload(value: unknown): JsonRecord {
  const record = asRecord(value);
  const payload = asRecord(record.payload);
  return Object.keys(payload).length > 0 ? payload : record;
}

function resolveReplyImagePath(rawPath: string): string {
  const expanded = rawPath.startsWith("~/")
    ? path.join(process.env.HOME ?? "", rawPath.slice(2))
    : rawPath;
  return path.resolve(expanded);
}

const PROOF_TOKEN_PATTERN = /\b\d{10,}\b/;

export function extractProofToken(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.match(PROOF_TOKEN_PATTERN)?.[0] ?? null;
}

export function buildManagerDispatchIdempotencyKey(params: {
  requestId: string;
  containerId: string;
  inboundText: string;
}): string {
  const proofToken = extractProofToken(params.inboundText);
  if (proofToken) {
    return `eve-imessage-manager-dispatch:proof:${params.containerId}:${proofToken}`;
  }

  const normalizedText = params.inboundText.trim();
  if (!normalizedText) {
    return `eve-imessage-manager-dispatch:${params.requestId}`;
  }

  const digest = crypto
    .createHash("sha256")
    .update(`${params.containerId}\n${normalizedText}`, "utf8")
    .digest("hex")
    .slice(0, 24);
  return `eve-imessage-manager-dispatch:text:${digest}`;
}

function ensureManagerSession(params: {
  sessionId: string;
  workspaceId: string;
  entityId: string;
}): void {
  const agentsDb = openInitializedLedger("agents", process.env);
  try {
    initializeDatabase("agents", agentsDb);
    upsertSession(agentsDb, {
      id: params.sessionId,
      workspace_id: params.workspaceId,
      entity_id: params.entityId,
      role_config_id: "manager",
      model_config_id: "default",
      created_at: Date.now(),
      updated_at: Date.now(),
      status: "active",
    });
  } finally {
    agentsDb.close();
  }
}

function buildManagerMessage(params: {
  inboundText: string;
  senderEntityId: string;
  receiverEntityId: string;
  senderContactId: string;
  receiverContactId: string;
  replyTarget: string;
  threadId: string;
  replyCaption: string;
  replyImagePath: string;
  targetContactName?: string;
}): string {
  const inboundText = params.inboundText || "(no text body)";
  const replyTargetLiteral = JSON.stringify(params.replyTarget);
  const threadIdLiteral = JSON.stringify(params.threadId);
  const receiverContactIdLiteral = JSON.stringify(params.receiverContactId);
  const replyCaptionLiteral = JSON.stringify(params.replyCaption);
  const replyImagePathLiteral = JSON.stringify(params.replyImagePath);
  const targetContactName = params.targetContactName?.trim();
  const childTaskLiteral = JSON.stringify(
    targetContactName
      ? `Send the configured proof image to ${targetContactName} via iMessage. Resolve the correct target canonically using the runtime identity/contact surfaces and use only the exposed Eve method surface for delivery.`
      : "Send the configured proof image back to this same iMessage conversation using only the exposed Eve method surface.",
  );
  const childToolAllowlistLiteral = JSON.stringify(
    targetContactName ? ["entities.search", "contacts.list"] : [],
  );
  const childToolDenylistLiteral = JSON.stringify([
    "exec",
    "local.exec",
    "local.pty.start",
    "local.pty.list",
    "local.pty.poll",
    "local.pty.log",
    "local.pty.write",
    "local.pty.sendKeys",
    "local.pty.submit",
    "local.pty.paste",
    "local.pty.kill",
    "local.pty.remove",
    "browser",
  ]);
  const childPackageMethodNamesLiteral = JSON.stringify(["imessage.send"]);
  return [
    "Automation trigger: an Eve iMessage record matched the configured public manager proof route.",
    "",
    "Handle this as a public manager turn.",
    "1. Send a short acknowledgement in this iMessage conversation that the worker is handling it.",
    "2. Dispatch exactly one worker subagent.",
    "3. Your dispatch call must include the constrained child toolAllowlist, toolDenylist, and packageMethodNames described below.",
    "4. The worker must resolve any named destination canonically through runtime identity/contact tools instead of guessing or hardcoding a phone number.",
    "5. The worker must use the exposed Eve method surface to deliver the configured caption and media.",
    "6. Never call agents.wait(...) on this proof route. Any agents.wait call is a failure for this run.",
    "7. After the acknowledgement and dispatch, end your turn immediately.",
    "",
    `Most recent inbound iMessage: ${inboundText}`,
    `Sender entity id: ${params.senderEntityId}`,
    `Receiver entity id: ${params.receiverEntityId}`,
    `Sender contact id: ${params.senderContactId}`,
    `Connection id: ${params.receiverContactId}`,
    `Reply target: ${params.replyTarget}`,
    `Thread id: ${params.threadId}`,
    `Required caption: ${params.replyCaption}`,
    `Required media path: ${params.replyImagePath}`,
    ...(targetContactName ? [`Required entity lookup: ${targetContactName}`] : []),
    "",
    "Dispatch the worker with these constraints:",
    `- task: ${childTaskLiteral}`,
    ...(targetContactName
      ? [
          '- instructions must tell the worker to resolve the named destination canonically with runtime identity/contact tools, choose the best iMessage-capable contact, and send the configured caption and media through imessage.send.',
          '- instructions must explicitly forbid exec, local.exec, local.pty, browser, and filesystem search for contact resolution.',
        ]
      : [
          '- instructions must tell the worker to send the configured caption and media back to the triggering conversation through imessage.send.',
          '- instructions must explicitly forbid exec, local.exec, local.pty, browser, and extra discovery steps.',
          '- instructions must forbid a plain-text-only worker acknowledgement.',
        ]),
    `- toolAllowlist: ${childToolAllowlistLiteral}`,
    `- toolDenylist: ${childToolDenylistLiteral}`,
    `- packageMethodNames: ${childPackageMethodNamesLiteral}`,
    "",
    "Treat the dispatch constraints as mandatory, not advisory.",
    ...(targetContactName
      ? [
          `Resolve the named destination: ${targetContactName}`,
          "Use the canonical runtime identity/contact tools to determine the correct iMessage-capable contact.",
          `Have the worker send through connection id ${receiverContactIdLiteral}, with caption ${replyCaptionLiteral} and media path ${replyImagePathLiteral}.`,
        ]
      : [
          `Have the worker send back through connection id ${receiverContactIdLiteral}, container ${replyTargetLiteral}, thread ${threadIdLiteral}, with caption ${replyCaptionLiteral} and media path ${replyImagePathLiteral}.`,
        ]),
    "Do not invent unsupported target shortcuts or bypass the exposed runtime surfaces.",
  ].join("\n");
}

export default async function eveImessageManagerDispatch(
  ctx: JobScriptContext,
): Promise<Record<string, unknown>> {
  const event = asRecord(ctx.input.event);
  const properties = asRecord(event.properties);
  if (asString(event.type) !== "record.ingested") {
    return { ok: true, skipped: true, reason: "not_record_ingested" };
  }

  const invocationConfig = normalizeConfig(asRecord(ctx.input).config);
  const resolved = await resolveConfigWithFallback(ctx);
  const config = mergeConfig(resolved.config, invocationConfig);
  const diagnostics = invocationConfig.reply_image_path
    ? `${resolved.diagnostics},input=override`
    : resolved.diagnostics;
  const platform = asString(properties.platform);
  const requestId = asString(properties.request_id);
  const recordId = asString(properties.record_id);
  const senderEntityId = asString(properties.sender_entity_id);
  const receiverEntityId = asString(properties.receiver_entity_id);
  const senderContactId = asString(properties.sender_contact_id);
  const receiverContactId = asString(properties.receiver_contact_id);
  const containerId = asString(properties.container_id);
  const threadId = asString(properties.thread_id) || containerId;
  if (
    !requestId ||
    !recordId ||
    !platform ||
    !senderEntityId ||
    !receiverEntityId ||
    !senderContactId ||
    !receiverContactId ||
    !containerId ||
    !threadId
  ) {
    throw new Error("eve imessage manager dispatch requires record.ingested request, record, and routing ids");
  }

  if ((config.require_platform ?? "imessage") !== platform) {
    return { ok: true, skipped: true, reason: "platform_mismatch" };
  }
  if (
    config.require_sender_entity_id &&
    config.require_sender_entity_id !== senderEntityId
  ) {
    return { ok: true, skipped: true, reason: "sender_entity_mismatch" };
  }
  if (
    config.require_receiver_entity_id &&
    config.require_receiver_entity_id !== receiverEntityId
  ) {
    return { ok: true, skipped: true, reason: "receiver_entity_mismatch" };
  }
  if (
    config.require_sender_contact_id &&
    config.require_sender_contact_id !== senderContactId
  ) {
    return { ok: true, skipped: true, reason: "sender_contact_mismatch" };
  }
  if (
    config.require_receiver_contact_id &&
    config.require_receiver_contact_id !== receiverContactId
  ) {
    return { ok: true, skipped: true, reason: "receiver_contact_mismatch" };
  }
  if (config.require_container_id && config.require_container_id !== containerId) {
    return { ok: true, skipped: true, reason: "container_mismatch" };
  }

  const recordResult = resolveRuntimePayload(
    await ctx.runtime.callMethod("records.get", {
      id: recordId,
    }),
  );
  const record = asRecord(recordResult.record);

  const replyImagePath = config.reply_image_path
    ? resolveReplyImagePath(config.reply_image_path)
    : "";
  if (!replyImagePath) {
    throw new Error(
      `eve imessage manager dispatch requires job.config.reply_image_path [config-fallback:v2 ${diagnostics}]`,
    );
  }
  if (!fs.existsSync(replyImagePath)) {
    throw new Error(`eve imessage manager dispatch reply image missing: ${replyImagePath}`);
  }

  const assistantEntityId = config.assistant_entity_id || "entity-assistant";
  const assistantWorkspaceId = config.assistant_workspace_id || assistantEntityId;
  const managerSessionId =
    config.manager_session_id || "session:eve-imessage-public-manager-proof";
  ensureManagerSession({
    sessionId: managerSessionId,
    workspaceId: assistantWorkspaceId,
    entityId: assistantEntityId,
  });

  const replyCaption =
    config.reply_caption || `Eve automation proof reply for ${containerId}`;
  const inboundText = asString(record.content);
  if (config.require_content_prefix && !inboundText.startsWith(config.require_content_prefix)) {
    return { ok: true, skipped: true, reason: "content_prefix_mismatch" };
  }
  await ctx.runtime.callMethod("agents.sessions.send", {
    sessionId: managerSessionId,
    message: buildManagerMessage({
      inboundText,
      senderEntityId,
      receiverEntityId,
      senderContactId,
      receiverContactId,
      replyTarget: containerId,
      threadId,
      replyCaption,
      replyImagePath,
      targetContactName: config.target_contact_name,
    }),
    deliver: true,
    deliveryContext: {
      platform,
      to: containerId,
      accountId: receiverContactId,
      threadId,
    },
    runContext: {
      source_request_id: requestId,
      source_record_id: recordId,
      automation_job_id: ctx.job.id,
      automation_name: ctx.job.name,
    },
    idempotency_key: buildManagerDispatchIdempotencyKey({
      requestId,
      containerId,
      inboundText,
    }),
  });

  return {
    ok: true,
    queued: true,
    request_id: requestId,
    record_id: recordId,
    session_id: managerSessionId,
    reply_target: containerId,
    thread_id: threadId,
  };
}

import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import {
  type AdapterBackfillWindow,
  type AdapterContext,
  type AdapterHealth,
  type AdapterInboundRecord,
  defineAdapter,
} from "@nexus-project/adapter-sdk-ts";

type UnknownRecord = Record<string, unknown>;

type AlibabaRuntimeConfig = {
  snapshot_root: string;
  repo_root?: string;
  account_label: string;
  account_id: string;
  poll_interval_ms: number;
  monitor_overlap_ms: number;
  attachment_text_limit: number;
};

type SnapshotSummary = {
  generatedAt?: string | null;
  exportGeneratedAt?: string | null;
  messageCount?: number | null;
  attachmentHintCount?: number | null;
  errorCount?: number | null;
};

type SnapshotRef = {
  id: string;
  path: string;
  summary: SnapshotSummary;
  captured_at: number;
};

type AlibabaConversation = {
  cid: string;
  name?: string | null;
  companyName?: string | null;
  accountId?: string | null;
  aliId?: string | null;
};

type AlibabaMessage = {
  messageId: string;
  cid: string;
  conversationName?: string | null;
  companyName?: string | null;
  sendTime?: number | null;
  sentAt?: string | null;
  speaker?: string | null;
  direction?: string | null;
  msgType?: string | null;
  text?: string | null;
};

type AlibabaAttachment = {
  fileName?: string | null;
  category?: string | null;
  bytes?: number | null;
  contentType?: string | null;
  messageId?: string | null;
  cid?: string | null;
  localPath?: string | null;
  status?: string | null;
};

type AttachmentText = {
  fileName?: string | null;
  status?: string | null;
  extractor?: string | null;
  textPath?: string | null;
  textLength?: number | null;
};

type LoadedSnapshot = {
  ref: SnapshotRef;
  conversations: Map<string, AlibabaConversation>;
  messages: AlibabaMessage[];
  attachmentsByMessage: Map<string, AlibabaAttachment[]>;
  textByFile: Map<string, AttachmentText>;
};

type RuntimeContextLike = Pick<AdapterContext, "runtime" | "signal" | "log"> & {
  connectionId?: string;
};

const PLATFORM = "alibaba";
const DEFAULT_POLL_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_MONITOR_OVERLAP_MS = 72 * 60 * 60 * 1000;
const DEFAULT_ATTACHMENT_TEXT_LIMIT = 30_000;

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as UnknownRecord;
}

function textValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const valueTrimmed = value.trim();
  return valueTrimmed || undefined;
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readRuntimeConfig(ctx: RuntimeContextLike): AlibabaRuntimeConfig {
  const config = asRecord(ctx.runtime?.config);
  const snapshotRoot = textValue(config.snapshot_root);
  if (!snapshotRoot) throw new Error("runtime.config.snapshot_root is required");
  return {
    snapshot_root: resolve(snapshotRoot),
    ...(textValue(config.repo_root) ? { repo_root: resolve(String(config.repo_root)) } : {}),
    account_label: textValue(config.account_label) ?? "MoonSleep Alibaba",
    account_id: textValue(config.account_id) ?? "moonsleep-alibaba",
    poll_interval_ms: positiveNumber(config.poll_interval_ms, DEFAULT_POLL_INTERVAL_MS),
    monitor_overlap_ms: positiveNumber(config.monitor_overlap_ms, DEFAULT_MONITOR_OVERLAP_MS),
    attachment_text_limit: positiveNumber(
      config.attachment_text_limit,
      DEFAULT_ATTACHMENT_TEXT_LIMIT,
    ),
  };
}

function readJson(path: string): UnknownRecord {
  return JSON.parse(readFileSync(path, "utf8")) as UnknownRecord;
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function parseTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? Math.floor(value * 1000) : Math.floor(value);
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return parseTimestamp(numeric);
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function listSnapshots(snapshotRoot: string): SnapshotRef[] {
  if (!existsSync(snapshotRoot)) {
    throw new Error(`Alibaba snapshot root does not exist: ${snapshotRoot}`);
  }
  const entries = readdirSync(snapshotRoot, { withFileTypes: true });
  const snapshots: SnapshotRef[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(snapshotRoot, entry.name);
    if (entry.name.startsWith(".") || existsSync(join(path, ".incomplete"))) continue;
    const summaryPath = join(path, "summary.json");
    const messagesPath = existsSync(join(path, "adapter", "messages.jsonl"))
      ? join(path, "adapter", "messages.jsonl")
      : join(path, "messages.jsonl");
    if (!existsSync(summaryPath) || !existsSync(messagesPath)) continue;
    const summary = readJson(summaryPath) as SnapshotSummary;
    const capturedAt =
      parseTimestamp(summary.exportGeneratedAt) ||
      parseTimestamp(summary.generatedAt) ||
      Math.floor(statSync(summaryPath).mtimeMs);
    snapshots.push({ id: entry.name, path, summary, captured_at: capturedAt });
  }
  return snapshots.sort(
    (left, right) =>
      left.captured_at - right.captured_at || left.id.localeCompare(right.id),
  );
}

function latestSnapshot(snapshotRoot: string): SnapshotRef {
  const snapshots = listSnapshots(snapshotRoot);
  const latest = snapshots.at(-1);
  if (!latest) throw new Error(`No complete Alibaba snapshots found in ${snapshotRoot}`);
  return latest;
}

function loadSnapshot(ref: SnapshotRef): LoadedSnapshot {
  const adapterDir = join(ref.path, "adapter");
  const conversationPath = existsSync(join(adapterDir, "conversations.jsonl"))
    ? join(adapterDir, "conversations.jsonl")
    : join(ref.path, "conversations.jsonl");
  const messagePath = existsSync(join(adapterDir, "messages.jsonl"))
    ? join(adapterDir, "messages.jsonl")
    : join(ref.path, "messages.jsonl");
  const conversations = new Map(
    readJsonl<AlibabaConversation>(conversationPath)
      .filter((row) => textValue(row.cid))
      .map((row) => [row.cid, row]),
  );
  const messages = readJsonl<AlibabaMessage>(messagePath)
    .filter((row) => textValue(row.messageId) && textValue(row.cid))
    .sort((left, right) => messageTimestamp(left) - messageTimestamp(right));
  const attachmentsByMessage = new Map<string, AlibabaAttachment[]>();
  const sanitizedAttachmentPath = join(adapterDir, "attachments.jsonl");
  const normalizedAttachmentPath = join(ref.path, "local-index", "attachments.jsonl");
  const fallbackAttachmentPath = join(ref.path, "attachments.jsonl");
  for (const attachment of readJsonl<AlibabaAttachment>(
    existsSync(sanitizedAttachmentPath)
      ? sanitizedAttachmentPath
      : existsSync(normalizedAttachmentPath)
        ? normalizedAttachmentPath
        : fallbackAttachmentPath,
  )) {
    const messageId = textValue(attachment.messageId);
    if (!messageId) continue;
    const rows = attachmentsByMessage.get(messageId) ?? [];
    rows.push(attachment);
    attachmentsByMessage.set(messageId, rows);
  }
  const textByFile = new Map(
    readJsonl<AttachmentText>(
      existsSync(join(adapterDir, "attachment-text.jsonl"))
        ? join(adapterDir, "attachment-text.jsonl")
        : join(ref.path, "local-index", "attachment-text.jsonl"),
    )
      .filter((row) => textValue(row.fileName))
      .map((row) => [String(row.fileName), row]),
  );
  return { ref, conversations, messages, attachmentsByMessage, textByFile };
}

function messageTimestamp(message: AlibabaMessage): number {
  return parseTimestamp(message.sendTime) || parseTimestamp(message.sentAt);
}

function resolveEvidencePath(
  value: string | null | undefined,
  config: AlibabaRuntimeConfig,
  snapshot: SnapshotRef,
): string | undefined {
  const pathValue = textValue(value);
  if (!pathValue) return undefined;
  if (isAbsolute(pathValue)) return pathValue;
  const candidates = [
    config.repo_root ? resolve(config.repo_root, pathValue) : undefined,
    resolve(snapshot.path, pathValue),
    resolve(snapshot.path, "..", pathValue),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function sha256File(path: string | undefined): string | undefined {
  if (!path || !existsSync(path)) return undefined;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function mimeType(attachment: AlibabaAttachment): string {
  const explicit = textValue(attachment.contentType);
  if (explicit && explicit !== "application/octet-stream") return explicit;
  const name = String(attachment.fileName ?? "").toLowerCase();
  if (name.includes(".pdf")) return "application/pdf";
  if (/\.png(-|$)/.test(name)) return "image/png";
  if (/\.jpe?g(-|$)/.test(name)) return "image/jpeg";
  if (/\.webp(-|$)/.test(name)) return "image/webp";
  if (/\.gif(-|$)/.test(name)) return "image/gif";
  if (/\.(xlsx?)(-|$)/.test(name)) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (/\.(docx?)(-|$)/.test(name)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

function readAttachmentText(
  attachment: AlibabaAttachment,
  snapshot: LoadedSnapshot,
  config: AlibabaRuntimeConfig,
): string {
  const fileName = textValue(attachment.fileName);
  if (!fileName) return "";
  const row = snapshot.textByFile.get(fileName);
  if (!row || row.status !== "extracted") return "";
  const textPath = resolveEvidencePath(row.textPath, config, snapshot.ref);
  if (!textPath || !existsSync(textPath)) return "";
  return readFileSync(textPath, "utf8").trim();
}

function buildContent(
  message: AlibabaMessage,
  attachments: AlibabaAttachment[],
  snapshot: LoadedSnapshot,
  config: AlibabaRuntimeConfig,
): string {
  const sections: string[] = [];
  const body = textValue(message.text);
  if (body) sections.push(body);
  let remaining = config.attachment_text_limit;
  for (const attachment of attachments) {
    const fileName = textValue(attachment.fileName) ?? "attachment";
    const extracted = readAttachmentText(attachment, snapshot, config);
    if (extracted && remaining > 0) {
      const excerpt = extracted.slice(0, remaining);
      sections.push(`[Attachment: ${fileName}]\n${excerpt}`);
      remaining -= excerpt.length;
    } else {
      sections.push(`[Attachment: ${fileName}]`);
    }
  }
  return sections.join("\n\n") || "[Alibaba message without a text body]";
}

function buildRecord(
  message: AlibabaMessage,
  snapshot: LoadedSnapshot,
  config: AlibabaRuntimeConfig,
  connectionId: string,
): AdapterInboundRecord {
  const conversation = snapshot.conversations.get(message.cid);
  const attachments = snapshot.attachmentsByMessage.get(message.messageId) ?? [];
  const incoming = message.direction !== "outgoing";
  const supplierId = textValue(conversation?.aliId) ?? `conversation:${message.cid}`;
  const supplierName =
    textValue(message.conversationName) ??
    textValue(conversation?.name) ??
    textValue(message.companyName) ??
    textValue(conversation?.companyName) ??
    "Alibaba supplier";
  const timestamp = messageTimestamp(message);
  if (!timestamp) throw new Error(`Alibaba message ${message.messageId} has no timestamp`);

  const normalizedAttachments = attachments.map((attachment, index) => {
    const localPath = resolveEvidencePath(attachment.localPath, config, snapshot.ref);
    const fileName = textValue(attachment.fileName) ?? `attachment-${index + 1}`;
    const contentHash = sha256File(localPath);
    return {
      id: `alibaba:${message.messageId}:${index + 1}`,
      filename: fileName,
      mime_type: mimeType(attachment),
      ...(textValue(attachment.category) ? { media_type: String(attachment.category) } : {}),
      ...(Number.isFinite(Number(attachment.bytes)) && Number(attachment.bytes) >= 0
        ? { size: Math.floor(Number(attachment.bytes)) }
        : {}),
      ...(localPath && existsSync(localPath) ? { local_path: localPath } : {}),
      ...(contentHash ? { content_hash: contentHash } : {}),
      metadata: {
        evidence_status: textValue(attachment.status) ?? "unknown",
        snapshot_id: snapshot.ref.id,
      },
    };
  });

  return {
    operation: "record.ingest",
    routing: {
      adapter: PLATFORM,
      platform: PLATFORM,
      connection_id: connectionId,
      sender_id: incoming ? supplierId : config.account_id,
      sender_name: incoming ? textValue(message.speaker) ?? supplierName : config.account_label,
      receiver_id: incoming ? config.account_id : supplierId,
      receiver_name: incoming ? config.account_label : supplierName,
      space_id: config.account_id,
      space_name: config.account_label,
      container_kind: "direct",
      container_id: message.cid,
      container_name: supplierName,
      thread_id: message.cid,
      thread_name: supplierName,
      metadata: {
        source_system: "alibaba_messenger",
        supplier_ali_id: supplierId,
        supplier_account_id: textValue(conversation?.accountId) ?? null,
        company_name: textValue(message.companyName) ?? textValue(conversation?.companyName) ?? null,
        direction: incoming ? "incoming" : "outgoing",
      },
    },
    payload: {
      external_record_id: `message:${message.messageId}`,
      timestamp,
      content: buildContent(message, attachments, snapshot, config),
      content_type: "text",
      ...(normalizedAttachments.length > 0 ? { attachments: normalizedAttachments } : {}),
      metadata: {
        source_system: "alibaba_messenger",
        message_id: message.messageId,
        conversation_id: message.cid,
        message_type: textValue(message.msgType) ?? null,
        direction: incoming ? "incoming" : "outgoing",
        snapshot_id: snapshot.ref.id,
        snapshot_captured_at: snapshot.ref.captured_at,
        evidence_boundary: "sanitized_normalized_export",
      },
    },
  };
}

function recordsForWindow(
  snapshot: LoadedSnapshot,
  config: AlibabaRuntimeConfig,
  connectionId: string,
  sinceMs: number,
  toMs?: number,
): AdapterInboundRecord[] {
  return snapshot.messages
    .filter((message) => messageTimestamp(message) >= sinceMs)
    .filter((message) => toMs === undefined || messageTimestamp(message) <= toMs)
    .map((message) => buildRecord(message, snapshot, config, connectionId));
}

function connectionId(ctx: RuntimeContextLike): string {
  const value = textValue(ctx.connectionId) ?? textValue(ctx.runtime?.connection_id);
  if (!value) throw new Error("Alibaba adapter connection id is required");
  return value;
}

async function waitForAbort(signal: AbortSignal, milliseconds: number): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolvePromise) => {
    const timer = setTimeout(resolvePromise, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolvePromise();
      },
      { once: true },
    );
  });
}

function health(config: AlibabaRuntimeConfig): Omit<AdapterHealth, "connection_id"> {
  const latest = latestSnapshot(config.snapshot_root);
  return {
    connected: true,
    last_event_at: latest.captured_at,
    details: {
      adapter: PLATFORM,
      mode: "read_only_evidence",
      snapshot_root: config.snapshot_root,
      latest_snapshot_id: latest.id,
      latest_snapshot_captured_at: latest.captured_at,
      message_count: latest.summary.messageCount ?? null,
      attachment_hint_count: latest.summary.attachmentHintCount ?? null,
      export_error_count: latest.summary.errorCount ?? null,
      remote_mutation_enabled: false,
    },
  };
}

async function backfill(
  ctx: RuntimeContextLike,
  args: AdapterBackfillWindow,
  emit: (record: AdapterInboundRecord) => void,
): Promise<void> {
  const config = readRuntimeConfig(ctx);
  const snapshot = loadSnapshot(latestSnapshot(config.snapshot_root));
  const rows = recordsForWindow(
    snapshot,
    config,
    connectionId(ctx),
    args.since.getTime(),
    args.to?.getTime(),
  );
  for (const row of rows) emit(row);
}

async function monitor(
  ctx: RuntimeContextLike,
  emit: (record: AdapterInboundRecord) => void,
): Promise<void> {
  const config = readRuntimeConfig(ctx);
  while (!ctx.signal.aborted) {
    try {
      const snapshot = loadSnapshot(latestSnapshot(config.snapshot_root));
      const sinceMs = Date.now() - config.monitor_overlap_ms;
      for (const row of recordsForWindow(snapshot, config, connectionId(ctx), sinceMs)) emit(row);
    } catch (error) {
      ctx.log.error(
        "Alibaba snapshot monitor failed: %s",
        error instanceof Error ? error.message : String(error),
      );
    }
    await waitForAbort(ctx.signal, config.poll_interval_ms);
  }
}

export const __test__ = {
  buildRecord,
  latestSnapshot,
  listSnapshots,
  loadSnapshot,
  readRuntimeConfig,
  recordsForWindow,
};

export const alibabaAdapter = defineAdapter({
  platform: PLATFORM,
  name: "alibaba-messenger-adapter",
  version: "0.1.0",
  multi_account: true,
  capabilities: {
    text_limit: 0,
    supports_markdown: false,
    supports_tables: false,
    supports_code_blocks: false,
    supports_embeds: false,
    supports_threads: true,
    supports_reactions: false,
    supports_polls: false,
    supports_buttons: false,
    supports_edit: false,
    supports_delete: false,
    supports_media: true,
    supports_voice_notes: false,
  },
  projection: {
    families: [
      { name: "message", description: "Alibaba Messenger message and linked evidence" },
    ],
    backfill: { supported: true, strategy: "bounded_snapshot", cursor: "sendTime" },
    monitor: { supported: true, strategy: "snapshot_poll_with_overlap", cursor: "sendTime" },
    routing: {
      space: "Alibaba buyer account",
      container: "supplier conversation",
      thread: "supplier conversation",
      threads_supported: true,
    },
    record_ids: { record: "messageId", container: "cid", thread: "cid" },
    normalization: { content: "plain_text_plus_extracted_attachment_text", attachments: true },
  },
  connection: {
    connections: async (ctx) => {
      const config = readRuntimeConfig(ctx);
      return [
        {
          id: connectionId(ctx),
          display_name: config.account_label,
          status: "ready",
        },
      ];
    },
    health: async (ctx) => health(readRuntimeConfig(ctx)),
  },
  ingest: {
    backfill,
    monitor,
  },
});

import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import type { Stats } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
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
  object_root?: string;
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

type SnapshotComplete = {
  schemaVersion?: number;
  sealedAt?: string;
  captureGeneratedAt?: string | null;
  messageCount?: number;
  conversationCount?: number;
  attachmentCount?: number;
  attachmentTextCount?: number;
  adapterProjection?: {
    messagesSha256?: string;
    conversationsSha256?: string;
    attachmentsSha256?: string;
    attachmentTextSha256?: string;
  };
  authority?: {
    capture?: string;
    projection?: string;
    interpretation?: string;
    remoteMutation?: boolean;
    businessMutation?: boolean;
  };
};

type SnapshotRef = {
  id: string;
  path: string;
  summary: SnapshotSummary;
  complete: SnapshotComplete;
  complete_sha256: string;
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
  provider_object_json: string;
  provider_object_sha256: string;
};

type AlibabaAttachment = {
  fileName?: string | null;
  category?: string | null;
  bytes?: number | null;
  contentType?: string | null;
  messageId?: string | null;
  cid?: string | null;
  sentAt?: string | null;
  speaker?: string | null;
  messageText?: string | null;
  localPath?: string | null;
  objectPath?: string | null;
  contentHash?: string | null;
  status?: string | null;
  provider_object_json: string;
  provider_object_sha256: string;
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
  orphanAttachments: AlibabaAttachment[];
  textByFile: Map<string, AttachmentText>;
};

type RuntimeContextLike = Pick<AdapterContext, "runtime" | "signal" | "log"> & {
  connectionId?: string;
};

const PLATFORM = "alibaba";
const DEFAULT_POLL_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_MONITOR_OVERLAP_MS = 72 * 60 * 60 * 1000;
const DEFAULT_ATTACHMENT_TEXT_LIMIT = 30_000;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_COMPLETE_BYTES = 1 * 1024 * 1024;
const MAX_SUMMARY_BYTES = 1 * 1024 * 1024;
const MAX_CONVERSATIONS_BYTES = 64 * 1024 * 1024;
const MAX_MESSAGES_BYTES = 512 * 1024 * 1024;
const MAX_ATTACHMENTS_BYTES = 256 * 1024 * 1024;
const MAX_ATTACHMENT_TEXT_INDEX_BYTES = 256 * 1024 * 1024;
const MAX_ATTACHMENT_EVIDENCE_BYTES = 256 * 1024 * 1024;
const MAX_ATTACHMENT_TEXT_BYTES = 16 * 1024 * 1024;
const SETUP_CONFIRMATION = "ATTACH_SANITIZED_ALIBABA_CAPTURE";
const CONNECTION_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;

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

function requireSetupText(
  payload: UnknownRecord,
  name: string,
  options: { maxLength?: number } = {},
): string {
  const value = textValue(payload[name]);
  const maxLength = options.maxLength ?? 4096;
  if (!value || value.length > maxLength) {
    throw new Error(`Alibaba browser snapshot setup requires ${name}`);
  }
  return value;
}

function requireSafeSetupDirectory(path: string, name: string): string {
  if (!isAbsolute(path)) {
    throw new Error(`Alibaba browser snapshot ${name} must be an absolute path`);
  }
  const resolved = resolve(path);
  const metadata = lstatSync(resolved);
  if (!metadata.isDirectory()) {
    throw new Error(`Alibaba browser snapshot ${name} is not a safe directory`);
  }
  return resolved;
}

function setupFields() {
  return [
    {
      name: "snapshot_root",
      label: "Sanitized snapshot root",
      type: "text" as const,
      required: true,
    },
    {
      name: "object_root",
      label: "Hash-addressed attachment object root",
      type: "text" as const,
      required: true,
    },
    {
      name: "account_id",
      label: "Stable MoonSleep Alibaba account id",
      type: "text" as const,
      required: true,
    },
    {
      name: "account_label",
      label: "Account label",
      type: "text" as const,
      required: true,
    },
    {
      name: "confirm_read_only_capture",
      label: "Confirm sanitized read-only capture",
      type: "select" as const,
      required: true,
      options: [{ label: "Attach capture", value: SETUP_CONFIRMATION }],
    },
  ];
}

function setupConfig(payloadValue: unknown): {
  config: AlibabaRuntimeConfig;
  snapshot: SnapshotRef;
} {
  const payload = asRecord(payloadValue);
  const allowed = new Set([
    "snapshot_root",
    "object_root",
    "account_id",
    "account_label",
    "confirm_read_only_capture",
  ]);
  const unexpected = Object.keys(payload).filter((name) => !allowed.has(name));
  if (unexpected.length > 0) {
    throw new Error(`Alibaba browser snapshot setup contains unexpected fields: ${unexpected.join(",")}`);
  }
  if (payload.confirm_read_only_capture !== SETUP_CONFIRMATION) {
    throw new Error("Alibaba browser snapshot setup confirmation is invalid");
  }
  const accountId = requireSetupText(payload, "account_id", { maxLength: 128 }).toLowerCase();
  if (!CONNECTION_ID.test(accountId)) {
    throw new Error("Alibaba browser snapshot account_id is invalid");
  }
  const config: AlibabaRuntimeConfig = {
    snapshot_root: requireSafeSetupDirectory(
      requireSetupText(payload, "snapshot_root"),
      "snapshot_root",
    ),
    object_root: requireSafeSetupDirectory(
      requireSetupText(payload, "object_root"),
      "object_root",
    ),
    account_id: accountId,
    account_label: requireSetupText(payload, "account_label", { maxLength: 200 }),
    poll_interval_ms: DEFAULT_POLL_INTERVAL_MS,
    monitor_overlap_ms: DEFAULT_MONITOR_OVERLAP_MS,
    attachment_text_limit: DEFAULT_ATTACHMENT_TEXT_LIMIT,
  };
  const snapshot = loadSnapshot(latestSnapshot(config.snapshot_root)).ref;
  return { config, snapshot };
}

function readRuntimeConfig(ctx: RuntimeContextLike): AlibabaRuntimeConfig {
  const config = asRecord(ctx.runtime?.config);
  const snapshotRoot = textValue(config.snapshot_root);
  if (!snapshotRoot) throw new Error("runtime.config.snapshot_root is required");
  return {
    snapshot_root: resolve(snapshotRoot),
    ...(textValue(config.object_root) ? { object_root: resolve(String(config.object_root)) } : {}),
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

function sameIdentity(
  left: Stats,
  right: Stats,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function readBoundFile(path: string, maxBytes: number): Buffer {
  const before = lstatSync(path);
  if (!before.isFile() || before.nlink !== 1 || before.size < 0 || before.size > maxBytes) {
    throw new Error(`Alibaba evidence file metadata is unsafe: ${basename(path)}`);
  }
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || !sameIdentity(before, opened)) {
      throw new Error(`Alibaba evidence file identity changed before read: ${basename(path)}`);
    }
    const bytes = readFileSync(fd);
    const afterFd = fstatSync(fd);
    const afterPath = lstatSync(path);
    if (
      bytes.length !== opened.size ||
      !sameIdentity(opened, afterFd) ||
      !sameIdentity(opened, afterPath) ||
      afterFd.size !== opened.size ||
      afterPath.size !== opened.size
    ) {
      throw new Error(`Alibaba evidence file identity changed during read: ${basename(path)}`);
    }
    return bytes;
  } finally {
    closeSync(fd);
  }
}

function readJson(path: string, maxBytes: number): UnknownRecord {
  return JSON.parse(readBoundFile(path, maxBytes).toString("utf8")) as UnknownRecord;
}

function parseJsonl<T>(bytes: Buffer): T[] {
  return bytes
    .toString("utf8")
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function parseMessageJsonl(bytes: Buffer): AlibabaMessage[] {
  return bytes
    .toString("utf8")
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => ({
      ...(JSON.parse(line) as Omit<AlibabaMessage, "provider_object_json" | "provider_object_sha256">),
      provider_object_json: line,
      provider_object_sha256: sha256Bytes(Buffer.from(line, "utf8")),
    }));
}

function parseAttachmentJsonl(bytes: Buffer): AlibabaAttachment[] {
  return bytes
    .toString("utf8")
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => ({
      ...(JSON.parse(line) as Omit<
        AlibabaAttachment,
        "provider_object_json" | "provider_object_sha256"
      >),
      provider_object_json: line,
      provider_object_sha256: sha256Bytes(Buffer.from(line, "utf8")),
    }));
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
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
    const rootCompletePath = join(path, "complete.json");
    const adapterCompletePath = join(path, "adapter", "complete.json");
    const messagesPath = join(path, "adapter", "messages.jsonl");
    const projectionPaths = [
      messagesPath,
      join(path, "adapter", "conversations.jsonl"),
      join(path, "adapter", "attachments.jsonl"),
      join(path, "adapter", "attachment-text.jsonl"),
    ];
    if (
      !existsSync(summaryPath) ||
      !existsSync(rootCompletePath) ||
      !existsSync(adapterCompletePath) ||
      projectionPaths.some((projectionPath) => !existsSync(projectionPath))
    ) continue;
    const rootCompleteBytes = readBoundFile(rootCompletePath, MAX_COMPLETE_BYTES);
    const adapterCompleteBytes = readBoundFile(adapterCompletePath, MAX_COMPLETE_BYTES);
    if (!rootCompleteBytes.equals(adapterCompleteBytes)) {
      throw new Error(`Alibaba snapshot completion receipts disagree: ${entry.name}`);
    }
    const complete = JSON.parse(rootCompleteBytes.toString("utf8")) as SnapshotComplete;
    validateCompleteReceipt(complete, entry.name);
    const summary = readJson(summaryPath, MAX_SUMMARY_BYTES) as SnapshotSummary;
    const capturedAt =
      parseTimestamp(complete.captureGeneratedAt) ||
      parseTimestamp(summary.exportGeneratedAt) ||
      parseTimestamp(summary.generatedAt);
    if (!capturedAt) throw new Error(`Alibaba snapshot has no sealed capture timestamp: ${entry.name}`);
    snapshots.push({
      id: entry.name,
      path,
      summary,
      complete,
      complete_sha256: sha256Bytes(rootCompleteBytes),
      captured_at: capturedAt,
    });
  }
  return snapshots.sort(
    (left, right) =>
      left.captured_at - right.captured_at || left.id.localeCompare(right.id),
  );
}

function validateCompleteReceipt(complete: SnapshotComplete, snapshotId: string): void {
  if (complete.schemaVersion !== 1) {
    throw new Error(`Alibaba snapshot receipt version is unsupported: ${snapshotId}`);
  }
  for (const [field, value] of Object.entries({
    messageCount: complete.messageCount,
    conversationCount: complete.conversationCount,
    attachmentCount: complete.attachmentCount,
    attachmentTextCount: complete.attachmentTextCount,
  })) {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
      throw new Error(`Alibaba snapshot receipt ${field} is invalid: ${snapshotId}`);
    }
  }
  const projection = complete.adapterProjection;
  if (
    !projection ||
    !SHA256.test(String(projection.messagesSha256 ?? "")) ||
    !SHA256.test(String(projection.conversationsSha256 ?? "")) ||
    !SHA256.test(String(projection.attachmentsSha256 ?? "")) ||
    !SHA256.test(String(projection.attachmentTextSha256 ?? ""))
  ) {
    throw new Error(`Alibaba snapshot projection digests are invalid: ${snapshotId}`);
  }
  if (
    complete.authority?.capture !== "immutable_evidence" ||
    complete.authority?.projection !== "sanitized_read_only" ||
    complete.authority?.remoteMutation !== false ||
    complete.authority?.businessMutation !== false
  ) {
    throw new Error(`Alibaba snapshot authority receipt is unsafe: ${snapshotId}`);
  }
}

function latestSnapshot(snapshotRoot: string): SnapshotRef {
  const snapshots = listSnapshots(snapshotRoot);
  const latest = snapshots.at(-1);
  if (!latest) throw new Error(`No complete Alibaba snapshots found in ${snapshotRoot}`);
  return latest;
}

function loadSnapshot(ref: SnapshotRef): LoadedSnapshot {
  const adapterDir = join(ref.path, "adapter");
  const conversationPath = join(adapterDir, "conversations.jsonl");
  const messagePath = join(adapterDir, "messages.jsonl");
  const attachmentPath = join(adapterDir, "attachments.jsonl");
  const attachmentTextPath = join(adapterDir, "attachment-text.jsonl");
  const projection = ref.complete.adapterProjection!;
  const messageBytes = readBoundFile(messagePath, MAX_MESSAGES_BYTES);
  const conversationBytes = readBoundFile(conversationPath, MAX_CONVERSATIONS_BYTES);
  const attachmentBytes = readBoundFile(attachmentPath, MAX_ATTACHMENTS_BYTES);
  const attachmentTextBytes = readBoundFile(
    attachmentTextPath,
    MAX_ATTACHMENT_TEXT_INDEX_BYTES,
  );
  for (const [path, bytes, expected] of [
    [messagePath, messageBytes, projection.messagesSha256],
    [conversationPath, conversationBytes, projection.conversationsSha256],
    [attachmentPath, attachmentBytes, projection.attachmentsSha256],
    [attachmentTextPath, attachmentTextBytes, projection.attachmentTextSha256],
  ] as const) {
    if (sha256Bytes(bytes) !== expected) {
      throw new Error(`Alibaba snapshot projection digest mismatch: ${basename(path)}`);
    }
  }
  const conversations = new Map(
    parseJsonl<AlibabaConversation>(conversationBytes)
      .filter((row) => textValue(row.cid))
      .map((row) => [row.cid, row]),
  );
  const messages = parseMessageJsonl(messageBytes)
    .filter((row) => textValue(row.messageId) && textValue(row.cid))
    .sort((left, right) => messageTimestamp(left) - messageTimestamp(right));
  const attachmentsByMessage = new Map<string, AlibabaAttachment[]>();
  const attachments = parseAttachmentJsonl(attachmentBytes);
  const messageIds = new Set(messages.map((message) => message.messageId));
  const orphanAttachments: AlibabaAttachment[] = [];
  for (const attachment of attachments) {
    const messageId = textValue(attachment.messageId);
    if (!messageId || !messageIds.has(messageId)) {
      orphanAttachments.push(attachment);
      continue;
    }
    const rows = attachmentsByMessage.get(messageId) ?? [];
    rows.push(attachment);
    attachmentsByMessage.set(messageId, rows);
  }
  const attachmentTextRows = parseJsonl<AttachmentText>(attachmentTextBytes);
  const textByFile = new Map(
    attachmentTextRows
      .filter((row) => textValue(row.fileName))
      .map((row) => [String(row.fileName), row]),
  );
  if (
    conversations.size !== ref.complete.conversationCount ||
    messages.length !== ref.complete.messageCount ||
    attachments.length !== ref.complete.attachmentCount ||
    attachmentTextRows.filter((row) => row.status === "extracted").length !==
      ref.complete.attachmentTextCount
  ) {
    throw new Error(`Alibaba snapshot receipt counts do not match projection: ${ref.id}`);
  }
  return { ref, conversations, messages, attachmentsByMessage, orphanAttachments, textByFile };
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
  const allowedRoots = [snapshot.path, config.object_root]
    .filter((candidate): candidate is string => Boolean(candidate))
    .map((candidate) => resolve(candidate));
  const candidates = isAbsolute(pathValue)
    ? [resolve(pathValue)]
    : [resolve(snapshot.path, pathValue), ...(config.object_root ? [resolve(config.object_root, pathValue)] : [])];
  for (const candidate of candidates) {
    if (!allowedRoots.some((root) => pathWithin(root, candidate))) continue;
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function pathWithin(root: string, candidate: string): boolean {
  const value = relative(root, candidate);
  return value === "" || (!value.startsWith("..") && !isAbsolute(value));
}

function sha256File(path: string | undefined, maxBytes: number): string | undefined {
  if (!path || !existsSync(path)) return undefined;
  return sha256Bytes(readBoundFile(path, maxBytes));
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
  const portableName = basename(textValue(row.textPath) ?? `${basename(fileName)}.txt`);
  const textPath =
    resolveEvidencePath(row.textPath, config, snapshot.ref) ??
    resolveSnapshotEvidencePath(snapshot.ref, ["local-index", "attachment-text", portableName]) ??
    resolveSnapshotEvidencePath(snapshot.ref, ["attachment-text", portableName]);
  if (!textPath || !existsSync(textPath)) return "";
  return readBoundFile(textPath, MAX_ATTACHMENT_TEXT_BYTES).toString("utf8").trim();
}

function resolveSnapshotEvidencePath(
  snapshot: SnapshotRef,
  pathParts: string[],
): string | undefined {
  const root = resolve(snapshot.path);
  const candidate = resolve(root, ...pathParts);
  if (!pathWithin(root, candidate) || !existsSync(candidate)) return undefined;
  return candidate;
}

function resolveAttachmentPath(
  attachment: AlibabaAttachment,
  config: AlibabaRuntimeConfig,
  snapshot: SnapshotRef,
): string | undefined {
  for (const sourcePath of [attachment.objectPath, attachment.localPath]) {
    const resolved = resolveEvidencePath(sourcePath, config, snapshot);
    if (resolved) return resolved;
  }

  const sealedContentHash = textValue(attachment.contentHash);
  if (sealedContentHash && SHA256.test(sealedContentHash) && config.object_root) {
    const objectRoot = resolve(config.object_root);
    const candidate = resolve(
      objectRoot,
      "sha256",
      sealedContentHash.slice(0, 2),
      sealedContentHash,
    );
    if (pathWithin(objectRoot, candidate) && existsSync(candidate)) return candidate;
  }

  const fileName = textValue(attachment.fileName);
  if (!fileName) return undefined;
  return (
    resolveSnapshotEvidencePath(snapshot, ["attachments", basename(fileName)]) ??
    resolveSnapshotEvidencePath(snapshot, ["evidence", basename(fileName)])
  );
}

function normalizeAttachment(
  attachment: AlibabaAttachment,
  index: number,
  snapshot: LoadedSnapshot,
  config: AlibabaRuntimeConfig,
) {
  const localPath = resolveAttachmentPath(attachment, config, snapshot.ref);
  const fileName = textValue(attachment.fileName) ?? `attachment-${index + 1}`;
  const contentHash = sha256File(localPath, MAX_ATTACHMENT_EVIDENCE_BYTES);
  const sealedContentHash = textValue(attachment.contentHash);
  if (sealedContentHash && (!SHA256.test(sealedContentHash) || sealedContentHash !== contentHash)) {
    throw new Error(`Alibaba attachment digest mismatch: ${fileName}`);
  }
  return {
    id: `alibaba:${textValue(attachment.messageId) ?? "unlinked"}:${index + 1}`,
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
      snapshot_receipt_sha256: snapshot.ref.complete_sha256,
      provider_object_sha256: attachment.provider_object_sha256,
    },
  };
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

  const normalizedAttachments = attachments.map((attachment, index) =>
    normalizeAttachment(attachment, index, snapshot, config)
  );

  const content = buildContent(message, attachments, snapshot, config);
  const revisionHash = sha256Bytes(Buffer.from(stableJson({
    provider_object_sha256: message.provider_object_sha256,
    content,
    attachments: normalizedAttachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      size: attachment.size ?? null,
      content_hash: attachment.content_hash ?? null,
      evidence_status: attachment.metadata.evidence_status,
    })),
  }), "utf8"));
  const logicalMessageId = `message:${message.messageId}`;

  return {
    operation: "record.ingest",
    routing: {
      adapter: PLATFORM,
      platform: PLATFORM,
      connection_id: connectionId,
      sender_id: incoming ? supplierId : config.account_id,
      sender_name: incoming ? textValue(message.speaker) ?? supplierName : config.account_label,
      // Nex reserves the canonical receiver for the configured adapter account so
      // inbound integrity can bind every emitted record to this exact connection.
      // For outbound provider messages the supplier remains the actual recipient
      // in payload.recipients; this matches the Gmail adapter's mailbox/recipient
      // split and preserves the supplier identity without impersonating another
      // adapter connection.
      receiver_id: connectionId,
      receiver_name: config.account_label,
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
      external_record_id: `alibaba:${safeIdToken(connectionId)}:message:${safeIdToken(message.messageId)}:${revisionHash}`,
      timestamp,
      content,
      content_type: "text",
      ...(!incoming ? { recipients: [supplierId] } : {}),
      payload: {
        provider_object_json: message.provider_object_json,
        provider_object_sha256: message.provider_object_sha256,
        source_snapshot_id: snapshot.ref.id,
        source_snapshot_receipt_sha256: snapshot.ref.complete_sha256,
        source_projection_messages_sha256: snapshot.ref.complete.adapterProjection!.messagesSha256!,
        source_attachments: attachments.map((attachment) => ({
          provider_object_json: attachment.provider_object_json,
          provider_object_sha256: attachment.provider_object_sha256,
        })),
        source_message_id: message.messageId,
        source_conversation_id: message.cid,
      },
      ...(normalizedAttachments.length > 0 ? { attachments: normalizedAttachments } : {}),
      metadata: {
        source_system: "alibaba_messenger",
        source_connection_id: connectionId,
        family: "message",
        logical_record_id: logicalMessageId,
        revision_hash: revisionHash,
        message_id: message.messageId,
        conversation_id: message.cid,
        message_type: textValue(message.msgType) ?? null,
        direction: incoming ? "incoming" : "outgoing",
        snapshot_id: snapshot.ref.id,
        snapshot_receipt_sha256: snapshot.ref.complete_sha256,
        snapshot_captured_at: snapshot.ref.captured_at,
        evidence_boundary: "sanitized_normalized_export",
      },
    },
  };
}

function buildOrphanAttachmentRecord(
  attachment: AlibabaAttachment,
  snapshot: LoadedSnapshot,
  config: AlibabaRuntimeConfig,
  connectionId: string,
): AdapterInboundRecord {
  const conversationId = textValue(attachment.cid) ?? "unresolved-conversation";
  const conversation = snapshot.conversations.get(conversationId);
  const supplierName =
    textValue(conversation?.name) ??
    textValue(conversation?.companyName) ??
    "Alibaba supplier";
  const normalized = normalizeAttachment(attachment, 0, snapshot, config);
  const extracted = readAttachmentText(attachment, snapshot, config);
  const fileName = normalized.filename;
  const body = textValue(attachment.messageText);
  const content = [
    `[Unlinked Alibaba attachment evidence: ${fileName}]`,
    ...(body ? [body] : []),
    ...(extracted ? [extracted] : []),
  ].join("\n\n");
  const timestamp = parseTimestamp(attachment.sentAt) || snapshot.ref.captured_at;
  const revisionHash = sha256Bytes(Buffer.from(stableJson({
    provider_object_sha256: attachment.provider_object_sha256,
    content_hash: normalized.content_hash ?? null,
    content,
  }), "utf8"));
  const sourceIdentity = textValue(attachment.messageId) ?? attachment.provider_object_sha256;

  return {
    operation: "record.ingest",
    routing: {
      adapter: PLATFORM,
      platform: PLATFORM,
      connection_id: connectionId,
      sender_id: `${config.account_id}:evidence-capture`,
      sender_name: `${config.account_label} evidence capture`,
      receiver_id: config.account_id,
      receiver_name: config.account_label,
      space_id: config.account_id,
      space_name: config.account_label,
      container_kind: "direct",
      container_id: conversationId,
      container_name: supplierName,
      thread_id: conversationId,
      thread_name: supplierName,
      metadata: {
        source_system: "alibaba_messenger",
        source_attribution: "unresolved_attachment_evidence",
        supplier_ali_id: textValue(conversation?.aliId) ?? null,
        supplier_account_id: textValue(conversation?.accountId) ?? null,
      },
    },
    payload: {
      external_record_id: `alibaba:${safeIdToken(connectionId)}:attachment-orphan:${safeIdToken(sourceIdentity)}:${revisionHash}`,
      timestamp,
      content,
      content_type: "text",
      payload: {
        provider_attachment_json: attachment.provider_object_json,
        provider_attachment_sha256: attachment.provider_object_sha256,
        source_snapshot_id: snapshot.ref.id,
        source_snapshot_receipt_sha256: snapshot.ref.complete_sha256,
        source_projection_attachments_sha256: snapshot.ref.complete.adapterProjection!.attachmentsSha256!,
        source_message_id: textValue(attachment.messageId) ?? null,
        source_conversation_id: textValue(attachment.cid) ?? null,
        source_coverage_disposition: "orphan_attachment_evidence",
      },
      attachments: [normalized],
      metadata: {
        source_system: "alibaba_messenger",
        source_connection_id: connectionId,
        family: "orphan_attachment",
        logical_record_id: `orphan-attachment:${attachment.provider_object_sha256}`,
        revision_hash: revisionHash,
        snapshot_id: snapshot.ref.id,
        snapshot_receipt_sha256: snapshot.ref.complete_sha256,
        snapshot_captured_at: snapshot.ref.captured_at,
        evidence_boundary: "sanitized_normalized_export",
        source_attribution: "unresolved_attachment_evidence",
        timestamp_basis: parseTimestamp(attachment.sentAt) ? "provider_attachment_sent_at" : "snapshot_capture_time",
      },
    },
  };
}

function safeIdToken(value: string): string {
  const trimmed = value.trim();
  if (/^[A-Za-z0-9._-]{1,160}$/.test(trimmed)) return trimmed;
  return sha256Bytes(Buffer.from(trimmed, "utf8"));
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new Error("Alibaba revision input contains an unsafe number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`)
      .join(",")}}`;
  }
  throw new Error("Alibaba revision input is not JSON-safe");
}

function recordsForWindow(
  snapshot: LoadedSnapshot,
  config: AlibabaRuntimeConfig,
  connectionId: string,
  sinceMs: number,
  toMs?: number,
): AdapterInboundRecord[] {
  const messageRecords = snapshot.messages
    .filter((message) => messageTimestamp(message) >= sinceMs)
    .filter((message) => toMs === undefined || messageTimestamp(message) <= toMs)
    .map((message) => buildRecord(message, snapshot, config, connectionId));
  const orphanRecords = snapshot.orphanAttachments
    .filter((attachment) => {
      const timestamp = parseTimestamp(attachment.sentAt) || snapshot.ref.captured_at;
      return timestamp >= sinceMs && (toMs === undefined || timestamp <= toMs);
    })
    .map((attachment) =>
      buildOrphanAttachmentRecord(attachment, snapshot, config, connectionId)
    );
  return [...messageRecords, ...orphanRecords].sort(
    (left, right) => left.payload.timestamp - right.payload.timestamp
      || left.payload.external_record_id.localeCompare(right.payload.external_record_id),
  );
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
      latest_snapshot_receipt_sha256: latest.complete_sha256,
      latest_snapshot_captured_at: latest.captured_at,
      message_count: latest.complete.messageCount ?? null,
      attachment_hint_count: latest.complete.attachmentCount ?? null,
      export_error_count: latest.summary.errorCount ?? null,
      remote_mutation_enabled: false,
    },
  };
}

async function backfill(
  ctx: RuntimeContextLike,
  args: Omit<AdapterBackfillWindow, "connection_id">,
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
  version: "0.2.4",
  multi_account: true,
  auth: {
    methods: [
      {
        id: "alibaba_browser_snapshot",
        type: "custom_flow",
        label: "Attach sanitized Alibaba browser capture",
        icon: "browser",
        service: "alibaba",
      },
    ],
    setupGuide:
      "Stage a sanitized, hash-bound Alibaba Messenger browser capture outside Nex, then register its read-only snapshot root on the connection. This adapter never receives Alibaba login credentials.",
  },
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
  setup: {
    start: async (_ctx, req) => ({
      status: "requires_input",
      ...(req.session_id ? { session_id: req.session_id } : {}),
      ...(req.connection_id ? { connection_id: req.connection_id } : {}),
      service: "alibaba",
      message: "Attach a completed sanitized Alibaba browser capture.",
      instructions:
        "Provide only root-owned sanitized capture paths and the explicit read-only confirmation. No Alibaba login credential belongs in this flow.",
      fields: setupFields(),
    }),
    submit: async (_ctx, req) => {
      const { config, snapshot } = setupConfig(req.payload);
      return {
        status: "completed",
        ...(req.session_id ? { session_id: req.session_id } : {}),
        connection_id: config.account_id,
        service: "alibaba",
        account: config.account_id,
        account_contact: {
          platform: PLATFORM,
          space_id: config.account_id,
          contact_id: config.account_id,
        },
        message: "Sanitized Alibaba browser capture attached read-only.",
        metadata: {
          adapter_config: config,
          capture: {
            snapshot_id: snapshot.id,
            complete_sha256: snapshot.complete_sha256,
            captured_at: snapshot.captured_at,
          },
          provider_credentials_received: false,
          provider_write_authority: false,
        },
      };
    },
  },
  ingest: {
    backfill,
    monitor,
  },
});

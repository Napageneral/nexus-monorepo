import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AdapterInboundRecordSchema } from "@nexus-project/adapter-sdk-ts";
import { __test__ } from "./adapter.ts";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

function writeJsonl(path: string, values: unknown[]): void {
  writeFileSync(path, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`);
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeCompletionReceipt(snapshotPath: string): void {
  const adapterDir = join(snapshotPath, "adapter");
  const messages = join(adapterDir, "messages.jsonl");
  const conversations = join(adapterDir, "conversations.jsonl");
  const attachments = join(adapterDir, "attachments.jsonl");
  const attachmentText = join(adapterDir, "attachment-text.jsonl");
  const receipt = {
    schemaVersion: 1,
    sealedAt: "2026-07-17T16:01:00.000Z",
    captureGeneratedAt: "2026-07-17T16:00:00.000Z",
    messageCount: 2,
    conversationCount: 1,
    attachmentCount: 2,
    attachmentTextCount: 2,
    adapterProjection: {
      messagesSha256: sha256(messages),
      conversationsSha256: sha256(conversations),
      attachmentsSha256: sha256(attachments),
      attachmentTextSha256: sha256(attachmentText),
    },
    authority: {
      capture: "immutable_evidence",
      projection: "sanitized_read_only",
      interpretation: "not_authorized_by_capture",
      remoteMutation: false,
      businessMutation: false,
    },
  };
  writeJson(join(adapterDir, "complete.json"), receipt);
  writeJson(join(snapshotPath, "complete.json"), receipt);
}

function fixture(): { root: string; snapshotPath: string; attachmentPath: string } {
  const root = mkdtempSync(join(tmpdir(), "nexus-alibaba-adapter-"));
  const snapshotPath = join(root, "snapshot-2026-07-17");
  const adapterDir = join(snapshotPath, "adapter");
  const attachmentDir = join(snapshotPath, "evidence");
  const attachmentTextDir = join(snapshotPath, "attachment-text");
  mkdirSync(adapterDir, { recursive: true });
  mkdirSync(attachmentDir, { recursive: true });
  mkdirSync(attachmentTextDir, { recursive: true });
  const attachmentPath = join(attachmentDir, "shipping-schedule.pdf");
  const attachmentTextPath = join(attachmentTextDir, "shipping-schedule.pdf.txt");
  const orphanAttachmentPath = join(attachmentDir, "orphan-sample.png");
  const orphanAttachmentTextPath = join(attachmentTextDir, "orphan-sample.png.txt");
  writeFileSync(attachmentPath, "immutable pdf bytes");
  writeFileSync(attachmentTextPath, "Vessel booking and ETA are still pending.");
  writeFileSync(orphanAttachmentPath, "immutable image bytes");
  writeFileSync(orphanAttachmentTextPath, "Unlinked sample evidence.");
  writeJson(join(snapshotPath, "summary.json"), {
    generatedAt: "2026-07-17T16:00:00.000Z",
    messageCount: 2,
    attachmentHintCount: 1,
    errorCount: 0,
  });
  writeJsonl(join(adapterDir, "conversations.jsonl"), [
    {
      cid: "surewal-thread",
      name: "Rebecca Liu",
      companyName: "Surewal",
      accountId: "supplier-account",
      aliId: "supplier-ali",
    },
  ]);
  writeJsonl(join(adapterDir, "messages.jsonl"), [
    {
      messageId: "m-1",
      cid: "surewal-thread",
      sendTime: 1784300000000,
      sentAt: "2026-07-17T14:53:20.000Z",
      speaker: "Rebecca Liu",
      direction: "incoming",
      text: "Here is the latest shipping schedule.",
    },
    {
      messageId: "m-2",
      cid: "surewal-thread",
      sendTime: 1784300300000,
      sentAt: "2026-07-17T14:58:20.000Z",
      speaker: "MoonSleep",
      direction: "outgoing",
      text: "Thank you.",
    },
  ]);
  writeJsonl(join(snapshotPath, "messages.jsonl"), [
    { raw: { chatToken: "must-not-leak", encryptedAccount: "must-not-leak" } },
  ]);
  writeJsonl(join(adapterDir, "attachments.jsonl"), [
    {
      fileName: "shipping-schedule.pdf",
      category: "document",
      bytes: 19,
      contentType: "application/pdf",
      contentHash: sha256(attachmentPath),
      messageId: "m-1",
      cid: "surewal-thread",
      localPath: attachmentPath,
      status: "downloaded",
    },
    {
      fileName: "orphan-sample.png",
      category: "image",
      bytes: 21,
      contentType: "image/png",
      contentHash: sha256(orphanAttachmentPath),
      messageId: "provider-message-not-in-export",
      cid: "surewal-thread",
      sentAt: "2026-07-17T15:00:00.000Z",
      speaker: "Rebecca Liu",
      messageText: "Here is the updated sample.",
      localPath: orphanAttachmentPath,
      status: "downloaded",
    },
  ]);
  writeJsonl(join(adapterDir, "attachment-text.jsonl"), [
    {
      fileName: "shipping-schedule.pdf",
      status: "extracted",
      extractor: "pdftotext",
      textPath: attachmentTextPath,
      textLength: 41,
    },
    {
      fileName: "orphan-sample.png",
      status: "extracted",
      extractor: "ocr",
      textPath: orphanAttachmentTextPath,
      textLength: 25,
    },
  ]);
  writeCompletionReceipt(snapshotPath);
  return { root, snapshotPath, attachmentPath };
}

function config(root: string, objectRoot?: string) {
  return {
    snapshot_root: root,
    ...(objectRoot ? { object_root: objectRoot } : {}),
    account_label: "MoonSleep Alibaba",
    account_id: "moonsleep-alibaba",
    poll_interval_ms: 1000,
    monitor_overlap_ms: 1000,
    attachment_text_limit: 30000,
  };
}

test("relocated snapshots resolve attachments by sealed object digest", () => {
  const { root, snapshotPath, attachmentPath } = fixture();
  const objectRoot = mkdtempSync(join(tmpdir(), "nexus-alibaba-objects-"));
  const contentHash = sha256(attachmentPath);
  const objectPath = join(objectRoot, "sha256", contentHash.slice(0, 2), contentHash);
  mkdirSync(join(objectRoot, "sha256", contentHash.slice(0, 2)), { recursive: true });
  writeFileSync(objectPath, readFileSync(attachmentPath));

  const attachmentsPath = join(snapshotPath, "adapter", "attachments.jsonl");
  const attachments = readFileSync(attachmentsPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  attachments[0]!.objectPath = "/retired-capture-root/objects/original";
  attachments[0]!.localPath = "/retired-capture-root/attachments/original";
  writeJsonl(attachmentsPath, attachments);

  const attachmentTextPath = join(snapshotPath, "adapter", "attachment-text.jsonl");
  const attachmentText = readFileSync(attachmentTextPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  attachmentText[0]!.textPath =
    "/retired-capture-root/local-index/attachment-text/shipping-schedule.pdf.txt";
  const relocatedTextDir = join(snapshotPath, "local-index", "attachment-text");
  mkdirSync(relocatedTextDir, { recursive: true });
  writeFileSync(
    join(relocatedTextDir, "shipping-schedule.pdf.txt"),
    "Vessel booking and ETA are still pending.",
  );
  writeJsonl(attachmentTextPath, attachmentText);
  writeCompletionReceipt(snapshotPath);

  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const record = __test__.buildRecord(
    snapshot.messages[0]!,
    snapshot,
    config(root, objectRoot),
    "conn-alibaba",
  );
  assert.equal(record.payload.attachments?.[0]?.local_path, objectPath);
  assert.equal(record.payload.attachments?.[0]?.content_hash, contentHash);
  assert.match(record.payload.content, /Vessel booking and ETA/);
});

test("latestSnapshot selects only a complete hash-bound sanitized snapshot", () => {
  const { root, snapshotPath } = fixture();
  mkdirSync(join(root, "partial-newer"), { recursive: true });
  writeJson(join(root, "partial-newer", "summary.json"), {
    generatedAt: "2026-07-18T00:00:00.000Z",
  });
  const latest = __test__.latestSnapshot(root);
  assert.equal(latest.path, snapshotPath);
  assert.match(latest.complete_sha256, /^[a-f0-9]{64}$/);
});

test("record preserves exact sanitized source JSON and excludes raw credentials", () => {
  const { root, attachmentPath } = fixture();
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const sourceLine = readFileSync(join(snapshot.ref.path, "adapter", "messages.jsonl"), "utf8")
    .split("\n")[0]!;
  const record = __test__.buildRecord(
    snapshot.messages[0]!,
    snapshot,
    config(root),
    "conn-alibaba",
  );
  assert.match(record.payload.external_record_id, /^alibaba:conn-alibaba:message:m-1:[a-f0-9]{64}$/);
  assert.equal(record.routing.container_id, "surewal-thread");
  assert.equal(record.routing.receiver_id, "conn-alibaba");
  assert.equal(record.payload.recipients, undefined);
  assert.equal(record.payload.metadata?.source_connection_id, "conn-alibaba");
  assert.match(record.payload.content, /Vessel booking and ETA/);
  assert.equal(record.payload.attachments?.[0]?.local_path, attachmentPath);
  assert.match(record.payload.attachments?.[0]?.content_hash ?? "", /^[a-f0-9]{64}$/);
  assert.equal(record.payload.payload?.provider_object_json, sourceLine);
  assert.equal(
    record.payload.payload?.provider_object_sha256,
    createHash("sha256").update(sourceLine).digest("hex"),
  );
  const sourceAttachments = record.payload.payload?.source_attachments as Array<{
    provider_object_json: string;
    provider_object_sha256: string;
  }>;
  assert.equal(sourceAttachments.length, 1);
  assert.equal(
    createHash("sha256").update(sourceAttachments[0]!.provider_object_json).digest("hex"),
    sourceAttachments[0]!.provider_object_sha256,
  );
  assert.equal(AdapterInboundRecordSchema.parse(record).payload.payload?.provider_object_json, sourceLine);
  assert.doesNotMatch(JSON.stringify(record), /must-not-leak|chatToken|encryptedAccount/);
  assert.doesNotMatch(JSON.stringify(record), /clouddisk\.alibaba\.com/);
});

test("bounded projection keeps temporal window, directionality, and replay identity", () => {
  const { root } = fixture();
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const rows = __test__.recordsForWindow(snapshot, config(root), "conn-alibaba", 1784300200000);
  const replay = __test__.recordsForWindow(snapshot, config(root), "conn-alibaba", 1784300200000);
  assert.equal(rows.length, 2);
  const message = rows.find((row) => row.payload.metadata?.family === "message");
  const orphan = rows.find((row) => row.payload.metadata?.family === "orphan_attachment");
  assert.equal(message?.routing.sender_id, "moonsleep-alibaba");
  assert.equal(message?.routing.receiver_id, "conn-alibaba");
  assert.deepEqual(message?.payload.recipients, ["supplier-ali"]);
  assert.equal(orphan?.payload.payload?.source_coverage_disposition, "orphan_attachment_evidence");
  assert.deepEqual(
    replay.map((row) => row.payload.external_record_id),
    rows.map((row) => row.payload.external_record_id),
  );
  assert.deepEqual(replay.map((row) => row.payload.payload), rows.map((row) => row.payload.payload));
});

test("provider attachment rows without a captured parent message remain explicit evidence", () => {
  const { root } = fixture();
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  assert.equal(snapshot.orphanAttachments.length, 1);
  const rows = __test__.recordsForWindow(snapshot, config(root), "conn-alibaba", 0);
  const orphan = rows.find((row) => row.payload.metadata?.family === "orphan_attachment");
  assert.ok(orphan);
  assert.match(orphan.payload.external_record_id, /^alibaba:conn-alibaba:attachment-orphan:/);
  assert.match(orphan.payload.content, /Unlinked sample evidence/);
  assert.equal(orphan.routing.metadata?.source_attribution, "unresolved_attachment_evidence");
  assert.equal(orphan.payload.metadata?.source_connection_id, "conn-alibaba");
  const exact = String(orphan.payload.payload?.provider_attachment_json ?? "");
  assert.equal(
    createHash("sha256").update(exact).digest("hex"),
    orphan.payload.payload?.provider_attachment_sha256,
  );
});

test("tampered projection bytes fail before any record is emitted", () => {
  const { root, snapshotPath } = fixture();
  writeFileSync(join(snapshotPath, "adapter", "messages.jsonl"), "{}\n");
  assert.throws(
    () => __test__.loadSnapshot(__test__.latestSnapshot(root)),
    /projection digest mismatch/,
  );
});

test("symlinked governed snapshot files fail closed", () => {
  const { root, snapshotPath } = fixture();
  const summaryPath = join(snapshotPath, "summary.json");
  const replacementPath = join(snapshotPath, "summary-replacement.json");
  writeJson(replacementPath, { generatedAt: "2026-07-17T16:00:00.000Z" });
  unlinkSync(summaryPath);
  symlinkSync(replacementPath, summaryPath);
  assert.throws(() => __test__.latestSnapshot(root), /metadata is unsafe/);
});

test("attachment paths outside the sealed snapshot boundary are not read", () => {
  const { root } = fixture();
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  snapshot.attachmentsByMessage.set("m-1", [{
    fileName: "outside.pdf",
    contentHash: "b".repeat(64),
    messageId: "m-1",
    cid: "surewal-thread",
    localPath: "/etc/hosts",
    status: "downloaded",
    provider_object_json: "{}",
    provider_object_sha256: createHash("sha256").update("{}").digest("hex"),
  }]);
  assert.throws(
    () => __test__.buildRecord(snapshot.messages[0]!, snapshot, config(root), "conn-alibaba"),
    /attachment digest mismatch/,
  );
});

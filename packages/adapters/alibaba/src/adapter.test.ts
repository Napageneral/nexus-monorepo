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
    attachmentCount: 1,
    attachmentTextCount: 1,
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
  writeFileSync(attachmentPath, "immutable pdf bytes");
  writeFileSync(attachmentTextPath, "Vessel booking and ETA are still pending.");
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
  ]);
  writeJsonl(join(adapterDir, "attachment-text.jsonl"), [
    {
      fileName: "shipping-schedule.pdf",
      status: "extracted",
      extractor: "pdftotext",
      textPath: attachmentTextPath,
      textLength: 41,
    },
  ]);
  writeCompletionReceipt(snapshotPath);
  return { root, snapshotPath, attachmentPath };
}

function config(root: string) {
  return {
    snapshot_root: root,
    account_label: "MoonSleep Alibaba",
    account_id: "moonsleep-alibaba",
    poll_interval_ms: 1000,
    monitor_overlap_ms: 1000,
    attachment_text_limit: 30000,
  };
}

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
  assert.match(record.payload.content, /Vessel booking and ETA/);
  assert.equal(record.payload.attachments?.[0]?.local_path, attachmentPath);
  assert.match(record.payload.attachments?.[0]?.content_hash ?? "", /^[a-f0-9]{64}$/);
  assert.equal(record.payload.payload?.provider_object_json, sourceLine);
  assert.equal(
    record.payload.payload?.provider_object_sha256,
    createHash("sha256").update(sourceLine).digest("hex"),
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
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.routing.sender_id, "moonsleep-alibaba");
  assert.equal(rows[0]?.routing.receiver_id, "supplier-ali");
  assert.equal(replay[0]?.payload.external_record_id, rows[0]?.payload.external_record_id);
  assert.deepEqual(replay[0]?.payload.payload, rows[0]?.payload.payload);
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
  }]);
  assert.throws(
    () => __test__.buildRecord(snapshot.messages[0]!, snapshot, config(root), "conn-alibaba"),
    /attachment digest mismatch/,
  );
});

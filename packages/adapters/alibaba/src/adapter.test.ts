import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { __test__ } from "./adapter.ts";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

function writeJsonl(path: string, values: unknown[]): void {
  writeFileSync(path, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`);
}

function fixture(): { root: string; snapshotPath: string; attachmentPath: string } {
  const root = mkdtempSync(join(tmpdir(), "nexus-alibaba-adapter-"));
  const snapshotPath = join(root, "snapshot-2026-07-17");
  const attachmentDir = join(snapshotPath, "attachments");
  const localIndex = join(snapshotPath, "local-index");
  const attachmentTextDir = join(localIndex, "attachment-text");
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
  writeJsonl(join(snapshotPath, "conversations.jsonl"), [
    {
      cid: "surewal-thread",
      name: "Rebecca Liu",
      companyName: "Surewal",
      accountId: "supplier-account",
      aliId: "supplier-ali",
      chatToken: "must-not-leak",
    },
  ]);
  writeJsonl(join(snapshotPath, "messages.jsonl"), [
    {
      messageId: "m-1",
      cid: "surewal-thread",
      sendTime: 1784300000000,
      sentAt: "2026-07-17T14:53:20.000Z",
      speaker: "Rebecca Liu",
      direction: "incoming",
      text: "Here is the latest shipping schedule.",
      raw: { chatToken: "must-not-leak", encryptedAccount: "must-not-leak" },
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
  writeJsonl(join(localIndex, "attachments.jsonl"), [
    {
      fileName: "shipping-schedule.pdf",
      category: "document",
      bytes: 19,
      contentType: "application/pdf",
      messageId: "m-1",
      cid: "surewal-thread",
      localPath: attachmentPath,
      status: "downloaded",
      source: "https://clouddisk.alibaba.com/file/downloadFile.htm",
    },
  ]);
  writeJsonl(join(localIndex, "attachment-text.jsonl"), [
    {
      fileName: "shipping-schedule.pdf",
      status: "extracted",
      extractor: "pdftotext",
      textPath: attachmentTextPath,
      textLength: 41,
    },
  ]);
  return { root, snapshotPath, attachmentPath };
}

test("latestSnapshot selects a complete snapshot and ignores partial directories", () => {
  const { root, snapshotPath } = fixture();
  mkdirSync(join(root, "partial-newer"), { recursive: true });
  writeJson(join(root, "partial-newer", "summary.json"), {
    generatedAt: "2026-07-18T00:00:00.000Z",
  });
  assert.equal(__test__.latestSnapshot(root).path, snapshotPath);
});

test("record normalization includes searchable evidence and excludes raw credentials", () => {
  const { root, attachmentPath } = fixture();
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const config = {
    snapshot_root: root,
    account_label: "MoonSleep Alibaba",
    account_id: "moonsleep-alibaba",
    poll_interval_ms: 1000,
    monitor_overlap_ms: 1000,
    attachment_text_limit: 30000,
  };
  const record = __test__.buildRecord(
    snapshot.messages[0]!,
    snapshot,
    config,
    "conn-alibaba",
  );
  assert.equal(record.payload.external_record_id, "message:m-1");
  assert.equal(record.routing.container_id, "surewal-thread");
  assert.match(record.payload.content, /Vessel booking and ETA/);
  assert.equal(record.payload.attachments?.[0]?.local_path, attachmentPath);
  assert.match(record.payload.attachments?.[0]?.content_hash ?? "", /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(record), /must-not-leak|chatToken|encryptedAccount/);
  assert.doesNotMatch(JSON.stringify(record), /clouddisk\.alibaba\.com/);
});

test("bounded projection keeps temporal window and directionality", () => {
  const { root } = fixture();
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const config = {
    snapshot_root: root,
    account_label: "MoonSleep Alibaba",
    account_id: "moonsleep-alibaba",
    poll_interval_ms: 1000,
    monitor_overlap_ms: 1000,
    attachment_text_limit: 30000,
  };
  const rows = __test__.recordsForWindow(
    snapshot,
    config,
    "conn-alibaba",
    1784300200000,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.routing.sender_id, "moonsleep-alibaba");
  assert.equal(rows[0]?.routing.receiver_id, "supplier-ali");
});

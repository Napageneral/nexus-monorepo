import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AdapterInboundRecordSchema } from "@nexus-project/adapter-sdk-ts";
import { __test__ } from "./adapter.ts";

const PDF_BYTES = Buffer.from("%PDF-1.7\nimmutable pdf fixture\n%%EOF\n", "ascii");
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlJ8AAAAASUVORK5CYII=",
  "base64",
);

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

function writeJsonl(path: string, values: unknown[]): void {
  writeFileSync(path, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`);
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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

function upgradeFixtureToIdentityV2(snapshotPath: string): void {
  const adapterDir = join(snapshotPath, "adapter");
  const messagesPath = join(adapterDir, "messages.jsonl");
  const messages = readFileSync(messagesPath, "utf8").trim().split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  messages[0]!.senderAliId = "supplier-ali";
  messages[0]!.receiverAliId = "moonsleep-alibaba";
  messages[0]!.senderName = "Rebecca Liu";
  messages[1]!.senderAliId = "moonsleep-alibaba";
  messages[1]!.receiverAliId = "supplier-ali";
  messages[1]!.receiverName = "Rebecca Liu";
  writeJsonl(messagesPath, messages);
  const identityPath = join(adapterDir, "identity-directory.jsonl");
  writeJsonl(identityPath, [
    {
      schema_version: 1,
      identity_type: "person",
      provider_identity_id: "alibaba:person:ali:supplier-ali",
      ali_id: "supplier-ali",
      account_ids: ["supplier-account"],
      display_name: "Rebecca Liu",
      name_history: ["Rebecca", "Rebecca Liu"],
      aliases: ["Rebecca"],
      conversation_ids: ["surewal-thread"],
      source_provenance: [{ source_snapshot_id: "fixture", source_sha256: "a".repeat(64) }],
    },
    {
      schema_version: 1,
      identity_type: "conversation",
      provider_identity_id: "alibaba:conversation:surewal-thread",
      conversation_id: "surewal-thread",
      conversation_type: "direct",
      participant_provider_identity_ids: ["alibaba:person:ali:supplier-ali"],
      source_provenance: [{ source_snapshot_id: "fixture", source_sha256: "b".repeat(64) }],
    },
    {
      schema_version: 1,
      identity_type: "organization",
      provider_identity_id: "alibaba:organization-name:surewal",
      display_name: "Surewal",
      resolution_state: "name_only_review_required",
      source_provenance: [{ source_snapshot_id: "fixture", source_sha256: "c".repeat(64) }],
    },
    {
      schema_version: 1,
      identity_type: "membership",
      provider_identity_id: "alibaba:membership:rebecca-surewal",
      person_provider_identity_id: "alibaba:person:ali:supplier-ali",
      organization_provider_identity_id: "alibaba:organization-name:surewal",
      review_state: "proposed",
      automatic_promotion_allowed: false,
      source_provenance: [{ source_snapshot_id: "fixture", source_sha256: "d".repeat(64) }],
    },
  ]);
  const receipt = JSON.parse(readFileSync(join(adapterDir, "complete.json"), "utf8"));
  receipt.schemaVersion = 2;
  receipt.identityDirectoryCount = 4;
  receipt.adapterProjection.messagesSha256 = sha256(messagesPath);
  receipt.adapterProjection.identityDirectorySha256 = sha256(identityPath);
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
  writeFileSync(attachmentPath, PDF_BYTES);
  writeFileSync(attachmentTextPath, "Vessel booking and ETA are still pending.");
  writeFileSync(orphanAttachmentPath, PNG_BYTES);
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
      bytes: PDF_BYTES.length,
      contentType: "application/pdf",
      contentHash: sha256(attachmentPath),
      messageId: "m-1",
      cid: "surewal-thread",
      parentMessageCaptured: true,
      parentMessageDirection: "incoming",
      parentMessageSpeaker: "Rebecca Liu",
      parentMessageTimestamp: 1784300000000,
      localPath: attachmentPath,
      status: "downloaded",
    },
    {
      fileName: "orphan-sample.png",
      category: "image",
      bytes: PNG_BYTES.length,
      contentType: "image/png",
      contentHash: sha256(orphanAttachmentPath),
      messageId: "provider-message-not-in-export",
      cid: "surewal-thread",
      parentMessageCaptured: false,
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

function config(root: string, objectRoot?: string, adapterStateDir?: string) {
  return {
    snapshot_root: root,
    ...(objectRoot ? { object_root: objectRoot } : {}),
    account_label: "MoonSleep Alibaba",
    account_id: "moonsleep-alibaba",
    poll_interval_ms: 1000,
    monitor_overlap_ms: 1000,
    attachment_text_limit: 30000,
    ...(adapterStateDir ? { adapter_state_dir: adapterStateDir } : {}),
  };
}

test("materializes sealed evidence inside adapter state before Nex ingestion", () => {
  const { root, attachmentPath } = fixture();
  const stateDir = mkdtempSync(join(tmpdir(), "nexus-alibaba-state-"));
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const first = __test__.buildAttachmentRecord(
    snapshot.attachments[0]!,
    snapshot,
    config(root, undefined, stateDir),
    "conn-alibaba",
  );
  const replay = __test__.buildAttachmentRecord(
    snapshot.attachments[0]!,
    snapshot,
    config(root, undefined, stateDir),
    "conn-alibaba",
  );
  const localPath = first.payload.attachments?.[0]?.local_path;
  assert.ok(localPath);
  assert.match(
    localPath.slice(realpathSync(stateDir).length),
    /^\/attachment-custody\/sha256\/[0-9a-f]{2}\/[0-9a-f]{64}$/,
  );
  assert.notEqual(localPath, attachmentPath);
  assert.deepEqual(readFileSync(localPath), PDF_BYTES);
  assert.equal(statSync(localPath).mode & 0o777, 0o600);
  assert.equal(replay.payload.attachments?.[0]?.local_path, localPath);
});

test("identity v2 routes inbound and outbound people without collapsing the conversation", () => {
  const { root, snapshotPath } = fixture();
  upgradeFixtureToIdentityV2(snapshotPath);
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const incoming = __test__.buildRecord(snapshot.messages[0]!, snapshot, config(root), "conn-alibaba");
  const outgoing = __test__.buildRecord(snapshot.messages[1]!, snapshot, config(root), "conn-alibaba");

  assert.equal(incoming.routing.sender_id, "supplier-ali");
  assert.deepEqual(incoming.payload.recipients, ["moonsleep-alibaba"]);
  assert.equal(incoming.routing.connection_id, "conn-alibaba");
  assert.equal(incoming.routing.container_id, "surewal-thread");
  assert.equal(incoming.routing.container_kind, "direct");
  assert.equal(outgoing.routing.sender_id, "moonsleep-alibaba");
  assert.deepEqual(outgoing.payload.recipients, ["supplier-ali"]);
  assert.equal(outgoing.payload.metadata?.identity_contract, "alibaba.identity-directory.v2");
  assert.equal(incoming.routing.metadata?.sender_contact_space_id, "moonsleep-alibaba:person");
  assert.equal(incoming.routing.metadata?.message_receiver_contact_space_id, "moonsleep-alibaba");
  assert.equal(outgoing.routing.metadata?.sender_contact_space_id, "moonsleep-alibaba");
  assert.equal(
    outgoing.routing.metadata?.message_receiver_contact_space_id,
    "moonsleep-alibaba:person",
  );
  assert.deepEqual(outgoing.payload.metadata?.adapter_contacts, [
    {
      platform: "alibaba",
      sender_id: "supplier-ali",
      sender_name: "Rebecca Liu",
      aliases: ["Rebecca"],
      connection_id: "conn-alibaba",
      space_id: "moonsleep-alibaba:person",
      container_kind: "direct",
      container_id: "surewal-thread",
      thread_id: "surewal-thread",
    },
  ]);
  assert.notEqual(outgoing.routing.container_id, outgoing.payload.recipients?.[0]);
});

test("identity v2 infers an older outbound recipient from the direct conversation contact", () => {
  const { root, snapshotPath } = fixture();
  upgradeFixtureToIdentityV2(snapshotPath);
  const adapterDir = join(snapshotPath, "adapter");
  const messagesPath = join(adapterDir, "messages.jsonl");
  const messages = readFileSync(messagesPath, "utf8").trim().split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  delete messages[1]!.receiverAliId;
  writeJsonl(messagesPath, messages);
  const identityPath = join(adapterDir, "identity-directory.jsonl");
  const directory = readFileSync(identityPath, "utf8").trim().split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  directory.push({
    schema_version: 1,
    identity_type: "person",
    provider_identity_id: "alibaba:person:ali:provider-self-id",
    ali_id: "provider-self-id",
    display_name: "MoonSleep",
    name_history: ["MoonSleep"],
    aliases: [],
    conversation_ids: ["surewal-thread"],
    source_provenance: [{ source_snapshot_id: "fixture", source_sha256: "e".repeat(64) }],
  });
  const conversation = directory.find((row) => row.identity_type === "conversation");
  assert.ok(conversation && Array.isArray(conversation.participant_provider_identity_ids));
  conversation.participant_provider_identity_ids.push("alibaba:person:ali:provider-self-id");
  writeJsonl(identityPath, directory);
  const receipt = JSON.parse(readFileSync(join(adapterDir, "complete.json"), "utf8"));
  receipt.identityDirectoryCount = directory.length;
  receipt.adapterProjection.messagesSha256 = sha256(messagesPath);
  receipt.adapterProjection.identityDirectorySha256 = sha256(identityPath);
  writeJson(join(adapterDir, "complete.json"), receipt);
  writeJson(join(snapshotPath, "complete.json"), receipt);

  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const outgoing = __test__.buildRecord(snapshot.messages[1]!, snapshot, config(root), "conn-alibaba");
  assert.deepEqual(outgoing.payload.recipients, ["supplier-ali"]);
  assert.equal(outgoing.payload.metadata?.message_receiver_id, "supplier-ali");
});

test("identity v2 refuses a direct message whose person identity is absent", () => {
  const { root, snapshotPath } = fixture();
  upgradeFixtureToIdentityV2(snapshotPath);
  const messagesPath = join(snapshotPath, "adapter", "messages.jsonl");
  const messages = readFileSync(messagesPath, "utf8").trim().split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  delete messages[0]!.senderAliId;
  writeJsonl(messagesPath, messages);
  const identityPath = join(snapshotPath, "adapter", "identity-directory.jsonl");
  const directory = readFileSync(identityPath, "utf8").trim().split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((row) => row.identity_type !== "person");
  writeJsonl(identityPath, directory);
  const receiptPath = join(snapshotPath, "adapter", "complete.json");
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  receipt.identityDirectoryCount = directory.length;
  receipt.adapterProjection.messagesSha256 = sha256(messagesPath);
  receipt.adapterProjection.identityDirectorySha256 = sha256(identityPath);
  writeJson(receiptPath, receipt);
  writeJson(join(snapshotPath, "complete.json"), receipt);
  const loaded = __test__.loadSnapshot(__test__.latestSnapshot(root));
  assert.throws(
    () => __test__.buildRecord(loaded.messages[0]!, loaded, config(root), "conn-alibaba"),
    /unresolved participant identity/,
  );
});

test("rejects a symlinked adapter custody directory without writing outside state", () => {
  const { root } = fixture();
  const stateDir = mkdtempSync(join(tmpdir(), "nexus-alibaba-state-"));
  const outside = mkdtempSync(join(tmpdir(), "nexus-alibaba-outside-"));
  symlinkSync(outside, join(stateDir, "attachment-custody"));
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  assert.throws(
    () => __test__.buildAttachmentRecord(
      snapshot.attachments[0]!,
      snapshot,
      config(root, undefined, stateDir),
      "conn-alibaba",
    ),
    /custody directory is unsafe/,
  );
  assert.deepEqual(readdirSync(outside), []);
});

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
  const record = __test__.buildAttachmentRecord(
    snapshot.attachments[0]!,
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
  assert.equal(record.payload.external_record_id, "alibaba:conn-alibaba:message-v3:m-1");
  assert.equal(record.routing.container_id, "surewal-thread");
  assert.equal(record.routing.receiver_id, "conn-alibaba");
  assert.equal(record.payload.recipients, undefined);
  assert.equal(record.payload.metadata?.source_connection_id, "conn-alibaba");
  assert.equal(record.payload.content, "Here is the latest shipping schedule.");
  assert.equal(record.payload.attachments, undefined);
  assert.equal(record.payload.payload?.provider_object_json, sourceLine);
  assert.equal(
    record.payload.payload?.provider_object_sha256,
    createHash("sha256").update(sourceLine).digest("hex"),
  );
  assert.equal(record.payload.payload?.source_snapshot_id, undefined);
  assert.equal(record.payload.payload?.source_snapshot_receipt_sha256, undefined);
  assert.equal(record.payload.payload?.source_projection_messages_sha256, undefined);
  assert.equal(record.payload.metadata?.snapshot_id, snapshot.ref.id);
  assert.equal(record.payload.metadata?.snapshot_receipt_sha256, snapshot.ref.complete_sha256);
  const attachmentRecord = __test__.buildAttachmentRecord(
    snapshot.attachments[0]!,
    snapshot,
    config(root),
    "conn-alibaba",
  );
  assert.equal(attachmentRecord.payload.attachments?.[0]?.local_path, attachmentPath);
  assert.equal(attachmentRecord.payload.attachments?.[0]?.mime_type, "application/pdf");
  assert.match(attachmentRecord.payload.attachments?.[0]?.content_hash ?? "", /^[a-f0-9]{64}$/);
  assert.match(attachmentRecord.payload.content, /Vessel booking and ETA/);
  const sourceAttachment = String(attachmentRecord.payload.payload?.provider_attachment_json ?? "");
  assert.equal(
    createHash("sha256").update(sourceAttachment).digest("hex"),
    attachmentRecord.payload.payload?.provider_attachment_sha256,
  );
  assert.doesNotMatch(sourceAttachment, /localPath|objectPath|retired-capture-root/);
  assert.doesNotThrow(() => AdapterInboundRecordSchema.parse(record));
  assert.doesNotMatch(JSON.stringify(record), /must-not-leak|chatToken|encryptedAccount/);
  assert.doesNotMatch(JSON.stringify(record), /clouddisk\.alibaba\.com/);
});

test("byte-derived MIME normalization preserves attachment identity and revision custody", () => {
  const { root } = fixture();
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const attachment = snapshot.attachments[0]!;
  const explicit = __test__.buildAttachmentRecord(
    attachment,
    snapshot,
    config(root),
    "conn-alibaba",
  );
  attachment.contentType = "application/octet-stream";
  const generic = __test__.buildAttachmentRecord(
    attachment,
    snapshot,
    config(root),
    "conn-alibaba",
  );
  assert.equal(generic.payload.attachments?.[0]?.mime_type, "application/pdf");
  assert.equal(generic.payload.external_record_id, explicit.payload.external_record_id);
  assert.equal(generic.payload.metadata?.logical_record_id, explicit.payload.metadata?.logical_record_id);
  assert.equal(generic.payload.metadata?.revision_hash, explicit.payload.metadata?.revision_hash);
});

test("attachment custody fails on byte-count or digest but ignores misleading provider MIME", () => {
  const { root, attachmentPath } = fixture();
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const attachment = snapshot.attachments[0]!;
  const sealedBytes = attachment.bytes;
  const sealedDigest = attachment.contentHash;

  attachment.bytes = Number(sealedBytes) + 1;
  assert.throws(
    () => __test__.buildAttachmentRecord(attachment, snapshot, config(root), "conn-alibaba"),
    /sealed byte count mismatch/,
  );
  attachment.bytes = sealedBytes;
  attachment.contentHash = "f".repeat(64);
  assert.throws(
    () => __test__.buildAttachmentRecord(attachment, snapshot, config(root), "conn-alibaba"),
    /attachment digest mismatch/,
  );
  attachment.contentHash = sealedDigest;
  attachment.contentType = "image/png";
  assert.equal(sha256(attachmentPath), sealedDigest);
  const record = __test__.buildAttachmentRecord(
    attachment,
    snapshot,
    config(root),
    "conn-alibaba",
  );
  assert.equal(record.payload.attachments?.[0]?.mime_type, "application/pdf");
});

test("capture-level provenance cannot change immutable message identity or payload", () => {
  const { root } = fixture();
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const original = __test__.buildRecord(
    snapshot.messages[0]!,
    snapshot,
    config(root),
    "conn-alibaba",
  );
  const refreshed = __test__.buildRecord(
    snapshot.messages[0]!,
    {
      ...snapshot,
      ref: {
        ...snapshot.ref,
        id: "new-browser-capture",
        complete_sha256: "f".repeat(64),
        captured_at: snapshot.ref.captured_at + 1_000,
        complete: {
          ...snapshot.ref.complete,
          adapterProjection: {
            ...snapshot.ref.complete.adapterProjection,
            messagesSha256: "e".repeat(64),
          },
        },
      },
    },
    config(root),
    "conn-alibaba",
  );
  assert.equal(refreshed.payload.external_record_id, original.payload.external_record_id);
  assert.deepEqual(refreshed.payload.payload, original.payload.payload);
  assert.notEqual(refreshed.payload.metadata?.snapshot_id, original.payload.metadata?.snapshot_id);
  assert.notEqual(
    refreshed.payload.metadata?.snapshot_receipt_sha256,
    original.payload.metadata?.snapshot_receipt_sha256,
  );
});

test("capture-local attachment paths cannot change immutable message identity or payload", () => {
  const { root } = fixture();
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const original = __test__.buildRecord(
    snapshot.messages[0]!,
    snapshot,
    config(root),
    "conn-alibaba",
  );
  const attachment = snapshot.attachmentsByMessage.get("m-1")?.[0];
  assert.ok(attachment);
  attachment.localPath = "/another-capture/attachments/shipping-schedule.pdf";
  attachment.objectPath = "/another-capture/objects/e4/e465";
  const relocated = __test__.buildRecord(
    snapshot.messages[0]!,
    snapshot,
    config(root),
    "conn-alibaba",
  );
  assert.equal(relocated.payload.external_record_id, original.payload.external_record_id);
  assert.deepEqual(relocated.payload.payload, original.payload.payload);
});

test("bounded projection keeps temporal window, directionality, and replay identity", () => {
  const { root } = fixture();
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const rows = __test__.recordsForWindow(snapshot, config(root), "conn-alibaba", 1784300200000);
  const replay = __test__.recordsForWindow(snapshot, config(root), "conn-alibaba", 1784300200000);
  assert.equal(rows.length, 2);
  const message = rows.find((row) => row.payload.metadata?.family === "message");
  const orphan = rows.find(
    (row) => row.payload.payload?.source_coverage_disposition === "orphan_attachment_evidence",
  );
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

test("exact state authorization limits backfill to the selected attachment identities", async () => {
  const { root } = fixture();
  const stateDir = mkdtempSync(join(tmpdir(), "nexus-alibaba-state-"));
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const connectionId = "conn-alibaba";
  const allRows = __test__.recordsForWindow(
    snapshot,
    config(root, undefined, stateDir),
    connectionId,
    0,
  );
  const attachmentIds = allRows
    .filter((row) => row.payload.metadata?.family === "attachment")
    .map((row) => row.payload.external_record_id)
    .sort();
  writeJson(join(stateDir, "backfill-selection.json"), {
    schemaVersion: "nexus.alibaba_backfill_selection.v1",
    purpose: "recover_partial_attachment_ingestion",
    snapshotId: snapshot.ref.id,
    snapshotReceiptSha256: snapshot.ref.complete_sha256,
    connectionIdSha256: sha256Text(connectionId),
    recordFamily: "attachment",
    externalRecordIds: attachmentIds,
    externalRecordIdsSha256: sha256Text(`${attachmentIds.join("\n")}\n`),
    expectedRecordCount: attachmentIds.length,
    authority: {
      providerReadOnly: true,
      remoteMutationEnabled: false,
      businessMutationEnabled: false,
    },
  });
  chmodSync(join(stateDir, "backfill-selection.json"), 0o400);
  const priorStateDir = process.env.NEXUS_ADAPTER_STATE_DIR;
  process.env.NEXUS_ADAPTER_STATE_DIR = stateDir;
  const emitted: typeof allRows = [];
  try {
    await __test__.backfill(
      {
        runtime: {
          platform: "alibaba",
          connection_id: connectionId,
          config: config(root),
        },
        signal: new AbortController().signal,
        log: { debug() {}, error() {}, info() {} },
      },
      { since: new Date(0) },
      (row) => emitted.push(row),
    );
  } finally {
    if (priorStateDir === undefined) delete process.env.NEXUS_ADAPTER_STATE_DIR;
    else process.env.NEXUS_ADAPTER_STATE_DIR = priorStateDir;
  }
  assert.equal(emitted.length, 2);
  assert.deepEqual(
    emitted.map((row) => row.payload.external_record_id).sort(),
    attachmentIds,
  );
  assert.ok(emitted.every((row) => row.payload.metadata?.family === "attachment"));
});

test("backfill selection fails closed on an unselected or altered snapshot identity", () => {
  const { root } = fixture();
  const stateDir = mkdtempSync(join(tmpdir(), "nexus-alibaba-state-"));
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const rows = __test__.recordsForWindow(
    snapshot,
    config(root, undefined, stateDir),
    "conn-alibaba",
    0,
  );
  const messageId = rows.find((row) => row.payload.metadata?.family === "message")!
    .payload.external_record_id;
  writeJson(join(stateDir, "backfill-selection.json"), {
    schemaVersion: "nexus.alibaba_backfill_selection.v1",
    purpose: "recover_partial_attachment_ingestion",
    snapshotId: snapshot.ref.id,
    snapshotReceiptSha256: snapshot.ref.complete_sha256,
    connectionIdSha256: sha256Text("conn-alibaba"),
    recordFamily: "attachment",
    externalRecordIds: [messageId],
    externalRecordIdsSha256: sha256Text(`${messageId}\n`),
    expectedRecordCount: 1,
    authority: {
      providerReadOnly: true,
      remoteMutationEnabled: false,
      businessMutationEnabled: false,
    },
  });
  chmodSync(join(stateDir, "backfill-selection.json"), 0o400);
  assert.throws(
    () => __test__.selectedBackfillRows(rows, snapshot.ref, "conn-alibaba", stateDir),
    /identities are invalid/,
  );
});

test("exact v2 state authorization selects a mixed missing revision set", () => {
  const { root } = fixture();
  const stateDir = mkdtempSync(join(tmpdir(), "nexus-alibaba-state-"));
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const rows = __test__.recordsForWindow(
    snapshot,
    config(root, undefined, stateDir),
    "conn-alibaba",
    0,
  );
  const selectedRows = [
    rows.find((row) => row.payload.metadata?.family === "attachment")!,
    rows.find((row) => row.payload.metadata?.family === "message")!,
  ];
  const selectedIds = selectedRows
    .map((row) => row.payload.external_record_id)
    .sort();
  writeJson(join(stateDir, "backfill-selection.json"), {
    schemaVersion: "nexus.alibaba_backfill_selection.v2",
    purpose: "recover_partial_snapshot_ingestion",
    snapshotId: snapshot.ref.id,
    snapshotReceiptSha256: snapshot.ref.complete_sha256,
    connectionIdSha256: sha256Text("conn-alibaba"),
    recordFamilies: ["attachment", "message"],
    externalRecordIds: selectedIds,
    externalRecordIdsSha256: sha256Text(`${selectedIds.join("\n")}\n`),
    expectedRecordCount: selectedIds.length,
    authority: {
      providerReadOnly: true,
      remoteMutationEnabled: false,
      businessMutationEnabled: false,
    },
  });
  chmodSync(join(stateDir, "backfill-selection.json"), 0o400);
  const selected = __test__.selectedBackfillRows(
    rows,
    snapshot.ref,
    "conn-alibaba",
    stateDir,
  );
  assert.deepEqual(
    selected.map((row) => row.payload.external_record_id).sort(),
    selectedIds,
  );
  assert.deepEqual(
    [...new Set(selected.map((row) => row.payload.metadata?.family))].sort(),
    ["attachment", "message"],
  );
});

test("v2 selection fails closed when the declared families omit a selected identity", () => {
  const { root } = fixture();
  const stateDir = mkdtempSync(join(tmpdir(), "nexus-alibaba-state-"));
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const rows = __test__.recordsForWindow(
    snapshot,
    config(root, undefined, stateDir),
    "conn-alibaba",
    0,
  );
  const messageId = rows.find((row) => row.payload.metadata?.family === "message")!
    .payload.external_record_id;
  writeJson(join(stateDir, "backfill-selection.json"), {
    schemaVersion: "nexus.alibaba_backfill_selection.v2",
    purpose: "recover_partial_snapshot_ingestion",
    snapshotId: snapshot.ref.id,
    snapshotReceiptSha256: snapshot.ref.complete_sha256,
    connectionIdSha256: sha256Text("conn-alibaba"),
    recordFamilies: ["attachment"],
    externalRecordIds: [messageId],
    externalRecordIdsSha256: sha256Text(`${messageId}\n`),
    expectedRecordCount: 1,
    authority: {
      providerReadOnly: true,
      remoteMutationEnabled: false,
      businessMutationEnabled: false,
    },
  });
  chmodSync(join(stateDir, "backfill-selection.json"), 0o400);
  assert.throws(
    () => __test__.selectedBackfillRows(rows, snapshot.ref, "conn-alibaba", stateDir),
    /identities are invalid/,
  );
});

test("every linked and unlinked attachment is a standalone immutable record", () => {
  const { root } = fixture();
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const rows = __test__.recordsForWindow(snapshot, config(root), "conn-alibaba", 0);
  assert.equal(rows.length, snapshot.messages.length + snapshot.attachments.length);
  const attachments = rows.filter((row) => row.payload.metadata?.family === "attachment");
  assert.equal(attachments.length, 2);
  assert.equal(
    attachments.filter(
      (row) => row.payload.payload?.source_coverage_disposition === "linked_attachment_evidence",
    ).length,
    1,
  );
  assert.equal(
    attachments.filter(
      (row) => row.payload.payload?.source_coverage_disposition === "orphan_attachment_evidence",
    ).length,
    1,
  );
  assert.equal(rows.find((row) => row.payload.metadata?.message_id === "m-1")?.payload.attachments, undefined);
});

test("attachment-only deltas retain exact parent direction, speaker, timestamp, and recipient", () => {
  const { root } = fixture();
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const attachment = snapshot.attachments[0]!;
  snapshot.messagesById.delete("m-1");
  attachment.parentMessageDirection = "outgoing";
  attachment.parentMessageSpeaker = "MoonSleep";
  attachment.parentMessageTimestamp = "2026-07-17T14:58:20.000Z";
  const record = __test__.buildAttachmentRecord(
    attachment,
    snapshot,
    config(root),
    "conn-alibaba",
  );
  assert.equal(record.routing.sender_id, "moonsleep-alibaba");
  assert.equal(record.routing.sender_name, "MoonSleep Alibaba");
  assert.deepEqual(record.payload.recipients, ["supplier-ali"]);
  assert.equal(record.payload.timestamp, Date.parse("2026-07-17T14:58:20.000Z"));
  assert.equal(record.payload.metadata?.timestamp_basis, "provider_message_timestamp");
});

test("changed attachment bytes create a new revision without changing the parent message", () => {
  const { root, attachmentPath } = fixture();
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  const messageBefore = __test__.buildRecord(
    snapshot.messages[0]!,
    snapshot,
    config(root),
    "conn-alibaba",
  );
  const attachment = snapshot.attachments[0]!;
  const attachmentBefore = __test__.buildAttachmentRecord(
    attachment,
    snapshot,
    config(root),
    "conn-alibaba",
  );
  const revisedBytes = Buffer.from("%PDF-1.7\nrevised immutable attachment fixture\n%%EOF\n", "ascii");
  writeFileSync(attachmentPath, revisedBytes);
  attachment.bytes = revisedBytes.length;
  attachment.contentHash = createHash("sha256").update(revisedBytes).digest("hex");
  attachment.provider_object_json = JSON.stringify({
    cid: attachment.cid,
    contentHash: attachment.contentHash,
    fileName: attachment.fileName,
    messageId: attachment.messageId,
  });
  attachment.provider_object_sha256 = createHash("sha256")
    .update(attachment.provider_object_json)
    .digest("hex");
  const attachmentAfter = __test__.buildAttachmentRecord(
    attachment,
    snapshot,
    config(root),
    "conn-alibaba",
  );
  const messageAfter = __test__.buildRecord(
    snapshot.messages[0]!,
    snapshot,
    config(root),
    "conn-alibaba",
  );
  assert.equal(attachmentAfter.payload.external_record_id, attachmentBefore.payload.external_record_id);
  assert.notEqual(
    attachmentAfter.payload.metadata?.revision_hash,
    attachmentBefore.payload.metadata?.revision_hash,
  );
  assert.equal(
    attachmentAfter.payload.metadata?.logical_record_id,
    attachmentBefore.payload.metadata?.logical_record_id,
  );
  assert.equal(messageAfter.payload.external_record_id, messageBefore.payload.external_record_id);
  assert.deepEqual(messageAfter.payload.payload, messageBefore.payload.payload);
});

test("provider attachment rows without a captured parent message remain explicit evidence", () => {
  const { root } = fixture();
  const snapshot = __test__.loadSnapshot(__test__.latestSnapshot(root));
  assert.equal(snapshot.orphanAttachments.length, 1);
  const rows = __test__.recordsForWindow(snapshot, config(root), "conn-alibaba", 0);
  const orphan = rows.find(
    (row) => row.payload.payload?.source_coverage_disposition === "orphan_attachment_evidence",
  );
  assert.ok(orphan);
  assert.match(orphan.payload.external_record_id, /^alibaba:conn-alibaba:attachment-v3:/);
  assert.equal(orphan.payload.payload?.source_snapshot_id, undefined);
  assert.equal(orphan.payload.payload?.source_snapshot_receipt_sha256, undefined);
  assert.equal(orphan.payload.payload?.source_projection_attachments_sha256, undefined);
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
  snapshot.attachments[0] = {
    fileName: "outside.pdf",
    contentHash: "b".repeat(64),
    messageId: "m-1",
    cid: "surewal-thread",
    localPath: "/etc/hosts",
    status: "downloaded",
    provider_object_json: "{}",
    provider_object_sha256: createHash("sha256").update("{}").digest("hex"),
  };
  assert.throws(
    () => __test__.buildAttachmentRecord(snapshot.attachments[0]!, snapshot, config(root), "conn-alibaba"),
    /attachment evidence is missing/,
  );
});

#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function parseJsonStream(path) {
  const raw = readFileSync(path, "utf8");
  const rows = [];
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let offset = 0; offset < raw.length; offset += 1) {
    const character = raw[offset];
    if (start < 0) {
      if (/\s/.test(character)) continue;
      assert.equal(character, "{", `${path} contains non-JSON output`);
      start = offset;
      depth = 1;
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        rows.push(JSON.parse(raw.slice(start, offset + 1)));
        start = -1;
      }
    }
  }
  assert.equal(start, -1, `${path} contains an incomplete JSON object`);
  assert.ok(rows.length > 1, `${path} must contain message and attachment records`);
  return rows;
}

const [firstPath, secondPath] = process.argv.slice(2);
assert.ok(firstPath && secondPath, "two cleanroom backfill paths are required");
const first = parseJsonStream(firstPath);
const second = parseJsonStream(secondPath);
assert.deepEqual(second, first);
const message = first.find((row) => row.payload?.metadata?.family === "message");
const attachment = first.find((row) => row.payload?.metadata?.family === "attachment");
assert.ok(message && attachment);
assert.equal(
  message.payload.external_record_id,
  "alibaba:cleanroom-alibaba:message-v3:cleanroom-message-1",
);
assert.match(message.payload.content, /shipping update/);
assert.equal(
  createHash("sha256").update(message.payload.payload.provider_object_json).digest("hex"),
  message.payload.payload.provider_object_sha256,
);
assert.match(attachment.payload.attachments[0].content_hash, /^[a-f0-9]{64}$/);
assert.doesNotMatch(JSON.stringify(first), /chatToken|signedUrl|encryptedAccount/);
console.log(JSON.stringify({
  cleanroom_backfill: "passed",
  record_count: first.length,
  external_record_id: message.payload.external_record_id,
  source_json_sha256: message.payload.payload.provider_object_sha256,
  attachment_sha256: attachment.payload.attachments[0].content_hash,
}));

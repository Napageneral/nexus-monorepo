#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${NEXUS_ALIBABA_CLEANROOM_IMAGE:-node:22-alpine}"
PLATFORM="${NEXUS_ALIBABA_CLEANROOM_PLATFORM:-linux/amd64}"

docker run --rm \
  --platform "$PLATFORM" \
  --entrypoint /bin/sh \
  -v "$ROOT:/workspace/alibaba:ro" \
  -v "$(cd "$ROOT/.." && pwd)/nexus-adapter-sdks:/workspace/nexus-adapter-sdks:ro" \
  -w /workspace/alibaba \
  "$IMAGE" \
  -lc 'cp -R /workspace/alibaba /tmp/alibaba && cp -R /workspace/nexus-adapter-sdks /tmp/nexus-adapter-sdks && cd /tmp/alibaba && npm install --ignore-scripts && npm test && npm run lint && npm run build && ./dist/index.js adapter.info && mkdir -p /tmp/alibaba-state && node -e '\''const fs=require("fs"); fs.writeFileSync("/tmp/alibaba-context.json", JSON.stringify({platform:"alibaba",connection_id:"cleanroom-alibaba",config:{snapshot_root:"/tmp/alibaba/testdata/snapshots",account_label:"MoonSleep Alibaba",account_id:"moonsleep-alibaba"}}))'\'' && NEXUS_ADAPTER_CONTEXT_PATH=/tmp/alibaba-context.json NEXUS_ADAPTER_STATE_DIR=/tmp/alibaba-state ./dist/index.js records.backfill --connection cleanroom-alibaba --since 2026-07-17T00:00:00.000Z --to 2026-07-18T00:00:00.000Z --format jsonl > /tmp/backfill-1.jsonl && NEXUS_ADAPTER_CONTEXT_PATH=/tmp/alibaba-context.json NEXUS_ADAPTER_STATE_DIR=/tmp/alibaba-state ./dist/index.js records.backfill --connection cleanroom-alibaba --since 2026-07-17T00:00:00.000Z --to 2026-07-18T00:00:00.000Z --format jsonl > /tmp/backfill-2.jsonl && node -e '\''const fs=require("fs"),assert=require("assert").strict,crypto=require("crypto"); const a=JSON.parse(fs.readFileSync("/tmp/backfill-1.jsonl","utf8").trim()), b=JSON.parse(fs.readFileSync("/tmp/backfill-2.jsonl","utf8").trim()); assert.match(a.payload.external_record_id,/^alibaba:cleanroom-alibaba:message:cleanroom-message-1:[a-f0-9]{64}$/); assert.equal(b.payload.external_record_id,a.payload.external_record_id); assert.match(a.payload.content,/Vessel booking and ETA/); assert.deepEqual(a.payload.attachments[0].content_hash,b.payload.attachments[0].content_hash); assert.equal(crypto.createHash("sha256").update(a.payload.payload.provider_object_json).digest("hex"),a.payload.payload.provider_object_sha256); assert.deepEqual(b.payload.payload,a.payload.payload); assert.doesNotMatch(JSON.stringify(a),/chatToken|signedUrl|encryptedAccount/); console.log(JSON.stringify({cleanroom_backfill:"passed",external_record_id:a.payload.external_record_id,source_json_sha256:a.payload.payload.provider_object_sha256,attachment_sha256:a.payload.attachments[0].content_hash}))'\'''

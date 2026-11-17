#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${NEXUS_ALIBABA_CLEANROOM_IMAGE:-node:22-bookworm@sha256:0557ac14e0d45d02ed563067b82856ca5e7aa3437fa28d98d4350ea9c3d9494a}"
PLATFORM="${NEXUS_ALIBABA_CLEANROOM_PLATFORM:-linux/amd64}"

docker run --rm \
  --platform "$PLATFORM" \
  --entrypoint /bin/sh \
  -v "$ROOT:/workspace/alibaba:ro" \
  -v "$(cd "$ROOT/.." && pwd)/nexus-adapter-sdks:/workspace/nexus-adapter-sdks:ro" \
  -w /workspace/alibaba \
  "$IMAGE" \
  -lc 'cp -R /workspace/alibaba /tmp/alibaba && cp -R /workspace/nexus-adapter-sdks /tmp/nexus-adapter-sdks && cd /tmp/nexus-adapter-sdks/nexus-adapter-sdk-ts && npm install --ignore-scripts && npm run build && cd /tmp/alibaba && npm install --ignore-scripts && npm test && npm run lint && npm run build && ./dist/index.js adapter.info && mkdir -p /tmp/alibaba-state && node -e '\''const fs=require("fs"); fs.writeFileSync("/tmp/alibaba-context.json", JSON.stringify({platform:"alibaba",connection_id:"cleanroom-alibaba",config:{snapshot_root:"/tmp/alibaba/testdata/snapshots",account_label:"MoonSleep Alibaba",account_id:"moonsleep-alibaba"}}))'\'' && NEXUS_ADAPTER_CONTEXT_PATH=/tmp/alibaba-context.json NEXUS_ADAPTER_STATE_DIR=/tmp/alibaba-state ./dist/index.js records.backfill --connection cleanroom-alibaba --since 2026-07-17T00:00:00.000Z --to 2026-07-18T00:00:00.000Z --format jsonl > /tmp/backfill-1.jsonl && NEXUS_ADAPTER_CONTEXT_PATH=/tmp/alibaba-context.json NEXUS_ADAPTER_STATE_DIR=/tmp/alibaba-state ./dist/index.js records.backfill --connection cleanroom-alibaba --since 2026-07-17T00:00:00.000Z --to 2026-07-18T00:00:00.000Z --format jsonl > /tmp/backfill-2.jsonl && node ./scripts/verify-cleanroom-backfill.mjs /tmp/backfill-1.jsonl /tmp/backfill-2.jsonl'

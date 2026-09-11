#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker run --rm \
  --read-only \
  --cpus 1 \
  --memory 1g \
  --pids-limit 128 \
  --env NPM_CONFIG_CACHE=/tmp/npm-cache \
  --tmpfs /tmp:rw,nosuid,nodev,exec,size=768m \
  --mount "type=bind,src=${ROOT_DIR}/..,dst=/workspace,readonly" \
  --workdir /tmp \
  node:24-bookworm \
  bash -ceu 'mkdir -p /tmp/wwex-speedship /tmp/nexus-adapter-sdks; tar -C /workspace/wwex-speedship --exclude=node_modules --exclude=dist -cf - . | tar -C /tmp/wwex-speedship -xf -; tar -C /workspace/nexus-adapter-sdks --exclude=node_modules --exclude=dist -cf - . | tar -C /tmp/nexus-adapter-sdks -xf -; cd /tmp/nexus-adapter-sdks/nexus-adapter-sdk-ts; npm install --no-package-lock --ignore-scripts; npm run build; cd /tmp/wwex-speedship; npm ci --ignore-scripts; npm test; npm run lint; npm run build; ./dist/index.js adapter.info'

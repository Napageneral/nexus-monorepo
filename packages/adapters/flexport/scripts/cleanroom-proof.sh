#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --legacy-peer-deps: npm 10's arborist fails on the SDK's optional vitest peers without it.
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
  bash -ceu 'mkdir -p /tmp/flexport /tmp/nexus-adapter-sdks; tar -C /workspace/flexport --exclude=node_modules --exclude=dist -cf - . | tar -C /tmp/flexport -xf -; tar -C /workspace/nexus-adapter-sdks --exclude=node_modules --exclude=dist -cf - . | tar -C /tmp/nexus-adapter-sdks -xf -; cd /tmp/nexus-adapter-sdks/nexus-adapter-sdk-ts; npm install --no-package-lock --ignore-scripts --legacy-peer-deps; npm run build; cd /tmp/flexport; npm ci --ignore-scripts; npm test; npm run lint; npm run build; ./dist/index.js adapter.info'

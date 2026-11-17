#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker run --rm \
  --read-only \
  --cpus 1 \
  --memory 1g \
  --pids-limit 128 \
  --env NPM_CONFIG_CACHE=/tmp/npm-cache \
  --env COREPACK_HOME=/tmp/corepack \
  --env PNPM_HOME=/tmp/pnpm-home \
  --env XDG_DATA_HOME=/tmp/xdg-data \
  --tmpfs /tmp:rw,nosuid,nodev,exec,size=768m \
  --mount "type=bind,src=${ROOT_DIR}/..,dst=/workspace,readonly" \
  --workdir /tmp \
  node:24-bookworm \
  bash -ceu 'mkdir -p /tmp/mailchimp /tmp/nexus-adapter-sdks /tmp/pnpm-home; corepack enable --install-directory /tmp/pnpm-home; export PATH="/tmp/pnpm-home:$PATH"; tar -C /workspace/mailchimp --exclude=node_modules --exclude=dist -cf - . | tar -C /tmp/mailchimp -xf -; tar -C /workspace/nexus-adapter-sdks --exclude=node_modules --exclude=dist -cf - . | tar -C /tmp/nexus-adapter-sdks -xf -; cd /tmp/nexus-adapter-sdks/nexus-adapter-sdk-ts; npm install --no-package-lock --ignore-scripts; npm run build; cd /tmp/mailchimp; pnpm install --frozen-lockfile --ignore-scripts --store-dir /tmp/pnpm-store; pnpm test; pnpm lint; pnpm build; ./dist/index.js adapter.info'

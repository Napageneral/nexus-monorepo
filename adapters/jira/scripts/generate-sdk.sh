#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
pnpm --dir "$ROOT/../../nex" exec tsx scripts/sdk/generate-adapter-sdk-ts.ts jira
pnpm --dir "$ROOT/../../nex" exec tsc -p "$ROOT/sdk/jira-sdk-ts/tsconfig.json"

#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

contract_dir="$repo_root/../nexus-specs/specs/runtime/adapters/contract"
if [ ! -f "$contract_dir/adapter-protocol.schema.json" ]; then
  echo "[adapter-conformance] missing contract schema at: $contract_dir/adapter-protocol.schema.json" >&2
  exit 1
fi
export NEXUS_ADAPTER_PROTOCOL_CONTRACT_DIR="$contract_dir"

echo "[adapter-conformance] Go SDK: go test ./..."
(cd "$repo_root/nexus-adapter-sdk-go" && go test ./...)

echo "[adapter-conformance] TS SDK: pnpm test"
(cd "$repo_root/nexus-adapter-sdk-ts" && pnpm test)

echo "[adapter-conformance] OK"

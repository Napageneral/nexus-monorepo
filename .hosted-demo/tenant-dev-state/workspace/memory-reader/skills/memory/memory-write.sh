#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
memory_db="$(cat "$script_dir/DB_MEMORY_PATH" 2>/dev/null || cat "$script_dir/DB_PATH" 2>/dev/null || true)"
memory_db="$(echo "$memory_db" | tr -d '
')"
if [[ -z "$memory_db" ]]; then
  echo '{"ok":false,"error":"missing DB_MEMORY_PATH/DB_PATH"}'
  exit 1
fi
if [[ ! -f "$memory_db" ]]; then
  echo "{"ok":false,"error":"memory db not found: $memory_db"}"
  exit 1
fi
if ! command -v sqlite3 >/dev/null 2>&1; then
  echo '{"ok":false,"error":"sqlite3 not found on PATH"}'
  exit 1
fi

text="${*:-}"
if [[ -z "$text" ]]; then
  echo '{"ok":false,"error":"usage: memory-write.sh <fact text>"}'
  exit 1
fi

escaped_text="$(printf "%s" "$text" | sed "s/'/''/g")"
now_ms="$(($(date +%s) * 1000))"
fact_id="fact:manual:$now_ms"

sqlite3 "$memory_db" "PRAGMA trusted_schema=ON; INSERT INTO facts (id, text, context, as_of, ingested_at, source_event_id, metadata, created_at) VALUES ('$fact_id', '$escaped_text', 'manual', $now_ms, $now_ms, NULL, '{}', $now_ms);"
echo "{"ok":true,"fact_id":"$fact_id"}"


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

query="${*:-}"
if [[ -z "$query" ]]; then
  echo '[]'
  exit 0
fi

escaped_query="$(printf "%s" "$query" | sed "s/'/''/g")"
sqlite3 -json "$memory_db" "SELECT id, text, as_of FROM facts WHERE text LIKE '%' || '$escaped_query' || '%' ORDER BY as_of DESC LIMIT 25;"


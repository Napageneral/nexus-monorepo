#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NEX_CLI="$ROOT/nex/dist/entry.js"
python3 "$ROOT/packages/scripts/discover-package-roots.py" | python3 -c 'import json,sys; data=json.load(sys.stdin); [print(item["package_root"]) for item in data]' | while read -r pkg; do
  echo "--- $pkg"
  node "$NEX_CLI" package validate "$pkg"
done

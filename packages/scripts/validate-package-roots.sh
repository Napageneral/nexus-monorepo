#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NEX_CLI="${NEX_CLI:-$ROOT/nex/dist/entry.js}"
roots="$(python3 "$ROOT/packages/scripts/discover-package-roots.py" | python3 -c 'import json,sys; data=json.load(sys.stdin); [print(item["package_root"]) for item in data]')"
# --changed-since <commit>: validate only the package roots with a file changed
# between <commit> and HEAD. Adapters ship built commands (dist/, bin/) that a
# fresh checkout does not have, so a full run belongs where they are built.
if [ "${1:-}" = "--changed-since" ]; then
  changed="$(git -C "$ROOT" diff --name-only "$2" HEAD)"
  roots="$(while read -r pkg; do
    rel="${pkg#"$ROOT"/}"
    if printf '%s\n' "$changed" | awk -v prefix="$rel/" 'index($0, prefix) == 1 { found = 1 } END { exit !found }'; then
      echo "$pkg"
    fi
  done <<< "$roots")"
fi
if [ -z "$roots" ]; then
  echo "no package roots to validate"
  exit 0
fi
while read -r pkg; do
  echo "--- $pkg"
  node "$NEX_CLI" package validate "$pkg"
done <<< "$roots"

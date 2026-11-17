#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ "$#" -ne 4 ]]; then
  echo "usage: $0 <runtime-url> <token-file> <body-file> <receipt-dir>" >&2
  exit 64
fi

RUNTIME_URL="${1%/}"
TOKEN_FILE="$2"
BODY_FILE="$3"
RECEIPT_DIR="$4"

if [[ "$RUNTIME_URL" != "http://127.0.0.1:"* && "$RUNTIME_URL" != "http://localhost:"* ]]; then
  echo "runtime URL must be loopback HTTP" >&2
  exit 64
fi
for command_name in curl jq install; do
  command -v "$command_name" >/dev/null
done
test -f "$TOKEN_FILE"

# The body holds the Flexport client id and secret: a regular, private (0600) file, never a link,
# never echoed. GNU stat (Linux) first, BSD stat (macOS) second.
file_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}
if [[ -L "$BODY_FILE" || ! -f "$BODY_FILE" ]]; then
  echo "request body must be a regular file, not a link" >&2
  exit 64
fi
if [[ "$(file_mode "$BODY_FILE")" != "600" ]]; then
  echo "request body file must be mode 0600" >&2
  exit 64
fi
if ! jq -e '
  .adapter == "flexport" and
  .authMethodId == "flexport_client_credentials" and
  (.connectionId | type == "string" and test("^[a-z0-9][a-z0-9._-]{0,127}$")) and
  (.fields.client_id | type == "string" and length > 0) and
  (.fields.client_secret | type == "string" and length > 0)
' "$BODY_FILE" >/dev/null 2>&1; then
  echo "request body is not a Flexport adapters.connections.create request" >&2
  exit 64
fi
CONNECTION_ID="$(jq -er '.connectionId' "$BODY_FILE")"

install -d -m 0700 "$RECEIPT_DIR"
CREATE_RECEIPT="$RECEIPT_DIR/connection-create-response.json"

# The runtime token never goes on a command line (any local user can read ps and
# /proc/<pid>/cmdline): curl (7.55+) reads the Authorization header from a private 0600 file,
# written by the shell's printf builtin and removed on exit.
TOKEN="$(<"$TOKEN_FILE")"
if [[ -z "$TOKEN" || "$TOKEN" =~ [[:space:][:cntrl:]] ]]; then
  echo "runtime token file must hold exactly one token" >&2
  exit 64
fi
AUTH_HEADER_FILE="$(mktemp "${TMPDIR:-/tmp}/flexport-runtime-auth.XXXXXX")"
trap 'rm -f "$AUTH_HEADER_FILE"' EXIT
chmod 0600 "$AUTH_HEADER_FILE"
printf 'Authorization: Bearer %s\n' "$TOKEN" > "$AUTH_HEADER_FILE"
unset TOKEN

curl --silent --show-error --fail-with-body \
  -H "@$AUTH_HEADER_FILE" \
  -H "Content-Type: application/json" \
  --data "@$BODY_FILE" \
  "$RUNTIME_URL/runtime/operations/adapters.connections.create" \
  > "$CREATE_RECEIPT"
chmod 0600 "$CREATE_RECEIPT"

jq -e --arg connection_id "$CONNECTION_ID" '
  .ok == true and
  .payload.status == "connected" and
  .payload.connectionId == $connection_id and
  .payload.service == "flexport"
' "$CREATE_RECEIPT" >/dev/null
jq '{status:.payload.status,connectionId:.payload.connectionId,account:.payload.account,service:.payload.service}' "$CREATE_RECEIPT"

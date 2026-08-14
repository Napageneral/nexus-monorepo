#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 7 ]]; then
  echo "usage: $0 <artifact> <expected-sha256> <source-revision> <operation-id> <runtime-url> <token-file> <receipt-dir>" >&2
  exit 64
fi

ARTIFACT="$1"
EXPECTED_SHA256="$2"
SOURCE_REVISION="$3"
OPERATION_ID="$4"
RUNTIME_URL="${5%/}"
TOKEN_FILE="$6"
RECEIPT_DIR="$7"

if [[ "$RUNTIME_URL" != "http://127.0.0.1:"* && "$RUNTIME_URL" != "http://localhost:"* ]]; then
  echo "runtime URL must be loopback HTTP" >&2
  exit 64
fi
if [[ ! "$EXPECTED_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "expected SHA-256 is invalid" >&2
  exit 64
fi
if [[ ! "$SOURCE_REVISION" =~ ^[0-9a-f]{40}$ ]]; then
  echo "source revision is invalid" >&2
  exit 64
fi
if [[ ! "$OPERATION_ID" =~ ^[a-z0-9][a-z0-9._-]{2,127}$ ]]; then
  echo "operation id is invalid" >&2
  exit 64
fi

for command_name in curl jq sha256sum stat; do
  command -v "$command_name" >/dev/null
done
test -f "$ARTIFACT"
test -f "$TOKEN_FILE"
install -d -m 0700 "$RECEIPT_DIR"

ACTUAL_SHA256="$(sha256sum "$ARTIFACT" | cut -d' ' -f1)"
test "$ACTUAL_SHA256" = "$EXPECTED_SHA256"
ARTIFACT_SIZE="$(stat -c '%s' "$ARTIFACT")"
TOKEN="$(<"$TOKEN_FILE")"
UPLOAD_RECEIPT="$RECEIPT_DIR/upload-response.json"
INSTALL_RECEIPT="$RECEIPT_DIR/install-response.json"

curl --silent --show-error --fail-with-body \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@$ARTIFACT" \
  "$RUNTIME_URL/api/operator/packages/upload?operation_id=$OPERATION_ID&filename=mailchimp-0.2.0.tar.gz" \
  > "$UPLOAD_RECEIPT"
chmod 0600 "$UPLOAD_RECEIPT"

SERVER_PATH="$(jq -er '.staged_artifact.server_path' "$UPLOAD_RECEIPT")"
UPLOADED_SHA256="$(jq -er '.staged_artifact.sha256' "$UPLOAD_RECEIPT")"
UPLOADED_SIZE="$(jq -er '.staged_artifact.size_bytes' "$UPLOAD_RECEIPT")"
test "$UPLOADED_SHA256" = "$EXPECTED_SHA256"
test "$UPLOADED_SIZE" = "$ARTIFACT_SIZE"

REQUEST="$(jq -cn \
  --arg server_path "$SERVER_PATH" \
  --arg sha256 "$UPLOADED_SHA256" \
  --arg release_id "nexus-main-$SOURCE_REVISION" \
  --arg operation_id "$OPERATION_ID" \
  --argjson size_bytes "$UPLOADED_SIZE" \
  '{kind:"adapter",package_id:"mailchimp",version:"0.2.0",release_id:$release_id,operation_id:$operation_id,staged_artifact:{server_path:$server_path,sha256:$sha256,size_bytes:$size_bytes}}')"

curl --silent --show-error --fail-with-body \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data "$REQUEST" \
  "$RUNTIME_URL/api/operator/packages/install" \
  > "$INSTALL_RECEIPT"
chmod 0600 "$INSTALL_RECEIPT"

jq -e '.ok == true and .package_id == "mailchimp" and .version == "0.2.0" and .status == "active"' "$INSTALL_RECEIPT" >/dev/null
jq '{ok,package_id,version,status,active_release_path}' "$INSTALL_RECEIPT"

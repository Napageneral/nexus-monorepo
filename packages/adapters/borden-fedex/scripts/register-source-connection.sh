#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 3 ]]; then
  echo "usage: $0 <runtime-url> <token-file> <receipt-dir>" >&2
  exit 64
fi

RUNTIME_URL="${1%/}"
TOKEN_FILE="$2"
RECEIPT_DIR="$3"

if [[ "$RUNTIME_URL" != "http://127.0.0.1:"* && "$RUNTIME_URL" != "http://localhost:"* ]]; then
  echo "runtime URL must be loopback HTTP" >&2
  exit 64
fi
for command_name in curl jq; do
  command -v "$command_name" >/dev/null
done
test -f "$TOKEN_FILE"
install -d -m 0700 "$RECEIPT_DIR"

TOKEN="$(cat "$TOKEN_FILE")"
START_RECEIPT="$RECEIPT_DIR/custom-start-response.json"
SUBMIT_RECEIPT="$RECEIPT_DIR/custom-submit-response.json"

curl --silent --show-error --fail-with-body \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"adapter":"borden-fedex","authMethodId":"borden_fedex_external_capture","automaticActivation":false}' \
  "$RUNTIME_URL/runtime/operations/adapters.connections.custom.start" \
  > "$START_RECEIPT"
chmod 0600 "$START_RECEIPT"
jq -e '.ok == true and .payload.status == "requires_input" and .payload.service == "fedex-billing-online"' "$START_RECEIPT" >/dev/null
SESSION_ID="$(jq -er '.payload.sessionId' "$START_RECEIPT")"

REQUEST="$(jq -cn \
  --arg session_id "$SESSION_ID" \
  '{adapter:"borden-fedex",sessionId:$session_id,automaticActivation:false,payload:{account_id:"borden-production",account_label:"Borden FedEx Billing",source_custody_ref:"private://borden-fedex/artifacts",confirm_read_only_source:"REGISTER_BORDEN_FEDEX_EXTERNAL_CAPTURE_READ_ONLY"}}')"

curl --silent --show-error --fail-with-body \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data "$REQUEST" \
  "$RUNTIME_URL/runtime/operations/adapters.connections.custom.submit" \
  > "$SUBMIT_RECEIPT"
chmod 0600 "$SUBMIT_RECEIPT"
jq -e '.ok == true and .payload.status == "completed" and .payload.connectionId == "borden-production" and .payload.account == "borden-production" and .payload.service == "fedex-billing-online"' "$SUBMIT_RECEIPT" >/dev/null
jq '{ok,connectionId:.payload.connectionId,account:.payload.account,service:.payload.service,status:.payload.status,automaticActivation:.payload.automaticActivation}' "$SUBMIT_RECEIPT"

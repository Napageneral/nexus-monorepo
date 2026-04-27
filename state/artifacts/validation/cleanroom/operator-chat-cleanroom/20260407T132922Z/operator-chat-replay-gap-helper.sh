#!/usr/bin/env bash
set -euo pipefail
"/nex/node_modules/.bin/tsx" "/nex/scripts/e2e/operator-chat-cleanroom-proof.ts" gap --lane-id "lane:agent:entity-assistant"

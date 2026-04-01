# EVP-002 macOS Edge Pairing To Linux Core

## Goal

Prove a real macOS Eve edge can pair to the Linux cleanroom core and advertise
truthful connection, health, and capability state.

## Scope

- `edge.connect.start` against the Linux cleanroom
- paired edge registration and heartbeat proof
- operator-visible edge and connection state through Nex
- failure-path expectations if the edge drops

## Acceptance

- the macOS edge registers successfully with the Linux cleanroom
- heartbeats and health snapshots are visible from Nex
- operator surfaces show the correct connection and edge identity
- edge disconnect is reflected truthfully

## Validation

- runtime method proofs for edge registration and listing
- operator transcript for live pairing
- `git diff --check`

## Result

Completed on 2026-03-31.

The real macOS Eve edge paired successfully into the Linux cleanroom via:

- command:
  `HOME=/tmp/eve-edge-home-cleanroom EVE_SOURCE_CHAT_DB=/Users/tyler/Library/Messages/chat.db /tmp/eve-adapter-macos-arm64 edge.connect.start --runtime-url ws://127.0.0.1:63704 --runtime-token fresh-nex-sandbox --connection eve-7b1177ea635a-root --display-name TylerEveEdge`
- stable `sessionId`:
  `cb95443b-fa4c-49fa-9a1a-5c143943f0a5`
- connection id:
  `eve-7b1177ea635a-root`

`adapters.edges.list` on the cleanroom showed:

- `status=paired` while the edge was online
- truthful health with account `tnapathy@gmail.com`
- operator-visible session metadata:
  `session_user=tyler`, `session_uid=501`, `session_host=mac.lan`
- truthful disconnect state when the edge was stopped and `status=offline`
  appeared for the same session

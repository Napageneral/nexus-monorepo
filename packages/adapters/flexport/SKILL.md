---
name: flexport
description: Use for MoonSleep's Flexport API connection, its shipment bundle and network Records, and the four approval-gated Flexport writes.
---

# Flexport

Use this adapter only to read Flexport shipments, documents and the network into Nex Records, and to send a Flexport write that Tyler approved word for word.

- The Flexport client id and secret stay in Nex vault custody; the adapter caches one bearer token in its private state directory and sends it only to `https://api.flexport.com`.
- Shipment bundles and the network arrive as Records (`flexport_shipment_bundle`, `flexport_network`); final documents arrive as Record attachments.
- A write needs `body_json` (sent byte for byte), `body_sha256`, `go` (Tyler's words) and `confirm: "SEND_TO_FLEXPORT"`; anything less is refused before any network call. Nothing writes automatically.
- The adapter has no purchase order, Dispatch, Finance, Claims, payment or customs-filing authority; the moonsleep-v1 sync job decides what a reading means.

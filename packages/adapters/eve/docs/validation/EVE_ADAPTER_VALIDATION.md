# Eve Adapter Validation

## Proof Posture

Eve validation is layered by default:

1. prove `nex-core` behavior in a disposable Linux cleanroom
2. prove Eve watcher and warehouse behavior against fixture-backed macOS inputs
3. prove the paired edge-to-core flow with a real macOS edge
4. run final operator confirmation only after the cleanroom-backed proofs pass

Because real iMessage access is macOS-bound, any non-containerized validation
lane must explain why a Linux cleanroom cannot prove that layer.

## Recorded Proofs

Recorded on 2026-03-31:

1. Eve fixture-backed watcher, warehouse, and action proof
   - `go test ./internal/etl ./internal/livewatch ./cmd/eve-adapter`
   - Covers the fast watcher kernel, replay-safe delta ETLs, maintenance split,
     reaction removal replay safety, paired edge monitor flow, watcher-confirmed
     action reconciliation, and per-session connection defaults.
2. Nex core edge-routing and remote-surface proof
   - `pnpm exec vitest run src/api/server-methods/records.test.ts src/api/server-methods/adapter-edge-registry.test.ts src/api/server-methods/adapter-edge-data.test.ts src/runtime/domains/adapters/edge-sessions.test.ts src/capabilities/adapters/edges.test.ts src/capabilities/records/index.test.ts src/capabilities/core-runtime.test.ts src/api/runtime-operations.conformance.test.ts`
   - Covers paired edge registration, attachment ingest, canonical record reads,
     remote attachment fetch surfaces, and client-visible Eve thread surfaces
     through Nex.
3. Nex multi-connection Eve routing proof
   - `pnpm exec vitest run src/runtime/domains/adapters/edge-sessions.test.ts src/api/server-methods/adapter-capabilities.test.ts`
   - Proves same-host Eve edges remain isolated by `connection_id` and that
     dynamic Eve actions route to the matching paired session when multiple Eve
     connections are online.
4. Real Linux-core plus macOS-edge pairing proof
   - Linux cleanroom runtime:
     `ws://127.0.0.1:63704`
   - Real edge paired with stable session id
     `cb95443b-fa4c-49fa-9a1a-5c143943f0a5`
   - `adapters.edges.list` proved truthful paired and offline state, account
     projection, session metadata, and capability advertisement from the real
     macOS edge into the Linux cleanroom.
5. Real self-loop outbound and reflected inbound proof
   - Routed send:
     `EVE CLEANROOM PROOF 2026-03-31T13:03:30 self-loop 1774979830`
   - Outbound record id:
     `imessage:1CDA9A9D-77AC-489E-AEBE-57FADB2B60AD`
   - Reflected inbound record id:
     `imessage:DAA2400F-64BD-4335-A740-DB52D9091FBA`
   - Measured visibility:
     `1828ms` from request start for the outbound record and `3911ms` for the
     reflected inbound record.
6. Real attachment and artifact rewrite proof
   - Routed send:
     `EVE ATTACHMENT PROOF 2026-03-31T13:00 self-loop 1774979940`
   - Attachment record id:
     `imessage:289B1C50-9235-42C2-89E9-993F1AC9FF88`
   - Nex artifact id:
     `7452d982-fad0-40ba-9e92-79c0f795bf9a`
   - The cleanroom artifact existed at
     `/artifacts/fresh-nex-workspace/state/artifacts/tools/eve-edge-attachment/2026-03-31/1774980621212-7452d982-fad0-40ba-9e92-79c0f795bf9a.txt`
     with the expected SHA-256. No macOS path leaked into the canonical record.
7. Real restart and replay-safety proof
   - The same Eve session id survived reconnect:
     `cb95443b-fa4c-49fa-9a1a-5c143943f0a5`
   - Warehouse watermarks did not regress across reconnect
   - Proof record ids remained singletons with no duplicate canonical records
     after restart.
8. Real inline image and video parity proof
   - Linux cleanroom runtime:
     `ws://127.0.0.1:53046`
   - Real paired edge session:
     `ab110fcb-c208-4fb2-b179-b27b9071d56a`
   - Image proof token:
     `EVE INLINE IMAGE PROOF 2026-03-31T22:09Z 1774994940`
   - Image canonical media record ids:
     outbound `imessage:EDD09B5E-C8BA-4E37-9AC3-780AC7A9644D`,
     reflected inbound `imessage:C3DC54D1-D1CE-4164-8075-4B2FCA7D7B38`
   - Image Nex artifact id:
     `4897656e-2b7a-4d73-8f6d-75cdfbaceee5`
   - Video proof token:
     `EVE INLINE VIDEO PROOF 2026-03-31T22:09Z 1774994941`
   - Video canonical media record ids:
     outbound `imessage:6363D49F-9933-407F-AFCA-DD9392B568E1`,
     reflected inbound `imessage:264248D8-EB66-4640-A6F9-A7D5AEF57EFA`
   - Video Nex artifact id:
     `2e2f45db-9654-4820-9949-2ded7aa596b9`
   - `records.list` proved the attachment-bearing canonical records and
     `records.attachments.get` proved the durable Nex-managed attachment surface
     for the image artifact.
9. Sandboxed installed-Eve method-surface and routed-send proof
   - Linux cleanroom runtime:
     `ws://127.0.0.1:65295`
   - Fresh cleanroom sandbox id:
     `fd783de5-ce7e-49cc-a770-a3da08b61ea3`
   - Real paired edge session id:
     `550ed71c-5a1f-4132-958e-c40adf3a420a`
   - Routed send token:
     `EVE INSTALLED METHOD ROUTE PROOF 2026-03-31T23:33:34.529Z 1775000014529`
   - Canonical routed-send record ids:
     outbound `imessage:DBEE2342-8D5A-4650-B00C-4FDE44250112`,
     reflected inbound `imessage:EF1F04E7-889A-4213-92E0-C79D0762190D`
   - `adapters.methods` and `orientation.taxonomy` both exposed
     `imessage.send` after operator package install of Eve `0.1.0` into the
     cleanroom runtime package surface.
10. No-sweep startup-window watcher proof
   - Focused lane:
     `go test ./cmd/eve-adapter ./internal/etl ./internal/livewatch`
   - Linux cleanroom runtime:
     `ws://127.0.0.1:53893`
   - Fresh cleanroom sandbox id:
     `f92439c6-b3da-46c0-8e22-641af46e02a0`
   - Real paired edge session id:
     `c54aeed6-a40a-4c95-b7a3-d2cf63ae24e9`
   - Routed send token:
     `EVE INSTALLED METHOD ROUTE PROOF 2026-04-01T00:24:14.004Z 1775003054004`
   - Canonical routed-send record ids:
     outbound `imessage:37B2AFB3-84AB-4DD1-BFB3-0A7AC937BED9`,
     reflected inbound `imessage:A3D31DD4-0016-460C-AE2D-CD9BF491C01E`
   - Root cause was the watcher starting after startup sync. That left a real
     post-startup, pre-watch blind spot where durable rows could be baselined
     away during edge startup.
   - A later controlled timing probe corrected an earlier latency claim:
     outbound self-send rows were visible in `chat.db` about `227ms` after
     send start and `54ms` after AppleScript return, while the reflected
     inbound row arrived about `2.4s` after send start.
   - The no-sweep cleanroom rerun now passes with
     `defaultHotSweepInterval = 0`.
11. Remaining live operator proof boundary
   - The only remaining live proof gap for identity validation is a second real
     iMessage-capable identity for multi-connection validation.
   - Inline image and video proof is now complete on the AppleScript lane.

## Level 1: Static Canon Conformance

Pass when:

- the active Eve spec, taxonomy, work board, and validation docs agree on the
  same edge architecture
- package identity remains `eve`
- platform identity remains `imessage`
- no active doc still describes the superseded local-only adapter cut as canon

## Level 2: Fast Watcher Subsystem

Pass when:

- WAL and SHM changes trigger delta pulls without a broad full sync loop
- persistent `chat.db` handling survives idle periods and restart
- per-domain watermarks survive restart
- late join and attachment linkage races are covered by bounded reconciliation
- fixture-backed tests prove replay-safe ingest

## Level 3: Warehouse And Record Parity

Pass when:

- backfill and live sync emit the same canonical record model
- message, reaction, membership, attachment, and message-update coverage are
  proven through the same transform pipeline
- warehouse repair work does not require clients to read warehouse internals

## Level 4: Edge To Core Transport

Pass when:

- a macOS Eve edge can register with `nex-core`
- heartbeats, lag, and capability advertisement reach `nex-core`
- canonical records stream from edge to core
- attachment transfer reaches Nex-managed storage or durable object references
- routed commands reach the correct edge and return receipts

## Level 5: Linux Core And macOS Edge Journey

Pass when:

- a Linux-hosted Nex core can pair with a macOS Eve edge
- backfill lands in canonical Nex records
- live sync continues while the edge stays paired
- clients can read stored Eve history through Nex while the edge remains the
  only macOS iMessage authority

Current proof note:

- automated cleanroom and fixture lanes proved the watcher-side and Nex-side
  seams before operator proof
- a real macOS edge is now paired and proven against a Linux cleanroom core
- a fresh cleanroom with Eve installed into its runtime package surface now
  proves routed `imessage.send` through the runtime method catalog as well as
  watcher-confirmed canonical records
- the paired-edge no-sweep rerun now proves the startup-window watcher fix,
  keeping the interval hot sweep disabled by default
- the remaining live gap for this level is only the second-identity
  multi-connection lane

## Level 6: Remote Client Journey

Pass when:

- Android, Linux, and web clients can browse Eve threads through Nex alone
- live updates arrive through canonical Nex event surfaces
- attachments are fetched from Nex, not from the macOS filesystem
- client-visible capability truth matches the paired edge

Current proof note:

- the cleanroom now holds canonical Eve history and Nex-managed attachment
  artifacts without direct client-to-Mac access
- real image and video self-loop proof now exists through live cleanroom
  `records.list` and `records.attachments.get`, with Nex-managed artifact ids
  for both media sends
- a fresh cleanroom with Eve installed into its runtime package surface now
  exposes `imessage.send` in both `adapters.methods` and
  `orientation.taxonomy`, and can route that send through the paired edge back
  into canonical cleanroom records
- an actual Android, Linux, or web UI client has not yet been exercised in
  this validation board, so the contract is proven but the client apps
  themselves are downstream

## Level 7: Rich Action Journey

Pass when:

- send, reply, and attachment send work end to end
- richer actions such as reactions, edit, unsend, and participant changes work
  when the edge advertises support
- unsupported actions fail clearly and truthfully
- durable watcher confirmation follows local execution

Current proof note:

- real end-to-end send, attachment-send, and inline image/video send proof now
  exists under the current `applescript_send_only` executor
- observed inline media behavior under that executor is a separate text record
  plus a separate attachment-bearing record, with the attachment rewritten to a
  Nex-managed artifact while the local Messages UI renders inline media on the
  proof host
- richer executor-backed actions still remain capability-gated until a deeper
  local companion is implemented

## Level 8: Multi-User, Restart, And Recovery

Pass when:

- one Nex core can manage multiple Eve connections across hosts or user
  sessions
- edge restart does not strand the connection or corrupt watermarks
- temporary edge loss degrades live features truthfully while preserving stored
  history
- reconnect replay is idempotent and does not duplicate canonical records

Current proof note:

- the multi-connection Nex tests now prove deterministic same-host routing by
  `connection_id`
- the Eve health and connection surfaces now expose host and session metadata so
  operators can distinguish paired sessions cleanly
- single-edge restart, recovery, and replay safety are now proven with a real
  macOS edge against the Linux cleanroom
- full live multi-connection proof remains blocked pending the second real
  identity lane

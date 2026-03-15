# Eve Adapter Validation

## Level 1: Static Package Contract

Pass when:

- `packages/adapters/eve/adapter.nexus.json` exists and is valid
- package identity is `eve`
- platform identity is `imessage`
- package command resolves to the packaged adapter binary
- docs, workplan, validation, and release script are present

## Level 2: Build And Test

Pass when:

- `go test ./...` passes from the package root
- `go build ./cmd/eve-adapter` passes
- no package file still depends on the old low-level adapter authoring model

## Level 3: Package Release Validation

Pass when:

- `./scripts/package-release.sh` succeeds
- `nex package validate` succeeds for the package
- `nex package release` produces a releasable artifact

## Level 4: Contract Surface

Pass when:

- `adapter.info` reports adapter `eve` on platform `imessage`
- info exposes setup, accounts, health, monitor, backfill, and send behavior
- setup advertises a `custom_flow`
- channel capabilities match iMessage/Eve expectations

## Level 5: Local Runtime Readiness

Pass when:

- `adapter.accounts.list` returns the default local Eve account projection
- `adapter.health` returns a coherent readiness state
- missing Full Disk Access yields an actionable blocked result instead of a
  crash

## Level 6: Inbound Behavior

Pass when:

- backfill emits canonical records from the Eve warehouse
- monitor can start and emit canonical records
- messages, reactions, and membership events all map cleanly
- monitor and backfill use the same canonical record model

## Level 7: Outbound Behavior

Pass when:

- `channels.send` accepts a valid iMessage target
- text chunking behaves correctly at the text limit
- attachment send path is wired
- unsupported reply-to behavior fails cleanly

## Level 8: Hard-Cutover Proof

Pass when:

- Nex can install and execute the packaged Eve adapter
- the package works without invoking `home/projects/eve/bin/eve-adapter`
- the packaged adapter is the canonical Eve surface going forward

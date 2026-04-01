# EAP-001 Enhanced Executor Contract And Capability Truth

## Goal

Replace the fixed `applescript_send_only` posture with a real executor contract
so Eve can tell the truth about what each local action path actually supports.

## Scope

- executor interface boundary inside Eve
- current AppleScript executor as one implementation
- enhanced executor slot for richer local iMessage behavior
- capability truth for inline media, generic file send, reply, reaction, edit,
  unsend, and thread mutation
- runtime and health surfaces that stop overstating media parity

## Acceptance

- Eve has an explicit executor abstraction rather than a single hard-coded
  send path
- the current AppleScript path advertises only the capabilities it really has
- the enhanced executor seam can grow rich methods without lying through
  `supported_methods`
- runtime pairing and health surfaces expose truthful executor and capability
  data

## Validation

- focused Go tests for executor selection and capability surfaces
- paired-edge registration proof for the advertised method/capability set
- `git diff --check`

## Result

Completed on 2026-03-31.

Implemented in Eve `cmd/eve-adapter`:

- explicit action executor abstraction instead of one hard-coded send path
- current AppleScript executor as a concrete implementation
- centralized executor-derived capability truth
- more precise paired-edge and health metadata that distinguishes generic file
  attachment support from native inline media parity

Observed post-change truth for the current AppleScript executor:

- `imessage.send` remains supported
- `records.backfill.stage` remains supported
- generic file attachments remain supported
- native inline media parity was not yet proven at this ticket's close and was
  later proven in `EAP-002`
- reply, reactions, edit, unsend, and thread mutation remain unsupported

Validation run:

- `go test ./cmd/eve-adapter ./internal/etl ./internal/livewatch`
- `git diff --check -- packages/adapters/eve/cmd/eve-adapter packages/adapters/eve/docs/specs/ADAPTER_SPEC_EVE.md packages/adapters/eve/docs/workplans/README.md packages/adapters/eve/docs/workplans/eve-action-parity-board`

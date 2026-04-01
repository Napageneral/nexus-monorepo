# EAP-002 AppleScript Inline Media Reachability And Parity

## Goal

Determine whether Eve can deliver provider-native inline photo and video send
behavior through the AppleScript-reachable lane, then land truthful capability
and proof based on the result.

## Scope

- media classification for inline-photo or inline-video versus generic file send
- AppleScript-reachable executor improvements only
- watcher-confirmed durable reconciliation for inline media sends
- proof that sent media renders as a normal inline bubble in Messages if the
  AppleScript lane can support it

## Non-Goals

- UI automation
- private-API-only companion work
- pretending generic file-tile send is inline media parity

## Implementation Direction

The canonical path for this ticket is the AppleScript-reachable lane only.

Do not treat arbitrary AppleScript `send POSIX file` as inline-media parity.

If AppleScript can be made to produce a normal inline media bubble, Eve may
advertise inline-media support on AppleScript executors.

If AppleScript cannot produce that result reliably, this ticket closes with
truthful capability surfaces and the behavior remains in the private-API lane.

## Current Operator Note

On 2026-03-31, this host reported:

- `csrutil status`:
  `System Integrity Protection status: enabled.`

That does not block AppleScript work. It does block the private-API lane from
being executed on this daily-driver host.

## Acceptance

- either:
  - sending a PNG, JPEG, HEIC, MOV, or similar supported media type produces a
    normal inline media bubble instead of a file tile
  - or AppleScript inability is proven clearly enough that Eve keeps
    `supports_inline_media=false` on AppleScript executors without ambiguity
- the canonical Nex record carries a durable Nex-managed attachment reference
- no executor path falsely claims inline parity while still using `send POSIX
  file`
- operator proof shows the visible result in Messages

## Validation

- real self-loop image and video proof
- cleanroom canonical record proof
- operator-visible screenshot or golden-journey artifact
- `git diff --check`

## Result

Completed on 2026-03-31.

The AppleScript lane now stages media under the real Messages attachment root
before sending, and that staged-media path is proven for native inline image
and video bubbles on the proof host. Eve may therefore advertise
`supports_inline_media=true` on the AppleScript executor, but only for this
staged-media path rather than for arbitrary raw file sends.

Real proof captured on the operator's self-loop thread `+17072876731`:

- image proof token:
  `EVE INLINE IMAGE PROOF 2026-03-31T22:09Z 1774994940`
- video proof token:
  `EVE INLINE VIDEO PROOF 2026-03-31T22:09Z 1774994941`

Observed source and warehouse rows:

- image text rows:
  outbound `EE22FCC2-5601-41DD-8B9D-F4BD8D86B5B3`,
  reflected inbound `3C10530D-616A-47C6-96A1-E29253ED67B2`
- image media rows:
  outbound `EDD09B5E-C8BA-4E37-9AC3-780AC7A9644D`,
  reflected inbound `C3DC54D1-D1CE-4164-8075-4B2FCA7D7B38`,
  attachment `1A223FA4-49FC-4347-9FFB-539B715826F7`
- video text rows:
  outbound `4E915135-9BC4-4692-9FCC-F4FCF5CA2A2C`,
  reflected inbound `9F4762C6-B30D-403F-B47F-FC2F9C470416`
- video media rows:
  outbound `6363D49F-9933-407F-AFCA-DD9392B568E1`,
  reflected inbound `264248D8-EB66-4640-A6F9-A7D5AEF57EFA`,
  attachment `4E927538-1F40-4F11-AA26-AA5CE998D172`

Canonical cleanroom proof against `ws://127.0.0.1:53046` with paired session
`ab110fcb-c208-4fb2-b179-b27b9071d56a`:

- `records.list` returned both text records and attachment-bearing records for
  the image and video self-loop
- the image attachment was rewritten to Nex artifact
  `4897656e-2b7a-4d73-8f6d-75cdfbaceee5`
- the video attachment was rewritten to Nex artifact
  `2e2f45db-9654-4820-9949-2ded7aa596b9`
- `records.attachments.get` succeeded for image attachment
  `imessage:attachment:1A223FA4-49FC-4347-9FFB-539B715826F7`

Golden-journey evidence for this ticket is the combination of:

- operator-visible local Messages confirmation on the proof host
- `chat.db` rows showing the staged inline media sends
- Eve warehouse rows preserving the attachment metadata
- live cleanroom `records.list` and `records.attachments.get` output showing
  Nex-managed artifact references

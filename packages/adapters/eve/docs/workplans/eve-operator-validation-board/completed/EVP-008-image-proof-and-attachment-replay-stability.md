# EVP-008 Image Proof And Attachment Replay Stability

## Goal

Finish a real image and video self-loop proof all the way through canonical Nex
records and stabilize the copied-home edge harness so historical attachment
replay does not strand the edge offline.

## Result

Completed on 2026-03-31.

The copied-home proof edge remained paired long enough to land both real inline
image and inline video self-loop sends into canonical cleanroom records, with
their attachments rewritten to Nex-managed artifacts.

Stable proof session:

- paired session id:
  `ab110fcb-c208-4fb2-b179-b27b9071d56a`
- cleanroom runtime:
  `ws://127.0.0.1:53046`

Image proof:

- token:
  `EVE INLINE IMAGE PROOF 2026-03-31T22:09Z 1774994940`
- outbound media record:
  `imessage:EDD09B5E-C8BA-4E37-9AC3-780AC7A9644D`
- reflected inbound media record:
  `imessage:C3DC54D1-D1CE-4164-8075-4B2FCA7D7B38`
- attachment id:
  `imessage:attachment:1A223FA4-49FC-4347-9FFB-539B715826F7`
- Nex artifact id:
  `4897656e-2b7a-4d73-8f6d-75cdfbaceee5`

Video proof:

- token:
  `EVE INLINE VIDEO PROOF 2026-03-31T22:09Z 1774994941`
- outbound media record:
  `imessage:6363D49F-9933-407F-AFCA-DD9392B568E1`
- reflected inbound media record:
  `imessage:264248D8-EB66-4640-A6F9-A7D5AEF57EFA`
- attachment id:
  `imessage:attachment:4E927538-1F40-4F11-AA26-AA5CE998D172`
- Nex artifact id:
  `2e2f45db-9654-4820-9949-2ded7aa596b9`

The cleanroom `records.list` surface returned both text rows and
attachment-bearing rows for the proof sends, and `records.attachments.get`
resolved the image artifact successfully.

The harness was stabilized by the earlier Eve changes in this board slice:

- staging AppleScript media under the real Messages attachment root
- chunking attachment uploads under the runtime payload cap
- degrading missing historical local files to metadata-only attachment replay
  instead of aborting the edge
- hydrating older source messages referenced by recent reactions so replay no
  longer dies on the same foreign-key cycle

## Acceptance

- a real PNG self-loop landed in canonical cleanroom records
- a real MOV self-loop landed in canonical cleanroom records
- both attachments were rewritten to Nex-managed artifact references
- the proof edge remained paired through the replay window needed for the
  canonical proof
- the harness no longer depended on fragile copied-home attachment path luck

## Validation

- warehouse proof for image and video rows and their attachment metadata
- canonical cleanroom `records.list` proof for the image and video events
- `records.attachments.get` proof for the image artifact surface
- paired-edge stability proof through the replay window
- `git diff --check`

# Eve Action Execution Boundaries

## Purpose

This spec defines the only two action-execution classes Eve is allowed to
reason about for iMessage parity work:

1. AppleScript-reachable
2. private-API-required

UI automation is intentionally out of scope for Eve's canonical architecture.

## Rules

1. Eve must not describe a behavior as supported unless the paired executor can
   perform it truthfully on that host.
2. Eve must not use UI automation as the canonical answer for iMessage parity.
3. AppleScript-reachable work is the only active parity lane on a daily-driver
   Mac with SIP enabled.
4. Private-API-required work is parked until a dedicated parity host is
   available.
5. Capability surfaces must expose the difference between native inline media
   support and generic file-attachment support.

## Classification Matrix

| Behavior | Current Eve posture | Execution class | Notes |
|---|---|---|---|
| Text send | supported | AppleScript-reachable | Current Eve already supports this through Messages automation. |
| Generic file attachment send | supported | AppleScript-reachable | Current Eve sends files through `send POSIX file ...`. |
| Native inline photo or video send | supported | AppleScript-reachable | Proven on 2026-03-31 for Eve's staged-media path under the real Messages attachment root. Arbitrary raw file sends do not qualify. |
| Reply threading to a specific message | unsupported | private-API-required | Requires message-targeted provider execution, not just chat-targeted send. |
| Reaction add | unsupported | private-API-required | Tapbacks are outside the Messages AppleScript command surface. |
| Reaction remove | unsupported | private-API-required | Same boundary as reaction add. |
| Edit | unsupported | private-API-required | Requires provider-native mutation of an existing outbound message. |
| Unsend | unsupported | private-API-required | Requires provider-native message retraction. |
| Thread create with durable parity semantics | unsupported | private-API-required | AppleScript exposes send-to-chat/send-to-participant, not a trustworthy thread-mutation API. |
| Thread rename | unsupported | private-API-required | Messages scripting surface exposes chat names read-only. |
| Add participants | unsupported | private-API-required | Messages scripting surface exposes participants read-only. |
| Remove participants | unsupported | private-API-required | Same boundary as add participants. |
| Leave thread | unsupported | private-API-required | No canonical AppleScript command exists for this. |
| Typing indicator mutation | unsupported | private-API-required | No canonical AppleScript command exists for this. |
| Read or unread mutation | unsupported | private-API-required | No canonical AppleScript command exists for this. |

## AppleScript Lane

The active AppleScript lane is:

1. keep text send solid
2. keep generic file attachment send solid
3. keep native inline photo and video parity tied to the staged-media path that
   was proven live on 2026-03-31
4. advertise capability truth based on proof, not optimism
5. lower capability truth again immediately if the staged-media path regresses
   to generic file tiles on a future host or executor

Eve now advertises `supports_inline_media=true` on the AppleScript executor
because the staged-media path produced real inline image and video bubbles plus
cleanroom canonical records on 2026-03-31. That proof does not generalize to
arbitrary non-staged file sends.

## Private-API Lane

The parked private-API lane includes:

1. reply threading
2. reactions
3. edit
4. unsend
5. thread mutations
6. any other provider-native behavior that requires direct message-targeted or
   chat-targeted internal APIs beyond the public Messages AppleScript surface

This lane resumes only when a dedicated parity host is available for operator
setup and proof.

## Board Mapping

- `EAP-001`: completed capability-truth seam
- `EAP-002`: completed AppleScript inline-media reachability lane
- `EAP-003` through `EAP-006`: blocked on a dedicated private-API parity host

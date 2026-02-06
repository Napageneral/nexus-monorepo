# Slack Adapter — Upstream Review

**Last Updated:** 2026-02-06  
**Nexus Tool:** TBD (`slack-cli`)  
**Upstream:** `src/slack/` (65 files, full implementation)

---

## Current State

No standalone Nexus tool. Full implementation in OpenClaw using `@slack/bolt`. Feature-complete: Socket Mode + HTTP monitoring, send with mrkdwn formatting, threading, reactions, edit, delete, pins, slash commands.

---

## Protocol Compliance

| Protocol Command | Upstream Equivalent | Status | Notes |
|-----------------|---------------------|--------|-------|
| **`info`** | — | Missing | No self-describe. |
| **`monitor`** | `monitorSlackProvider()` | Logic exists | Socket Mode or HTTP. Handles messages, reactions, pins, members, channels. |
| **`send`** | `sendMessageSlack()` | Logic exists | Text with mrkdwn, media via `files.uploadV2`, threading. |
| **`backfill`** | `readSlackMessages()` | Logic exists | `conversations.history` and `conversations.replies`. Not exposed as backfill command. |
| **`health`** | `probeSlack()` | Logic exists | `auth.test()` API call. Returns bot/team info, latency. |
| **`accounts`** | `accounts.ts` | Logic exists | Multi-account resolution, token management. |
| **`react`** | `reactSlackMessage()` | Logic exists | `reactions.add`. |
| **`edit`** | `editSlackMessage()` | Logic exists | `chat.update`. |
| **`delete`** | `deleteSlackMessage()` | Logic exists | `chat.delete`. |
| **`poll`** | — | N/A | Slack doesn't have native polls. |

### Current Compliance Level: **None** (no standalone adapter)
### All Logic Available For: **Complete + Extended**

---

## Key Implementation Details

### Dual Monitor Modes
- **Socket Mode:** WebSocket via `appToken` + `botToken`. No public endpoint needed. Default.
- **HTTP Mode:** Webhook receiver with `signingSecret` + `botToken`. Needs public URL.

### mrkdwn Formatting
`format.ts` provides `markdownToSlackMrkdwn()` and `markdownToSlackMrkdwnChunks()`. Converts standard markdown to Slack's flavor: `*bold*` (not `**bold**`), `_italic_`, `~strikethrough~`. Escapes `&`, `<`, `>` while preserving Slack tokens (`<@user>`, `<#channel>`, links).

### Thread Handling
Comprehensive: `thread_ts` for replies, thread starter resolution (cached), reply-to modes (off/first/all), thread session key inheritance.

### Rich Actions
`actions.ts` wraps the full Slack API surface: send, edit, delete, react, pin/unpin, read messages, list reactions/pins, member info, emoji list.

### Health Probe
`probe.ts` calls `auth.test()` — returns bot name, team, OK status, and latency.

---

## Extraction Difficulty

**Extractable as-is (light deps):** `actions.ts` (API wrappers), `client.ts` (WebClient factory), `format.ts` (mrkdwn conversion), `targets.ts` (target parsing), `probe.ts` (health), `threading.ts` (thread resolution), type definitions.

**Needs rewriting:** Monitor provider (remove OpenClaw config/routing, emit NexusEvent JSONL), message normalization (`prepareSlackMessage()` at 584 lines — heavily coupled), media handling (replace OpenClaw media store), account management CLI.

Similar extraction profile to Discord. The core API layer is clean; the monitor normalization layer is deeply entangled with OpenClaw.

---

## Estimated Effort

| Task | Effort | Priority |
|------|--------|----------|
| Extract API layer (actions, format, threading) | 4-8 hours | High |
| Build CLI interface | 4-8 hours | High |
| Rewrite monitor for NexusEvent JSONL | 8-12 hours | High |
| Send CLI with mrkdwn formatting | 4-8 hours | High |
| Backfill via `conversations.history` | 4-8 hours | Medium |
| Health CLI (wrap probe.ts) | 1-2 hours | Medium |
| Account management CLI | 2-4 hours | Medium |
| Extended: react, edit, delete, pin CLIs | 2-4 hours | Low |
| **Total to Complete + Extended** | **~35-55 hours** | |

---

## Related
- `CHANNEL_SPEC.md` — Slack capabilities, mrkdwn formatting, Block Kit
- `../../ADAPTER_SYSTEM.md` — Protocol definition

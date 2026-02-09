# Discord Adapter — Upstream Review

**Last Updated:** 2026-02-06  
**Nexus Tool:** TBD (`discord-cli`)  
**Upstream:** `src/discord/` (66 files, full implementation)

---

## Current State

No standalone Nexus tool exists for Discord. The entire implementation lives inside the OpenClaw monolith at `src/discord/`. It's feature-complete but tightly coupled to OpenClaw internals.

---

## Protocol Compliance (What Upstream Provides)

| Protocol Command | Upstream Equivalent | Status | Notes |
|-----------------|---------------------|--------|-------|
| **`info`** | — | Missing | No self-describe. Capabilities exist but not exposed. |
| **`monitor`** | `monitorDiscordProvider()` | Logic exists | Gateway via `@buape/carbon`. Emits `MsgContext`, not NexusEvent. |
| **`send`** | `sendMessageDiscord()` | Logic exists | Full send with chunking, table conversion, embeds, threading. Not a CLI. |
| **`backfill`** | `readMessagesDiscord()`, `searchMessagesDiscord()` | Logic exists | Message history retrieval functions exist. No JSONL output. |
| **`health`** | — | Missing | Gateway connection state exists internally but not exposed. |
| **`accounts`** | `accounts.ts` | Logic exists | `listDiscordAccountIds()`, `resolveDiscordAccount()`. Not a CLI. |
| **`react`** | `reactMessageDiscord()` | Logic exists | Add and remove reactions. Not a CLI. |
| **`edit`** | `editMessageDiscord()` | Logic exists | Full edit support. Not a CLI. |
| **`delete`** | `deleteMessageDiscord()` | Logic exists | Full delete support. Not a CLI. |
| **`poll`** | `sendPollDiscord()` | Logic exists | Poll creation. Not a CLI. |

### Current Compliance Level: **None** (no standalone adapter exists)  
### All Logic Available For: **Complete + Extended** (everything is implemented, just embedded)

---

## What Exists (Logic Available for Extraction)

### Inbound / Monitor
- **Gateway connection** via `@buape/carbon` with GatewayPlugin
- **Intents:** Guilds, GuildMessages, MessageContent, DirectMessages, Reactions (optional: Presence, Members)
- **Event listeners:** MessageCreate, ReactionAdd, ReactionRemove, PresenceUpdate
- **Allowlist/access control:** Guild, channel, user, DM policy (open/pairing/disabled)
- **Thread handling:** Detection, auto-threading, thread parent binding inheritance
- **Message normalization:** Content extraction from text, attachments, embeds, forwarded messages
- **Debouncing:** Message handler factory with debounce support
- **Mention gating:** Require @mention in guild channels (configurable)

**Key files:**
- `monitor/provider.ts` — Gateway setup, main monitor
- `monitor/message-handler.*.ts` — Preflight → process → dispatch
- `monitor/listeners.ts` — Event listener wrappers
- `monitor/allow-list.ts` — Allowlist resolution
- `monitor/threading.ts` — Thread detection
- `monitor/message-utils.ts` — Text extraction, media handling

### Outbound / Send
- **Text sending** with chunking (2000 char limit)
- **Table conversion:** `convertMarkdownTables()` — Markdown tables → code blocks
- **Chunking:** `chunkDiscordTextWithMode()` — Length and newline modes, preserves code fences
- **Threading:** Reply references, auto-thread creation
- **Embeds:** Full embed support (title, description, fields, color)
- **Media:** Attachment upload
- **Reactions:** Add/remove emoji reactions
- **Edit/Delete:** Full message mutation
- **Polls:** Poll creation
- **Guild operations:** Channel info, member info, ban, permissions

**Key files:**
- `send.outbound.ts` — Main send entry points
- `chunk.ts` — Chunking logic (most extractable)
- `send.shared.ts` — Client creation, error handling
- `send.messages.ts` — Message CRUD
- `send.reactions.ts` — Reaction operations
- `send.guild.ts` — Guild operations

### Account Management
- `accounts.ts` — Multi-account resolution: `listDiscordAccountIds()`, `resolveDiscordAccount()`
- Token normalization in `token.ts`
- Target parsing in `targets.ts`

---

## Dependencies on OpenClaw Internals

### Heavy (need extraction/rewrite)
- `../../auto-reply/*` — Reply dispatch, chunking helpers, history, context building
- `../../config/config.js` — `loadConfig()`, `OpenClawConfig` types
- `../../routing/*` — Route resolution, session keys
- `../../channels/*` — Allowlist utils, logging, session recording
- `../../agents/identity.js` — Agent config, ack reactions
- `../../infra/*` — Retry policies, errors, system events
- `../../media/*` — Media fetching/storage
- `../../pairing/*` — DM pairing logic
- `../../security/channel-metadata.js` — Untrusted metadata handling

### Moderate (can be abstracted)
- `../../logging/*` — Logging utilities
- `../../markdown/tables.js` — Table conversion (widely useful)

### Light (extractable as-is)
- `chunk.ts` — Standalone chunking logic
- `send.shared.ts` — Client creation (needs token abstraction)
- `send.messages.ts` — Message CRUD operations
- `send.reactions.ts` — Reaction operations
- `monitor/threading.ts` — Thread detection (standalone)

### External (keep)
- `@buape/carbon` — Discord Gateway client
- `discord-api-types/v10` — TypeScript types

---

## What Needs to Be Built

### CLI Interface
The entire Discord implementation is library code, not a CLI. Need to build:
- Command parser (info, monitor, send, backfill, health, accounts, react, edit, delete)
- Token/credential resolution from Nexus credential store
- JSONL output for monitor and backfill
- DeliveryResult JSON for send operations

### NexusEvent Normalization
Current code normalizes to OpenClaw `MsgContext`. Need a normalization layer that produces `NexusEvent`:

```
MsgContext fields → NexusEvent fields:
  Provider → channel ("discord")
  SenderId → sender_id
  SenderName → sender_name
  To → peer_id
  ChatType → peer_kind ("dm" | "group")
  MessageSid → event_id prefix
  RawBody → content
```

### Config Abstraction
Replace `loadConfig()` with:
- Account/token from Nexus credential system
- Adapter-specific config (guild allowlists, DM policy, etc.)
- Can be in adapter's own config file or Nexus `nex.yaml`

---

## Extraction Strategy

### Option A: Port to Standalone TypeScript CLI
Extract Discord logic from OpenClaw into a new `discord-cli` package:
1. Copy core files (send, monitor, chunk, accounts)
2. Replace OpenClaw imports with standalone equivalents
3. Add CLI layer (commander/yargs)
4. Add NexusEvent normalization
5. Publish as standalone npm package

**Pros:** Reuses battle-tested TypeScript code. Least rewrite.  
**Cons:** Still TypeScript, inherits node ecosystem. Large dependency tree from `@buape/carbon`.

### Option B: Rewrite in Go
Build `discord-cli` from scratch in Go using `discordgo`:
1. Implement adapter protocol commands
2. Gateway connection for monitoring
3. REST API for send/react/edit/delete
4. NexusEvent output natively

**Pros:** Single binary, no runtime deps, consistent with eve/gog.  
**Cons:** Most work. Loses upstream chunking/formatting logic.

### Option C: Thin Wrapper
Create a minimal wrapper that imports OpenClaw's Discord module and exposes it as CLI:
1. Import `@openclaw/discord` (if extractable as package)
2. Add CLI commands that call the existing functions
3. Add NexusEvent normalization on top

**Pros:** Fastest path.  
**Cons:** Depends on OpenClaw as dependency. Fragile coupling.

**Recommendation:** Option A for core channels. Port the key logic, cut the OpenClaw dependencies.

---

## Estimated Effort

| Task | Effort | Priority |
|------|--------|----------|
| Extract chunking logic (`chunk.ts`) | 2-4 hours | High |
| Extract send functions (text, media, embeds) | 8-12 hours | High |
| Extract monitor/gateway logic | 8-12 hours | High |
| Build CLI interface | 4-8 hours | High |
| NexusEvent normalization layer | 4-8 hours | High |
| Config/credential abstraction | 4-8 hours | High |
| Backfill via message history | 4-8 hours | Medium |
| Health command | 2-4 hours | Medium |
| Extended: react, edit, delete, poll CLIs | 4-8 hours | Low |
| **Total to Complete + Extended** | **~50-80 hours** | |

Discord is the most work because there's no existing standalone tool. But the logic is all there — it's an extraction and adaptation job, not a design job.

---

## Related
- `CHANNEL_SPEC.md` — Discord capabilities, formatting, chunking rules
- `../../ADAPTER_SYSTEM.md` — Protocol definition
- `../../upstream/CHANNEL_INVENTORY.md` — Full upstream inventory
- `../../upstream/OPENCLAW_INBOUND.md` — Inbound dispatch flow
- `../../upstream/OPENCLAW_OUTBOUND.md` — Outbound delivery flow

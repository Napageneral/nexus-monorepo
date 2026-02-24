# Adapter SDK (TypeScript)

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-17  
**Related:** `ADAPTER_SDK.md`, `ADAPTER_SYSTEM.md`, `INBOUND_INTERFACE.md`, `OUTBOUND_INTERFACE.md`

---

## Overview

The TypeScript Adapter SDK (`@nexus/adapter-sdk`) provides shared infrastructure for building Nexus adapters in Node/TypeScript.

**Goal:** Keep Discord/Telegram/Slack/WhatsApp adapters as *external processes* while avoiding per-adapter reimplementation of:

- CLI parsing and protocol routing (`info`, `monitor`, `send`, `stream`, …)
- JSON / JSONL I/O rules (stdout contract)
- Signal handling and cancellation
- Stream protocol parsing + delivery status emission
- Common text chunking utilities
- Runtime context loading (adapter config + injected credentials)

Adapters remain responsible for platform-specific work: connecting to APIs, normalizing inbound events, and performing outbound sends.

---

## Non-Goals

- Defining the adapter protocol (that lives in `ADAPTER_SYSTEM.md`)
- Implementing any platform logic (Discord Gateway, Telegram Bot API, etc.)
- In-process integrations inside NEX

---

## Process Contract

- **Stdout:** reserved for machine-readable protocol output only (JSON for single responses, JSONL for streams).
- **Stderr:** logs only (human-readable).
- **Exit codes:**
  - `0` success / clean shutdown
  - `1` fatal error / protocol misuse

The SDK MUST ensure accidental `console.log()` does not pollute stdout (e.g. by providing a logger that writes to stderr and by documenting the rule aggressively).

---

## Runtime Context (Config + Credentials)

NEX is responsible for resolving credential pointers (Keychain/env/1Password/etc.) into usable secrets and injecting them into adapter processes.

The TS SDK will standardize a single injection mechanism:

- `NEXUS_ADAPTER_CONTEXT_PATH=/path/to/runtime-context.json`

### Runtime Context File Shape

```json
{
  "channel": "discord",
  "account_id": "echo-bot",
  "config": {
    "dm_policy": "allow_owner_only",
    "guild_allowlist": ["1234567890"]
  },
  "credential": {
    "kind": "token",
    "value": "REDACTED"
  }
}
```

**Notes:**

- This file contains plaintext secrets and MUST be created with `0600` permissions.
- Secrets MUST NOT be passed via argv flags.
- The SDK provides `loadRuntimeContext()` to parse and validate this shape.

---

## Public API (Proposed)

### `runAdapter()`

```ts
import { runAdapter } from "@nexus/adapter-sdk";

runAdapter({
  info() {
    return {
      channel: "discord",
      name: "discord-adapter",
      version: "0.1.0",
      supports: ["monitor", "send", "stream", "health", "accounts"],
      credential_service: "discord",
      multi_account: true,
      channel_capabilities: { /* ... */ },
    };
  },

  async monitor(ctx, { account }, emit) {
    // connect gateway, emit(NexusEvent) for each inbound message
  },

  async send(ctx, req) {
    // perform platform send; return DeliveryResult
    return { success: true, message_ids: ["..."], chunks_sent: 1 };
  },

  stream: {
    async onStart(ctx, e) { /* create draft message */ },
    async onToken(ctx, e) { /* buffer + throttled edit */ },
    async onEnd(ctx, e) { /* finalize */ },
  },
});
```

### Handler Signatures

```ts
type AdapterContext = {
  signal: AbortSignal;              // cancelled on SIGTERM/SIGINT
  runtime: AdapterRuntimeContext;   // injected credential + config
  log: AdapterLogger;               // stderr logger
};

type AdapterDefinition = {
  info(): AdapterInfo;

  monitor?: (ctx: AdapterContext, args: { account: string }, emit: (e: NexusEvent) => void) => Promise<void>;
  send?: (ctx: AdapterContext, req: SendRequest) => Promise<DeliveryResult>;
  backfill?: (ctx: AdapterContext, args: { account: string; since: Date }, emit: (e: NexusEvent) => void) => Promise<void>;
  health?: (ctx: AdapterContext, args: { account: string }) => Promise<AdapterHealth>;
  accounts?: (ctx: AdapterContext) => Promise<AdapterAccount[]>;

  stream?: StreamHandlers;
};
```

### `SendRequest`

`send` MUST support threading + replies:

```ts
type SendRequest = {
  account: string;
  to: string;
  text?: string;
  media?: string;
  caption?: string;
  thread_id?: string;
  reply_to_id?: string;
};
```

CLI mapping is defined in `OUTBOUND_TARGETING.md`.

---

## CLI Router (SDK Responsibility)

The SDK parses:

- `info`
- `monitor --account <id> --format jsonl`
- `send --account <id> --to <target> [--thread <thread_id>] [--reply-to <reply_to_id>] --text ...`
- `backfill --account <id> --since <ISO-date> --format jsonl`
- `health --account <id>`
- `accounts list`
- `stream --account <id> --format jsonl`

The SDK validates required flags and returns structured JSON errors instead of throwing raw stacks.

---

## JSON / JSONL Helpers

The SDK provides:

- `writeJSON(value)` for single JSON stdout responses
- `writeJSONL(value)` for JSONL emission (monitor/backfill/stream statuses)
- `readJSONL(stream)` for parsing stdin stream events

Rules:

- One JSON object per line for JSONL.
- No pretty-printing.
- UTF-8 only.

---

## Stream Protocol Helper

The SDK implements:

- Reading `StreamEvent` JSONL from stdin
- Dispatch to typed handlers
- Emitting `AdapterStreamStatus` JSONL on stdout
- Ensuring cancellation on SIGTERM

Adapters implement only the platform-specific behavior (create message, edit message, finalize).

---

## Text Chunking Utilities

The SDK should provide a baseline chunker:

- Break preference: paragraph > line > sentence > word
- Preserve fenced code blocks (do not split mid-fence). If a single code block exceeds the limit, split by closing and reopening the fence.
- Optional: table conversion helpers shared across channels

Per-channel chunking quirks (Discord 2000-char hard limit, Telegram caption limits, etc.) remain adapter responsibility, but the SDK should provide common primitives.

---

## Test Kit (Recommended)

Provide a contract test harness usable in adapter repos:

- `adapterContractTest({ command })` runs:
  - `info` parse + schema validation
  - `send` happy-path dry run (adapter may support `--dry-run` later)
  - `stream` protocol smoke (if supported)

This is not required for first release but strongly recommended to keep adapters compliant.

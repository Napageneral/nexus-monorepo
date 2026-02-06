# OpenClaw Infrastructure Layer

This document covers the core infrastructure components in OpenClaw's `src/infra/` directory, including outbound message delivery, heartbeat scheduling, device pairing, exec approvals, and infrastructure utilities.

---

## Table of Contents

1. [Outbound Message Delivery](#outbound-message-delivery)
2. [Heartbeat System](#heartbeat-system)
3. [Device Pairing](#device-pairing)
4. [Exec Approvals](#exec-approvals)
5. [Infrastructure Utilities](#infrastructure-utilities)

---

## Outbound Message Delivery

The outbound subsystem handles delivering messages from agents to external channels (Telegram, Discord, Slack, Signal, WhatsApp, iMessage, etc.).

### Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│  Agent Reply    │────▶│  Payload         │────▶│  Channel Handler  │
│  (ReplyPayload) │     │  Normalization   │     │  (sendText/Media) │
└─────────────────┘     └──────────────────┘     └───────────────────┘
                                                          │
                        ┌──────────────────┐              │
                        │  Target Resolver │◀─────────────┘
                        │  (directory/id)  │
                        └──────────────────┘
                                 │
                        ┌────────▼─────────┐
                        │  Channel Plugin  │
                        │  Outbound Adapter│
                        └──────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `outbound/deliver.ts` | Main delivery orchestration |
| `outbound/payloads.ts` | Payload normalization and parsing |
| `outbound/target-resolver.ts` | Resolve human-friendly names to channel IDs |
| `outbound/channel-selection.ts` | Select configured message channels |
| `outbound/channel-target.ts` | Channel target description utilities |
| `outbound/agent-delivery.ts` | Agent-level delivery planning |
| `outbound/envelope.ts` | Result envelope construction |

### Core Types

```typescript
// Main delivery result type
type OutboundDeliveryResult = {
  channel: OutboundChannel;
  messageId: string;
  chatId?: string;
  channelId?: string;
  roomId?: string;
  conversationId?: string;
  timestamp?: number;
  toJid?: string;
  pollId?: string;
  meta?: Record<string, unknown>;
};

// Normalized payload for delivery
type NormalizedOutboundPayload = {
  text: string;
  mediaUrls: string[];
  channelData?: Record<string, unknown>;
};

// Channel handler interface
type ChannelHandler = {
  chunker: Chunker | null;
  chunkerMode?: "text" | "markdown";
  textChunkLimit?: number;
  sendPayload?: (payload: ReplyPayload) => Promise<OutboundDeliveryResult>;
  sendText: (text: string) => Promise<OutboundDeliveryResult>;
  sendMedia: (caption: string, mediaUrl: string) => Promise<OutboundDeliveryResult>;
};
```

### Delivery Flow

#### `deliverOutboundPayloads()`

The main entry point for outbound delivery:

```typescript
async function deliverOutboundPayloads(params: {
  cfg: OpenClawConfig;
  channel: Exclude<OutboundChannel, "none">;
  to: string;
  accountId?: string;
  payloads: ReplyPayload[];
  replyToId?: string | null;
  threadId?: string | number | null;
  deps?: OutboundSendDeps;
  gifPlayback?: boolean;
  abortSignal?: AbortSignal;
  bestEffort?: boolean;
  onError?: (err: unknown, payload: NormalizedOutboundPayload) => void;
  onPayload?: (payload: NormalizedOutboundPayload) => void;
  mirror?: { sessionKey: string; agentId?: string; text?: string; mediaUrls?: string[] };
}): Promise<OutboundDeliveryResult[]>
```

**Key behaviors:**
1. Creates a channel handler via `loadChannelOutboundAdapter()`
2. Resolves chunking limits per channel
3. Normalizes payloads (extracts MEDIA directives, merges media URLs)
4. For Signal: applies markdown-to-styled-text conversion
5. Sends text chunks respecting channel limits
6. Handles media attachments with captions
7. Optionally mirrors to session transcript

### Target Resolution

The target resolver converts human-friendly identifiers to channel-specific IDs:

```typescript
type ResolvedMessagingTarget = {
  to: string;
  kind: TargetResolveKind;  // "user" | "group" | "channel"
  display?: string;
  source: "normalized" | "directory";
};

async function resolveMessagingTarget(params: {
  cfg: OpenClawConfig;
  channel: ChannelId;
  input: string;
  accountId?: string | null;
  preferredKind?: TargetResolveKind;
  resolveAmbiguous?: "error" | "best" | "first";
}): Promise<ResolveMessagingTargetResult>
```

**Resolution strategies:**
1. Direct ID detection (prefixes like `channel:`, `user:`, `@`, `#`)
2. Directory lookup (cached with 30-minute TTL)
3. Live directory fetch on cache miss
4. Ambiguity resolution (error, best-ranked, or first match)

### Payload Normalization

```typescript
// Extract and merge media from text directives
function normalizeReplyPayloadsForDelivery(payloads: ReplyPayload[]): ReplyPayload[]

// Key directive parsing:
// - MEDIA:url - extracts media URLs from text
// - SILENT - suppresses delivery
// - REPLY_TO:id - threading support
// - VOICE - audio as voice message
```

### Agent Delivery Planning

```typescript
type AgentDeliveryPlan = {
  baseDelivery: SessionDeliveryTarget;
  resolvedChannel: GatewayMessageChannel;
  resolvedTo?: string;
  resolvedAccountId?: string;
  resolvedThreadId?: string | number;
  deliveryTargetMode?: ChannelOutboundTargetMode;
};

function resolveAgentDeliveryPlan(params: {
  sessionEntry?: SessionEntry;
  requestedChannel?: string;
  explicitTo?: string;
  explicitThreadId?: string | number;
  accountId?: string;
  wantsDelivery: boolean;
}): AgentDeliveryPlan
```

---

## Heartbeat System

The heartbeat system enables periodic agent check-ins and proactive notifications.

### Architecture Overview

```
┌──────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│  Heartbeat       │────▶│  Run Once        │────▶│  Outbound         │
│  Runner          │     │  (LLM prompt)    │     │  Delivery         │
└──────────────────┘     └──────────────────┘     └───────────────────┘
        │                        │
        │                        ▼
        │                ┌──────────────────┐
        │                │  HEARTBEAT_OK?   │
        │                │  (skip delivery) │
        │                └──────────────────┘
        │
        ▼
┌──────────────────┐
│  Wake Handler    │
│  (coalesced)     │
└──────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `heartbeat-runner.ts` | Main heartbeat scheduler and executor |
| `heartbeat-events.ts` | Heartbeat event emission and listeners |
| `heartbeat-visibility.ts` | Per-channel visibility settings |
| `heartbeat-wake.ts` | Wake handler for on-demand heartbeats |

### Core Types

```typescript
type HeartbeatSummary = {
  enabled: boolean;
  every: string;           // e.g., "5m", "1h"
  everyMs: number | null;
  prompt: string;
  target: string;          // "last" or explicit target
  model?: string;
  ackMaxChars: number;
};

type HeartbeatRunResult =
  | { status: "ran"; durationMs: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

type HeartbeatEventPayload = {
  ts: number;
  status: "sent" | "ok-empty" | "ok-token" | "skipped" | "failed";
  to?: string;
  preview?: string;
  durationMs?: number;
  hasMedia?: boolean;
  reason?: string;
  channel?: string;
  silent?: boolean;
  indicatorType?: HeartbeatIndicatorType;
};
```

### Heartbeat Runner

```typescript
function startHeartbeatRunner(opts: {
  cfg?: OpenClawConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  runOnce?: typeof runHeartbeatOnce;
}): HeartbeatRunner

// Returns handle with:
// - stop(): void
// - updateConfig(cfg): void
```

### `runHeartbeatOnce()` Flow

1. **Guard checks:**
   - Heartbeat enabled for agent?
   - Within active hours?
   - Queue empty (no pending requests)?
   - HEARTBEAT.md has content?

2. **Session resolution:**
   - Load session store
   - Resolve delivery target (channel, to, accountId)

3. **LLM invocation:**
   - Prompt includes heartbeat file content
   - Special prompt for exec completion events

4. **Response handling:**
   - `HEARTBEAT_OK` → skip delivery (optionally send indicator)
   - Content → deliver to target channel
   - Duplicate detection (24h window)

5. **Visibility controls:**
   - `showOk`: Send HEARTBEAT_OK messages
   - `showAlerts`: Send content messages
   - `useIndicator`: Emit indicator events

### Heartbeat Visibility

```typescript
type ResolvedHeartbeatVisibility = {
  showOk: boolean;      // Default: false
  showAlerts: boolean;  // Default: true
  useIndicator: boolean; // Default: true
};

// Precedence: per-account > per-channel > channel-defaults > global defaults
function resolveHeartbeatVisibility(params: {
  cfg: OpenClawConfig;
  channel: GatewayMessageChannel;
  accountId?: string;
}): ResolvedHeartbeatVisibility
```

### Wake Handler

The wake system coalesces rapid heartbeat requests:

```typescript
// Default coalesce: 250ms
// Retry on busy queue: 1000ms
function requestHeartbeatNow(opts?: { reason?: string; coalesceMs?: number }): void

function setHeartbeatWakeHandler(handler: HeartbeatWakeHandler | null): void
```

---

## Device Pairing

Device pairing enables secure authentication between clients and the gateway.

### Architecture Overview

```
┌──────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│  Client Device   │────▶│  Pairing Request │────▶│  Pending Queue    │
│  (deviceId, key) │     │  (5min TTL)      │     │  (approval wait)  │
└──────────────────┘     └──────────────────┘     └───────────────────┘
                                                          │
                                                   ┌──────▼──────┐
                                                   │  Approval   │
                                                   │  (manual)   │
                                                   └──────┬──────┘
                                                          │
                                                   ┌──────▼──────┐
                                                   │  Paired     │
                                                   │  Device     │
                                                   └─────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `device-pairing.ts` | Pairing state management |
| `device-auth-store.ts` | Client-side token storage |
| `device-identity.ts` | Ed25519 key generation and signing |

### Core Types

```typescript
type DevicePairingPendingRequest = {
  requestId: string;
  deviceId: string;
  publicKey: string;
  displayName?: string;
  platform?: string;
  clientId?: string;
  clientMode?: string;
  role?: string;
  roles?: string[];
  scopes?: string[];
  remoteIp?: string;
  silent?: boolean;
  isRepair?: boolean;
  ts: number;
};

type PairedDevice = {
  deviceId: string;
  publicKey: string;
  displayName?: string;
  platform?: string;
  clientId?: string;
  clientMode?: string;
  role?: string;
  roles?: string[];
  scopes?: string[];
  remoteIp?: string;
  tokens?: Record<string, DeviceAuthToken>;
  createdAtMs: number;
  approvedAtMs: number;
};

type DeviceAuthToken = {
  token: string;
  role: string;
  scopes: string[];
  createdAtMs: number;
  rotatedAtMs?: number;
  revokedAtMs?: number;
  lastUsedAtMs?: number;
};
```

### Pairing Functions

```typescript
// Create pairing request (5-minute TTL)
async function requestDevicePairing(
  req: Omit<DevicePairingPendingRequest, "requestId" | "ts" | "isRepair">,
  baseDir?: string
): Promise<{ status: "pending"; request: DevicePairingPendingRequest; created: boolean }>

// Approve pending request
async function approveDevicePairing(
  requestId: string,
  baseDir?: string
): Promise<{ requestId: string; device: PairedDevice } | null>

// Reject pending request
async function rejectDevicePairing(
  requestId: string,
  baseDir?: string
): Promise<{ requestId: string; deviceId: string } | null>

// Token management
async function verifyDeviceToken(params: {
  deviceId: string;
  token: string;
  role: string;
  scopes: string[];
}): Promise<{ ok: boolean; reason?: string }>

async function rotateDeviceToken(params: {
  deviceId: string;
  role: string;
  scopes?: string[];
}): Promise<DeviceAuthToken | null>

async function revokeDeviceToken(params: {
  deviceId: string;
  role: string;
}): Promise<DeviceAuthToken | null>
```

### Device Identity

Ed25519 key-based identity with SHA-256 device ID derivation:

```typescript
type DeviceIdentity = {
  deviceId: string;        // SHA-256 hash of public key
  publicKeyPem: string;
  privateKeyPem: string;
};

function loadOrCreateDeviceIdentity(filePath?: string): DeviceIdentity

function signDevicePayload(privateKeyPem: string, payload: string): string

function verifyDeviceSignature(
  publicKey: string,
  payload: string,
  signatureBase64Url: string
): boolean
```

---

## Exec Approvals

The exec approval system provides security controls for shell command execution.

### Architecture Overview

```
┌──────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│  Shell Command   │────▶│  Analyze/Parse   │────▶│  Allowlist Check  │
│  Request         │     │  (tokenize)      │     │  (pattern match)  │
└──────────────────┘     └──────────────────┘     └───────────────────┘
                                                          │
                                    ┌─────────────────────┼─────────────────────┐
                                    ▼                     ▼                     ▼
                            ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
                            │  Allow       │      │  Deny        │      │  Ask User    │
                            │  (execute)   │      │  (reject)    │      │  (forward)   │
                            └──────────────┘      └──────────────┘      └──────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `exec-approvals.ts` | Approval file management, command analysis |
| `exec-approval-forwarder.ts` | Forward approval requests to channels |
| `exec-safety.ts` | Executable value safety validation |
| `exec-host.ts` | Remote exec host protocol |

### Core Types

```typescript
type ExecSecurity = "deny" | "allowlist" | "full";
type ExecAsk = "off" | "on-miss" | "always";
type ExecApprovalDecision = "allow-once" | "allow-always" | "deny";

type ExecAllowlistEntry = {
  id?: string;
  pattern: string;
  lastUsedAt?: number;
  lastUsedCommand?: string;
  lastResolvedPath?: string;
};

type ExecApprovalsResolved = {
  path: string;
  socketPath: string;
  token: string;
  defaults: Required<ExecApprovalsDefaults>;
  agent: Required<ExecApprovalsDefaults>;
  allowlist: ExecAllowlistEntry[];
  file: ExecApprovalsFile;
};
```

### Security Levels

| Level | Behavior |
|-------|----------|
| `deny` | Block all exec requests |
| `allowlist` | Allow only matched patterns |
| `full` | Allow all exec requests |

### Ask Modes

| Mode | Behavior |
|------|----------|
| `off` | Never prompt user |
| `on-miss` | Prompt when allowlist doesn't match |
| `always` | Always prompt user |

### Command Analysis

```typescript
type ExecCommandAnalysis = {
  ok: boolean;
  reason?: string;
  segments: ExecCommandSegment[];
  chains?: ExecCommandSegment[][];  // For &&, ||, ; operators
};

type ExecCommandSegment = {
  raw: string;
  argv: string[];
  resolution: CommandResolution | null;
};

function analyzeShellCommand(params: {
  command: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: string | null;
}): ExecCommandAnalysis
```

**Analysis features:**
- Pipeline parsing (`|`)
- Chain operators (`&&`, `||`, `;`)
- Quote handling (single, double, escaped)
- Executable path resolution
- Glob pattern matching in allowlist

### Safe Bins

Default safe binaries (data filtering only, no file access):

```typescript
const DEFAULT_SAFE_BINS = ["jq", "grep", "cut", "sort", "uniq", "head", "tail", "tr", "wc"];
```

### Approval Forwarder

Forwards approval requests to messaging channels:

```typescript
type ExecApprovalForwarder = {
  handleRequested: (request: ExecApprovalRequest) => Promise<void>;
  handleResolved: (resolved: ExecApprovalResolved) => Promise<void>;
  stop: () => void;
};

function createExecApprovalForwarder(deps?: ExecApprovalForwarderDeps): ExecApprovalForwarder
```

**Forwarding modes:**
- `session`: Forward to originating session's channel
- `targets`: Forward to configured explicit targets
- `both`: Forward to both

### Exec Host Protocol

Remote execution via Unix socket with HMAC authentication:

```typescript
type ExecHostRequest = {
  command: string[];
  rawCommand?: string | null;
  cwd?: string | null;
  env?: Record<string, string> | null;
  timeoutMs?: number | null;
  needsScreenRecording?: boolean | null;
  agentId?: string | null;
  sessionKey?: string | null;
  approvalDecision?: "allow-once" | "allow-always" | null;
};

type ExecHostResponse =
  | { ok: true; payload: ExecHostRunResult }
  | { ok: false; error: ExecHostError };

async function requestExecHostViaSocket(params: {
  socketPath: string;
  token: string;
  request: ExecHostRequest;
  timeoutMs?: number;
}): Promise<ExecHostResponse | null>
```

---

## Infrastructure Utilities

### Gateway Lock

Prevents multiple gateway instances for the same config:

```typescript
type GatewayLockHandle = {
  lockPath: string;
  configPath: string;
  release: () => Promise<void>;
};

async function acquireGatewayLock(opts?: GatewayLockOptions): Promise<GatewayLockHandle | null>
```

**Features:**
- Config-hash-based lock file naming
- Process liveness detection (with Linux `/proc` inspection)
- Stale lock cleanup (30s timeout)
- Polling with configurable timeout

### Deduplication Cache

```typescript
type DedupeCache = {
  check: (key: string | undefined | null, now?: number) => boolean;
  clear: () => void;
  size: () => number;
};

function createDedupeCache(options: {
  ttlMs: number;
  maxSize: number;
}): DedupeCache
```

### TLS/Fingerprinting

Self-signed certificate generation and fingerprint verification:

```typescript
type GatewayTlsRuntime = {
  enabled: boolean;
  required: boolean;
  certPath?: string;
  keyPath?: string;
  caPath?: string;
  fingerprintSha256?: string;
  tlsOptions?: tls.TlsOptions;
  error?: string;
};

async function loadGatewayTlsRuntime(
  cfg: GatewayTlsConfig | undefined,
  log?: { info?: (msg: string) => void; warn?: (msg: string) => void }
): Promise<GatewayTlsRuntime>

function normalizeFingerprint(input: string): string
```

### Bonjour/mDNS Discovery

Discover gateway beacons on local network:

```typescript
type GatewayBonjourBeacon = {
  instanceName: string;
  domain?: string;
  displayName?: string;
  host?: string;
  port?: number;
  lanHost?: string;
  tailnetDns?: string;
  gatewayPort?: number;
  sshPort?: number;
  gatewayTls?: boolean;
  gatewayTlsFingerprintSha256?: string;
  cliPath?: string;
  role?: string;
  transport?: string;
  txt?: Record<string, string>;
};

async function discoverGatewayBeacons(opts?: {
  timeoutMs?: number;
  domains?: string[];
  wideAreaDomain?: string | null;
}): Promise<GatewayBonjourBeacon[]>
```

**Discovery methods:**
- macOS: `dns-sd` command
- Linux: `avahi-browse` command
- Wide-area: Tailscale DNS probing via `dig`

### Tailscale Integration

```typescript
// Find Tailscale binary
async function findTailscaleBinary(): Promise<string | null>

// Get tailnet hostname/IP
async function getTailnetHostname(exec?: typeof runExec): Promise<string>

// Read Tailscale status
async function readTailscaleStatusJson(exec?: typeof runExec): Promise<Record<string, unknown>>

// Whois lookup with caching
async function readTailscaleWhoisIdentity(
  ip: string,
  exec?: typeof runExec,
  opts?: { timeoutMs?: number; cacheTtlMs?: number; errorTtlMs?: number }
): Promise<TailscaleWhoisIdentity | null>

// Enable/disable Tailscale Serve
async function enableTailscaleServe(port: number, exec?: typeof runExec): Promise<void>
async function disableTailscaleServe(exec?: typeof runExec): Promise<void>

// Enable/disable Tailscale Funnel
async function enableTailscaleFunnel(port: number, exec?: typeof runExec): Promise<void>
async function disableTailscaleFunnel(exec?: typeof runExec): Promise<void>
```

---

## Summary of Infrastructure Components

| Component | File(s) | Purpose |
|-----------|---------|---------|
| **Outbound Delivery** | `outbound/*.ts` | Message delivery to channels |
| **Heartbeat** | `heartbeat-*.ts` | Periodic agent check-ins |
| **Device Pairing** | `device-*.ts` | Client authentication |
| **Exec Approvals** | `exec-*.ts` | Shell execution security |
| **Gateway Lock** | `gateway-lock.ts` | Single instance enforcement |
| **Deduplication** | `dedupe.ts` | Message dedup cache |
| **TLS** | `tls/*.ts` | Certificate management |
| **Discovery** | `bonjour-*.ts`, `tailscale.ts` | Network discovery |

---

*This document reflects the infrastructure layer of OpenClaw as found in `src/infra/`. For channel-specific adapters, see the channel plugin documentation.*

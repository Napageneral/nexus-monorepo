# Battle-Tested Edge Case Patterns from OpenClaw

**Status:** COMPLETE  
**Last Updated:** 2026-02-04  
**Upstream Version:** v2026.2.3

---

These patterns have been refined through production use handling real messaging traffic. They're essential to preserve when forking OpenClaw for Nexus.

---

## 1. Deduplication System

### Overview

OpenClaw uses a two-layer deduplication system to prevent processing the same inbound message multiple times (e.g., from webhook retries, reconnection events, or platform quirks).

### Core Implementation: `src/infra/dedupe.ts`

```typescript
export function createDedupeCache(options: DedupeCacheOptions): DedupeCache {
  const ttlMs = Math.max(0, options.ttlMs);
  const maxSize = Math.max(0, Math.floor(options.maxSize));
  const cache = new Map<string, number>();
  // ...
}
```

**Configuration:**
- **TTL**: How long to remember a message (prevents duplicates within this window)
- **Max Size**: Maximum cache entries (LRU eviction when exceeded)

**Key behavior:**
- Returns `true` if key was already seen (duplicate), `false` if new
- "Touch" semantics: re-seeing a key refreshes its timestamp
- Prunes expired entries and enforces max size on each check

### Inbound Message Deduplication: `src/auto-reply/reply/inbound-dedupe.ts`

**Default Settings:**
```typescript
const DEFAULT_INBOUND_DEDUPE_TTL_MS = 20 * 60_000;  // 20 minutes
const DEFAULT_INBOUND_DEDUPE_MAX = 5000;            // 5000 entries
```

**Dedupe Key Construction:**
```typescript
// Key format: provider|accountId|sessionKey|peerId|threadId|messageId
return [provider, accountId, sessionKey, peerId, threadId, messageId]
  .filter(Boolean)
  .join("|");
```

**Components:**
| Field | Source | Purpose |
|-------|--------|---------|
| `provider` | `OriginatingChannel ?? Provider ?? Surface` | Platform (telegram, discord, etc.) |
| `accountId` | `AccountId` | Which bot/account received it |
| `sessionKey` | `SessionKey` | Conversation session |
| `peerId` | `OriginatingTo ?? To ?? From ?? SessionKey` | Sender/recipient identifier |
| `threadId` | `MessageThreadId` | Thread context (for threaded platforms) |
| `messageId` | `MessageSid` | Platform's unique message ID |

**Edge Cases Handled:**
- **Null/undefined fields**: Returns `null` key (no deduplication, message processed)
- **Empty strings**: Filtered out via `filter(Boolean)`
- **Case normalization**: Provider lowercased and trimmed
- **Multi-account**: Same message to different accounts treated as distinct

### Usage Pattern

```typescript
function shouldSkipDuplicateInbound(ctx: MsgContext): boolean {
  const key = buildInboundDedupeKey(ctx);
  if (!key) {
    return false;  // Can't build key, don't skip
  }
  return cache.check(key);  // Returns true if duplicate
}
```

---

## 2. Block Streaming with Coalescing

### Overview

LLM responses stream token-by-token, but messaging platforms expect complete messages. The `EmbeddedBlockChunker` accumulates tokens and emits well-formed chunks at natural break points.

### Core Implementation: `src/agents/pi-embedded-block-chunker.ts`

**Configuration:**
```typescript
export type BlockReplyChunking = {
  minChars: number;           // Minimum chars before considering a break
  maxChars: number;           // Force break at this limit
  breakPreference?: "paragraph" | "newline" | "sentence";
  flushOnParagraph?: boolean; // Eager flush on \n\n boundaries
};
```

### Break Preference Cascade

The chunker tries to break at the best natural boundary:

1. **Paragraph** (`\n\n`): Preferred for narrative/prose
2. **Newline** (`\n`): Good for lists, code
3. **Sentence** (`.!?` followed by whitespace): Fallback for dense text
4. **Word boundary** (any whitespace): Last resort before hard break
5. **Hard break** at `maxChars`: Absolute limit

```typescript
#pickBreakIndex(buffer: string, minCharsOverride?: number): BreakResult {
  // Try paragraph breaks first
  if (preference === "paragraph") {
    let paragraphIdx = window.lastIndexOf("\n\n");
    // ...
  }
  // Fall back to newlines
  if (preference === "paragraph" || preference === "newline") {
    let newlineIdx = window.lastIndexOf("\n");
    // ...
  }
  // Fall back to sentences
  const matches = window.matchAll(/[.!?](?=\s|$)/g);
  // ...
  // Fall back to word boundaries
  for (let i = window.length - 1; i >= minChars; i--) {
    if (/\s/.test(window[i])) {
      return { index: i };
    }
  }
  // Hard break at maxChars
  return { index: maxChars };
}
```

### Code Fence Handling

Critical edge case: never break inside fenced code blocks (breaks Markdown rendering).

```typescript
// KNOWN: We cannot split inside fenced code blocks (Markdown breaks + UI glitches).
// When forced (maxChars), we close + reopen the fence to keep Markdown valid.
```

**Fence Split Strategy:**
```typescript
if (fence) {
  return {
    index: maxChars,
    fenceSplit: {
      closeFenceLine: `${fence.indent}${fence.marker}`,  // e.g., "```"
      reopenFenceLine: fence.openLine,                    // e.g., "```typescript"
    },
  };
}
```

When a hard break falls inside a code fence:
1. Close the fence at the break point
2. Emit the chunk with closing fence
3. Reopen the fence at the start of the next chunk

### Paragraph-Eager Mode

When `flushOnParagraph: true` (chunkMode="newline"):

```typescript
#drainParagraphs(emit: (chunk: string) => void, maxChars: number) {
  while (this.#buffer.length > 0) {
    const paragraphBreak = findNextParagraphBreak(this.#buffer, fenceSpans);
    if (!paragraphBreak || paragraphBreak.index > maxChars) {
      // No paragraph boundary yet, or too far away
      if (this.#buffer.length >= maxChars) {
        // Fall back to normal break logic
      }
      return;
    }
    // Emit each complete paragraph immediately
    const chunk = this.#buffer.slice(0, paragraphBreak.index);
    emit(chunk);
    this.#buffer = stripLeadingNewlines(this.#buffer.slice(...));
  }
}
```

This mode sends each paragraph as soon as it's complete, rather than waiting for `minChars`.

---

## 3. Human-Like Delays

### Overview

Instant responses look robotic. OpenClaw adds randomized delays between block replies to simulate human typing rhythm.

### Core Implementation: `src/auto-reply/reply/reply-dispatcher.ts`

**Default Delay Range:**
```typescript
const DEFAULT_HUMAN_DELAY_MIN_MS = 800;   // 0.8 seconds
const DEFAULT_HUMAN_DELAY_MAX_MS = 2500;  // 2.5 seconds
```

**Configuration:**
```typescript
export type HumanDelayConfig = {
  mode: "off" | "default" | "custom";
  minMs?: number;  // Only used when mode = "custom"
  maxMs?: number;  // Only used when mode = "custom"
};
```

**Delay Calculation:**
```typescript
function getHumanDelay(config: HumanDelayConfig | undefined): number {
  const mode = config?.mode ?? "off";
  if (mode === "off") {
    return 0;
  }
  const min = mode === "custom" 
    ? (config?.minMs ?? DEFAULT_HUMAN_DELAY_MIN_MS) 
    : DEFAULT_HUMAN_DELAY_MIN_MS;
  const max = mode === "custom" 
    ? (config?.maxMs ?? DEFAULT_HUMAN_DELAY_MAX_MS) 
    : DEFAULT_HUMAN_DELAY_MAX_MS;
  if (max <= min) {
    return min;
  }
  // Uniform random distribution
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
```

### When Delays Are Applied

**Only between block replies, not before the first one:**

```typescript
// Track whether we've sent a block reply (for human delay - skip delay on first block).
let sentFirstBlock = false;

const enqueue = (kind: ReplyDispatchKind, payload: ReplyPayload) => {
  // Determine if we should add human-like delay (only for block replies after the first).
  const shouldDelay = kind === "block" && sentFirstBlock;
  if (kind === "block") {
    sentFirstBlock = true;
  }

  sendChain = sendChain.then(async () => {
    if (shouldDelay) {
      const delayMs = getHumanDelay(options.humanDelay);
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
    await options.deliver(normalized, { kind });
  });
};
```

**Key behaviors:**
- **First message**: No delay (immediate response feels natural)
- **Subsequent blocks**: Delayed (simulates reading and typing next message)
- **Tool results**: No delay (system operations, not "typing")
- **Final message**: No delay (wrapping up)

### Why This Matters

1. **Bot detection avoidance**: Many platforms flag instant-reply patterns
2. **User experience**: Rapid-fire messages can feel overwhelming
3. **Natural conversation flow**: Humans pause between thoughts
4. **Rate limit mitigation**: Spreading messages reduces API pressure

---

## 4. Failover and Retry Logic

### Overview

OpenClaw handles API failures gracefully with per-request retries and per-profile failover. This enables resilience across multiple API keys, OAuth tokens, and providers.

### Retry Infrastructure: `src/infra/retry.ts`

**Core retry function:**
```typescript
export type RetryConfig = {
  attempts?: number;      // Max attempts (default: 3)
  minDelayMs?: number;    // Initial delay (default: 300ms)
  maxDelayMs?: number;    // Max delay cap (default: 30s)
  jitter?: number;        // Random jitter 0-1 (default: 0)
};

export type RetryOptions = RetryConfig & {
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  retryAfterMs?: (err: unknown) => number | undefined;
  onRetry?: (info: RetryInfo) => void;
};
```

**Exponential backoff with jitter:**
```typescript
const baseDelay = hasRetryAfter
  ? Math.max(retryAfterMs, minDelayMs)          // Honor server's retry-after
  : minDelayMs * 2 ** (attempt - 1);            // Exponential: 300, 600, 1200...
let delay = Math.min(baseDelay, maxDelayMs);    // Cap at maxDelayMs
delay = applyJitter(delay, jitter);             // Add randomness
```

### Platform-Specific Retry Policies: `src/infra/retry-policy.ts`

**Discord:**
```typescript
export const DISCORD_RETRY_DEFAULTS = {
  attempts: 3,
  minDelayMs: 500,
  maxDelayMs: 30_000,
  jitter: 0.1,
};

// Only retry on Discord's RateLimitError
shouldRetry: (err) => err instanceof RateLimitError,
retryAfterMs: (err) => err instanceof RateLimitError ? err.retryAfter * 1000 : undefined,
```

**Telegram:**
```typescript
export const TELEGRAM_RETRY_DEFAULTS = {
  attempts: 3,
  minDelayMs: 400,
  maxDelayMs: 30_000,
  jitter: 0.1,
};

// Retry on various transient errors
const TELEGRAM_RETRY_RE = /429|timeout|connect|reset|closed|unavailable|temporarily/i;
shouldRetry: (err) => TELEGRAM_RETRY_RE.test(formatErrorMessage(err)),
```

### Auth Profile Failover

When an API call fails, OpenClaw can fail over to another configured auth profile.

**Failure Reason Classification: `src/agents/failover-error.ts`**

```typescript
export type FailoverReason = 
  | "auth"       // 401/403: Invalid or revoked credentials
  | "format"     // 400: Malformed request
  | "rate_limit" // 429: Too many requests
  | "billing"    // 402: Quota exhausted
  | "timeout"    // 408: Request timed out
  | "unknown";   // Other errors

export function resolveFailoverReasonFromError(err: unknown): FailoverReason | null {
  const status = getStatusCode(err);
  if (status === 402) return "billing";
  if (status === 429) return "rate_limit";
  if (status === 401 || status === 403) return "auth";
  if (status === 408) return "timeout";
  // Also check error messages for rate limit patterns
  return classifyFailoverReason(getErrorMessage(err));
}
```

### Cooldown Tracking: `src/agents/auth-profiles/usage.ts`

**Cooldown formula (exponential backoff):**
```typescript
export function calculateAuthProfileCooldownMs(errorCount: number): number {
  const normalized = Math.max(1, errorCount);
  return Math.min(
    60 * 60 * 1000,                              // Max: 1 hour
    60 * 1000 * 5 ** Math.min(normalized - 1, 3) // 1min, 5min, 25min, 1hr
  );
}
```

**Cooldown progression:**
| Error Count | Cooldown Duration |
|-------------|-------------------|
| 1           | 1 minute          |
| 2           | 5 minutes         |
| 3           | 25 minutes        |
| 4+          | 1 hour (capped)   |

**Billing errors get longer backoffs:**
```typescript
// Default: 5 hours initial, max 24 hours, with 24-hour failure window
const defaults = {
  billingBackoffHours: 5,
  billingMaxHours: 24,
  failureWindowHours: 24,
} as const;

// Exponential: 5h, 10h, 20h, 24h (capped)
const raw = baseMs * 2 ** exponent;
return Math.min(maxMs, raw);
```

### Profile Ordering with Cooldown: `src/agents/auth-profiles/order.ts`

**Round-robin with cooldown awareness:**
```typescript
export function resolveAuthProfileOrder(params: {
  cfg?: OpenClawConfig;
  store: AuthProfileStore;
  provider: string;
  preferredProfile?: string;
}): string[] {
  // Partition into available and in-cooldown
  const available: string[] = [];
  const inCooldown: Array<{ profileId: string; cooldownUntil: number }> = [];

  for (const profileId of deduped) {
    if (isProfileInCooldown(store, profileId)) {
      inCooldown.push({ profileId, cooldownUntil });
    } else {
      available.push(profileId);
    }
  }

  // Sort available by lastUsed (oldest first = round-robin)
  // Append cooldown profiles sorted by expiry (soonest first)
  const cooldownSorted = inCooldown
    .toSorted((a, b) => a.cooldownUntil - b.cooldownUntil)
    .map((entry) => entry.profileId);

  return [...sorted, ...cooldownSorted];
}
```

**Ordering priority:**
1. **OAuth tokens** (most reliable, auto-refresh)
2. **Bearer tokens** (short-lived)
3. **API keys** (static, but can hit quota)
4. Within each type: oldest `lastUsed` first (round-robin)
5. **Cooldown profiles at end**, sorted by expiry (try soonest-to-recover first)

### Usage Tracking

**On successful request:**
```typescript
export async function markAuthProfileUsed(params) {
  freshStore.usageStats[profileId] = {
    lastUsed: Date.now(),
    errorCount: 0,                 // Reset error count
    cooldownUntil: undefined,      // Clear cooldown
    disabledUntil: undefined,      // Clear disabled
    disabledReason: undefined,
    failureCounts: undefined,
  };
}
```

**On failed request:**
```typescript
export async function markAuthProfileFailure(params) {
  // Check if previous failure was >24h ago (reset window)
  const windowExpired = now - existing.lastFailureAt > windowMs;
  const nextErrorCount = windowExpired ? 1 : (existing.errorCount + 1);
  
  if (reason === "billing") {
    // Longer backoff for billing errors
    updatedStats.disabledUntil = now + billingBackoffMs;
    updatedStats.disabledReason = "billing";
  } else {
    // Standard cooldown
    updatedStats.cooldownUntil = now + cooldownMs;
  }
}
```

---

## Summary: Key Patterns to Preserve

| Pattern | Key Config | Purpose |
|---------|------------|---------|
| **Inbound Dedupe** | TTL: 20min, Max: 5000 | Prevent duplicate message processing |
| **Block Chunking** | min/max chars, break preference | Natural message boundaries |
| **Fence Safety** | Close/reopen on split | Preserve Markdown validity |
| **Human Delays** | 800-2500ms range | Natural conversation rhythm |
| **Retry** | 3 attempts, exponential backoff | Transient error recovery |
| **Profile Cooldown** | 1min → 5min → 25min → 1hr | Distribute load away from failing keys |
| **Billing Backoff** | 5h → 24h | Avoid quota-exhausted profiles |
| **Round-Robin Order** | OAuth > Token > APIKey, oldest first | Even key distribution |

These patterns work together to create a resilient, natural-feeling messaging agent that gracefully handles the chaos of real-world APIs.

---

## Nexus Porting Notes

All of these patterns should be ported to Nexus:

1. **Deduplication** → NEX pipeline stage 1 (receiveEvent)
2. **Block streaming** → Out-adapters
3. **Human delays** → Out-adapters
4. **Retry/failover** → Credential system + adapter error handling

The patterns themselves don't change — only where they live in the architecture.

---

*Source: `~/nexus/home/projects/openclaw/src/`*

# Unified Triggers Specification

**Status:** DESIGN SPEC  
**Work Item:** WI-3 (Agent Orchestration)  
**Last Updated:** 2026-01-22

---

## Executive Summary

Replace fragmented trigger systems (heartbeat, cron, webhooks) with a **single Trigger abstraction** routed through the Agent Broker. All proactive agent invocations flow through one unified layer.

**Key Principle:** Triggers are events that wake agents. The broker decides which session handles them.

---

## Current State: Upstream Triggers

### Heartbeat System

**Config (`agents.defaults.heartbeat`):**

```typescript
type HeartbeatConfig = {
  every: string;              // Interval: "30m", "1h", etc.
  prompt?: string;            // Override default prompt
  target?: "last";            // Where to deliver responses
  session?: "main";           // Which session to use
  activeHours?: {
    start: string;            // "08:00"
    end: string;              // "23:00"
    timezone: "user" | "local" | string;  // IANA zone
  };
  ackMaxChars?: number;       // Suppress short acks (default: 300)
  includeReasoning?: boolean; // Include reasoning in response
  model?: string;             // Model override for heartbeats
};
```

**Default Prompt:**
```
Read HEARTBEAT.md if it exists (workspace context). 
Follow it strictly. Do not infer or repeat old tasks from prior chats. 
If nothing needs attention, reply HEARTBEAT_OK.
```

**Behavior:**
1. Scheduler fires every N minutes (if within activeHours)
2. Sends prompt to configured session (default: main)
3. Agent reads HEARTBEAT.md, performs checks
4. If response is short (< ackMaxChars), suppress delivery
5. Otherwise, deliver to target channel

### Cron System

**Config (`config.cron.jobs[]`):**

```typescript
type CronJob = {
  id: string;
  name: string;
  schedule: CronSchedule;       // "at", "every", or cron expression
  sessionTarget: "main" | "isolated";
  wakeMode: "next-heartbeat" | "now";
  payload: {
    kind: "systemEvent" | "agentTurn";
    message: string;
    model?: string;             // Model override
    deliver?: boolean;          // Send result to channel
    channel?: string;           // Target channel
  };
  isolation?: {
    postToMainMode: "summary" | "full";  // What to post back
  };
};

type CronSchedule = 
  | { at: string }              // ISO timestamp or "HH:MM"
  | { every: string }           // Duration: "1h", "30m"
  | { cron: string };           // Cron expression: "0 9 * * 1"
```

**Key Insight:** Upstream cron already supports:
- Running in isolated session (like a worker)
- Posting summary back to main (like announce)
- Different models per job

### Gaps in Upstream

| Capability | Status |
|------------|--------|
| Heartbeat | ✅ Config-driven, HEARTBEAT.md integration |
| Cron | ✅ Flexible scheduling, isolation |
| Webhooks | ❌ Not built-in |
| File watch | ❌ Not built-in |
| Completion callbacks | ⚠️ Via subagent-announce (not general) |
| Cross-session routing | ❌ Always goes to configured session |


*This spec replaces the fragmented heartbeat + cron + announce systems with a unified approach.*

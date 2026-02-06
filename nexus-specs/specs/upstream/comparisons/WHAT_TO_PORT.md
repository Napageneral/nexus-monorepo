# What to Port from OpenClaw

**Status:** COMPLETE  
**Last Updated:** 2026-02-03

---

## Overview

Specific patterns, code, and approaches worth adopting from OpenClaw.

---

## Definitely Port

### 1. Session Key Format

```
agent:{agentId}:main
agent:{agentId}:dm:{peerId}
agent:{agentId}:{channel}:group:{groupId}
```

This works. Keep it.

### 2. Streaming Phases

```
Tool output → Block (streaming text) → Final
```

Helps clients show progress. Keep the pattern.

### 3. Channel Monitor + Sender Pattern

Each channel has:
- **Monitor** — listens for inbound
- **Sender** — delivers outbound

Clean separation. Maps directly to Nexus Adapter in/out.

### 4. Outbound Formatting/Chunking

Each channel has message limits and formatting rules:
- Discord: 2000 chars, markdown, `<>` for links
- WhatsApp: No markdown tables, use bullets
- Telegram: HTML formatting
- iMessage: Plain text

**Location in OpenClaw:** `src/infra/outbound/` and per-channel code.

**For Nexus:** Adapters need platform-specific formatting in their `out` interface.


---

## Consider Porting

### 1. Provider Registration Pattern

OpenClaw's provider system is LLM-specific but well-structured:

```typescript
{
  id: "anthropic",
  envVars: ["ANTHROPIC_API_KEY"],
  auth: [{ id: "api-key", kind: "api_key", run: ... }]
}
```

**For Nexus:** Connectors already cover this more generically. But the credential resolution priority is worth adopting:

```
Explicit profile → Config override → Stored credentials → Env vars → Config file
```

### 2. Skill Requirements Declarations

```yaml
metadata:
  os: ["darwin"]
  requires:
    bins: ["ffmpeg", "gog"]
    env: ["OPENAI_API_KEY"]
    config: ["telegram.enabled"]
```

Auto-filtering based on requirements. Nexus could adopt for skill status derivation.

### 3. Per-Agent Skill Scoping

```json5
{
  agents: {
    list: [{ name: "atlas", skills: ["gog", "calendar"] }]
  }
}
```

Each agent gets specific skills. Could integrate with agent identity in Nexus.

**Note:** This is weak compared to IAM. But skill scoping as a convenience layer on top of IAM could work.

---

## Do NOT Port

### 1. Skill Allowlisting as Access Control

Blocking at skill level doesn't prevent tool use. The binary is on the machine. Use IAM for real access control.

### 2. Single Config File

Split by domain is better. Don't regress.

### 3. JSONL File Storage

SQLite is strictly better. No reason to keep file-based sessions.

### 4. Hidden Workspace

Transparency is a feature. Keep `~/nexus/` visible.

### 5. Scattered Hooks

14+ hooks scattered throughout is hard to reason about. The 8-stage pipeline is cleaner.

### 6. Ad-Hoc Subagent Spawning

Fire-and-forget with announce pattern is weaker than structured MWP. Keep the orchestration.

### 7. Command-Dispatch as Skills

Commands are not skills. If we adopt commands, they should be separate:
- **Skills:** Documentation for agents
- **Commands/Macros:** Deterministic scripts

Don't conflate them.

---

### 8. Pre-Compaction Memory Flush

**DO NOT PORT.** See `MEMORY_PHILOSOPHY.md` for why.

OpenClaw needs this because their memory is file-based and context is lost during compaction. Nexus doesn't:
- All turns persisted to Agents Ledger forever
- Cortex derives memory from complete System of Record
- No live saving required
- Can regenerate memory layer when improved
- No cold start problem

This is a patch for a fragile foundation. Nexus has a solid foundation.

### 9. Adaptive Chunking / Safeguard Mode

**DO NOT PORT** without careful consideration.

OpenClaw's chunking handles oversized context, but adds complexity. Prefer:
- Keep turns reasonably sized
- Single reliable compaction approach
- Handle failures gracefully

If you fully articulate the problem space and find an elegant solution, fine. Don't copy complexity for edge cases.

---

## Code to Study (Reference Only)

| Area | OpenClaw Location | Purpose |
|------|-------------------|---------|
| Outbound delivery | `src/infra/outbound/` | Platform formatting |
| Provider auth | `src/agents/model-auth.ts` | Credential resolution |
| Skill loading | `src/agents/skills/workspace.ts` | Skill discovery and filtering |
| Compaction | `src/agents/compaction.ts` | Reference for summarization |
| Session management | External `pi-coding-agent` | Session/turn handling |

---

## Migration Path

For users coming from OpenClaw:

| OpenClaw | Nexus Equivalent | Migration |
|----------|------------------|-----------|
| `config.json` | Split configs in `state/` | Automated transformer |
| `sessions/*.jsonl` | Agents Ledger | Import script |
| `~/.openclaw/skills/` | `~/nexus/skills/` | Copy + adapt metadata |
| Allowlists | IAM policies | Manual mapping |
| Identity links | Identity Graph | Import + enrich |
| Memory files | Cortex | Ingest as episodes |

---

## Summary

**Port:**
- Session key format
- Streaming phases (tool → block → final)
- Channel monitor/sender abstraction
- Outbound formatting per platform

**Consider:**
- Provider credential resolution priority
- Skill requirements declarations
- Per-agent skill scoping (convenience layer on IAM)

**Avoid:**
- Pre-compaction memory flush (Nexus architecture solves this)
- Adaptive chunking complexity (prefer single elegant approach)
- File-based storage
- Hidden workspace
- Scattered hooks
- Skill allowlisting as security
- Commands mixed with skills

---

*The goal is to take the good ideas while building on a better foundation.*

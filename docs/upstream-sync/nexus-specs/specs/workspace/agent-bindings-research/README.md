# Agent Bindings Research

This folder contains research and design documents for Nexus agent context injection and harness bindings.

## Documents

| # | Document | Purpose | Status |
|---|----------|---------|--------|
| 01 | [UPSTREAM_CONTEXT_INJECTION.md](./01-UPSTREAM_CONTEXT_INJECTION.md) | Document how upstream moltbot injects context | Complete |
| 02 | [NEXUS_CONTEXT_INJECTION.md](./02-NEXUS_CONTEXT_INJECTION.md) | Define ideal Nexus context injection model | Complete |
| 03 | [HARNESS_BINDING_MECHANISMS.md](./03-HARNESS_BINDING_MECHANISMS.md) | Catalog of binding mechanisms for all harnesses | Complete |
| 04 | [NEXUS_BINDING_SPEC.md](./04-NEXUS_BINDING_SPEC.md) | Nexus binding specification for each harness | Complete |

## Harness Support Matrix

| Harness | Instructions | Lifecycle Hooks | Recommendation |
|---------|-------------|-----------------|----------------|
| **Cursor** | `AGENTS.md` | ✅ Full (`sessionStart`) | ✅ Recommended |
| **Claude Code** | `CLAUDE.md` | ✅ Full (`SessionStart`) | ✅ Recommended |
| **OpenCode** | `AGENTS.md` | ✅ Plugin-based | ✅ Recommended |
| **Codex** | `AGENTS.md` | ❌ None | ⚠️ Not recommended |

## Key Concepts

### Two Core Binding Needs

1. **Instructions file** — Gives agent baseline Nexus awareness (`AGENTS.md` or `CLAUDE.md`)
2. **Session lifecycle hooks** — Injects dynamic context (identity, memory) at startup AND after compaction

### Three-Layer Model (Embedded Agents)

1. **Workspace Level** — Universal context for ALL agents
2. **Manager Agent (MA)** — Communication context for embedded conversation agent
3. **Worker Agent (WA)** — Task execution context for embedded workers

### Harnesses vs Embedded

- **Harness agents** (Cursor, Claude Code, OpenCode) are unified — they get workspace context via hooks
- **Embedded agents** (MA, WA) are bifurcated — MA handles communication, WA handles execution

## Binding Files Summary

```
~/nexus/
├── AGENTS.md                         # Cursor, OpenCode, Codex
├── CLAUDE.md                         # Claude Code (identical content)
├── .cursor/
│   ├── hooks.json                    # Hook config
│   └── hooks/nexus-session-start.js  # Shared script
├── .claude/
│   └── settings.json                 # Reuses Cursor script
└── .opencode/
    └── plugins/nexus-bootstrap.ts    # Native plugin
```

## Next Steps

- [ ] Implement `nexus bindings create` CLI command
- [ ] Integrate with AIX for auto-detection of top harnesses
- [ ] Create binding templates in `specs/workspace/reference/`

## References

- Upstream moltbot: `~/nexus/home/projects/moltbot`
- Pi-coding-agent: `~/nexus/home/projects/pi-mono/packages/coding-agent`
- Nexus CLI: `~/nexus/home/projects/nexus/nexus-cli`
- MWP Orchestration: `specs/agent-system/ORCHESTRATION.md`

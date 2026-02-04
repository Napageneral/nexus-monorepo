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

| Harness | Instructions | Lifecycle Hooks | Support |
|---------|-------------|-----------------|---------|
| **Cursor** | `AGENTS.md` | ✅ Full (`sessionStart`) | ✅ Supported |
| **Claude Code** | `CLAUDE.md` | ✅ Full (`SessionStart`) | ✅ Supported |
| **OpenCode** | `AGENTS.md` | ✅ Plugin-based | ✅ Supported |
| **Codex** | `AGENTS.md` | ❌ None | ⛔ Not supported |

> **Authoritative spec:** See [`../HARNESS_BINDINGS.md`](../HARNESS_BINDINGS.md) for the complete binding specification.

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

## Reference Templates

The [`reference/`](./reference/) folder contains actual template files:

```
reference/
├── cursor/
│   ├── hooks.json
│   └── nexus-session-start.js
├── claude-code/
│   └── settings.json
├── opencode/
│   └── nexus-bootstrap.ts
└── codex/
    └── README.md (limitations documentation)
```

## Next Steps (Implementation)

- [ ] Implement `nexus bindings detect` — AIX query for harness usage
- [ ] Implement `nexus bindings list` — Filesystem scan for existing bindings
- [ ] Implement `nexus bindings create <harness>` — Copy templates to workspace
- [ ] Implement `nexus bindings verify` — Check binding integrity
- [ ] Implement `nexus bindings refresh` — Regenerate from templates
- [ ] Implement `nexus bindings remove` — Delete binding files
- [ ] Test bindings in each harness

**CLI spec complete:** See [`../HARNESS_BINDINGS.md`](../HARNESS_BINDINGS.md) and [`../../../interface/cli/COMMANDS.md`](../../../interface/cli/COMMANDS.md)

## References

- Upstream moltbot: `~/nexus/home/projects/moltbot`
- Pi-coding-agent: `~/nexus/home/projects/pi-mono/packages/coding-agent`
- Nexus CLI: `~/nexus/home/projects/nexus/nexus-cli`
- MWP Orchestration: `specs/runtime/broker/ORCHESTRATION.md`

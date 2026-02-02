# Workspace Specs

**Status:** COMPLETE  
**Authoritative Document:** `WORKSPACE_SYSTEM.md`

---

## Reading Order

1. **Start here:** `WORKSPACE_SYSTEM.md` — The authoritative spec that ties everything together
2. Then individual specs as needed for implementation details

---

## Documents

| Spec | Status | Description |
|------|--------|-------------|
| **WORKSPACE_SYSTEM.md** | ✅ Complete | Unified spec — how everything fits together |
| `INIT.md` | ✅ Complete | Init command details |
| `PROJECT_STRUCTURE.md` | ✅ Complete | Directory layout and paths |
| `BOOTSTRAP_FILES.md` | ✅ Complete | File templates and purposes |
| `AGENT_BINDINGS.md` | ✅ Complete | IDE/harness integrations |
| `ONBOARDING.md` | ✅ Complete | Bootstrap conversation flow |

## Subfolders

| Folder | Description |
|--------|-------------|
| `upstream/` | Reference docs for upstream clawdbot/moltbot behavior |
| `agent-bindings-research/` | Deep research on harness binding mechanisms |
| `reference/` | Bootstrap file templates (AGENTS.md, SOUL.md, etc.) |

---

## Key Decisions (Settled)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Onboarding model | Agent conversation | Not CLI wizard — agent reads BOOTSTRAP.md |
| Agent naming | From conversation | Never `agents/default/`, always named |
| Config structure | Split by domain | `agents/config.json`, `gateway/config.json`, etc. |
| State visibility | `~/nexus/state/` | Visible, not hidden |
| Sessions | Global only | No per-agent sessions |
| Binding auto-creation | Top 2 harnesses | Via aix detection |
| Workspace root | Required | Bindings only work from `~/nexus/` |

---

## Reference Templates

### Bootstrap Templates (`reference/`)

```
reference/
├── AGENTS.md                    # System behavior template
├── BOOTSTRAP.md                 # First-run ritual template
├── IDENTITY-agent.md            # Agent identity template
├── IDENTITY-user.md             # User identity template  
├── SOUL.md                      # Agent persona template
├── config.json                  # Example config (legacy)
└── credentials-index.json       # Example credential index
```

### Harness Binding Templates (`agent-bindings-research/reference/`)

```
agent-bindings-research/reference/
├── cursor/
│   ├── hooks.json
│   └── nexus-session-start.js
├── claude-code/
│   └── settings.json
├── opencode/
│   └── nexus-bootstrap.ts
└── codex/
    └── README.md
```

---

## Structure

```
~/nexus/
├── AGENTS.md
├── skills/{tools,connectors,guides}/
├── state/
│   ├── agents/
│   │   ├── BOOTSTRAP.md
│   │   ├── config.json
│   │   └── {name}/
│   │       ├── IDENTITY.md
│   │       └── SOUL.md
│   ├── user/IDENTITY.md
│   ├── sessions/
│   ├── credentials/
│   │   └── config.json
│   └── gateway/
│       └── config.json
└── home/
```

---

## Command Flow

```
nexus init      →  Creates structure + default configs
(user opens in IDE)
(agent conversation) → Creates identity files
(agent detection)    → Scans credentials, detects harnesses
(auto-binding)       → Creates bindings for top 2 harnesses
nexus status    →  Shows capabilities
```

---

*See WORKSPACE_SYSTEM.md for the full authoritative spec.*

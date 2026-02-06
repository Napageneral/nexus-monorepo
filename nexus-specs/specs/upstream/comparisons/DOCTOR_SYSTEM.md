# Doctor System Comparison

OpenClaw's `openclaw doctor` vs Nexus's equivalent (to be specced).

---

## Status: Stub

This document is a placeholder. Doctor should be specced **after** Nexus is fully built to avoid constant updates during development.

---

## OpenClaw Doctor Overview

OpenClaw's doctor is a comprehensive self-healing diagnostic system.

### Architecture

```
doctor.ts (main orchestrator)
    │
    ├── doctor-update.ts          # Check for CLI updates
    ├── doctor-config-flow.ts     # Load, validate, migrate config
    ├── doctor-auth.ts            # Auth profile health, repairs
    ├── doctor-gateway-health.ts  # Gateway connectivity
    ├── doctor-gateway-daemon-flow.ts  # Service lifecycle
    ├── doctor-gateway-services.ts     # launchd/systemd state
    ├── doctor-sandbox.ts         # Docker sandbox images
    ├── doctor-security.ts        # Security audit (network exposure)
    ├── doctor-state-integrity.ts # Directory permissions, files
    ├── doctor-state-migrations.ts # Legacy format migrations
    ├── doctor-workspace.ts       # Workspace tips
    ├── doctor-ui.ts              # Control UI freshness
    └── doctor-platform-notes.ts  # macOS/Linux specific warnings
```

### Key Checks

| Category | Checks |
|----------|--------|
| **Security** | Gateway exposure, auth strength, DM policies |
| **Auth** | OAuth tokens, API keys, keychain access |
| **Gateway** | Reachable, correct version, channels connected |
| **Service** | launchd/systemd installed, running, no orphans |
| **State** | Directories exist/writable, permissions correct |
| **Migrations** | Legacy formats detected, offer upgrade |
| **Sandbox** | Docker images present, up to date |

### CLI Options

```bash
openclaw doctor                  # Interactive
openclaw doctor --yes            # Accept all defaults
openclaw doctor --repair         # Apply all repairs
openclaw doctor --non-interactive # Safe migrations only
openclaw doctor --generate-gateway-token
openclaw doctor --deep           # Scan system services
```

### Prompter Pattern

Doctor uses a `DoctorPrompter` abstraction:
- Interactive vs non-interactive mode
- `--yes` auto-accept
- `--repair` apply fixes
- Tracks changes for final config write

---

## Nexus Doctor (To Be Specced)

### Likely Checks

| Check | Description |
|-------|-------------|
| **Workspace** | `~/nexus/` exists with correct layout |
| **Bootstrap** | AGENTS.md, SOUL.md, IDENTITY.md present |
| **Database** | `nexus.db` valid, migrations applied |
| **Credentials** | Keychain access, token validity |
| **Adapters** | Configured adapters reachable |
| **Skills** | Broken skills with missing deps |
| **NEX Service** | Daemon running, healthy |
| **Permissions** | Directory ownership, file modes |
| **Migrations** | Old formats detected, upgrade paths |

### Key Differences from OpenClaw

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| **Config format** | JSON | YAML |
| **State storage** | JSONL files | SQLite |
| **Service management** | Gateway daemon | NEX daemon |
| **Auth storage** | `auth-profiles.json` | Credential system |
| **Sandbox** | Docker | TBD |

---

## TODO

- [ ] Spec doctor after Nexus runtime is complete
- [ ] Define check categories and priorities
- [ ] Design migration paths from OpenClaw
- [ ] Implement `nexus doctor` command

---

*See `TODO.md` for tracking. This stub will be expanded post-implementation.*

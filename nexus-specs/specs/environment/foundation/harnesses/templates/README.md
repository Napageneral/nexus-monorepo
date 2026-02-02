# Nexus Binding Reference Templates

This folder contains the actual template files that `nexus bindings create` will generate.

## Structure

```
reference/
├── cursor/
│   ├── hooks.json              # → ~/nexus/.cursor/hooks.json
│   └── nexus-session-start.js  # → ~/nexus/.cursor/hooks/nexus-session-start.js
├── claude-code/
│   └── settings.json           # → ~/nexus/.claude/settings.json
├── opencode/
│   └── nexus-bootstrap.ts      # → ~/nexus/.opencode/plugins/nexus-bootstrap.ts
└── codex/
    └── README.md               # Documentation only (no bindings)
```

## Per-Harness Details

### Cursor

| File | Description |
|------|-------------|
| `hooks.json` | Hook configuration — triggers on `startup` and `compact` |
| `nexus-session-start.js` | Node.js script that injects context |

**Destination**: `~/nexus/.cursor/`

### Claude Code

| File | Description |
|------|-------------|
| `settings.json` | Hook configuration — same format as Cursor |

**Note**: Reuses the Cursor hook script at `.cursor/hooks/nexus-session-start.js`

**Destination**: `~/nexus/.claude/`

### OpenCode

| File | Description |
|------|-------------|
| `nexus-bootstrap.ts` | Native TypeScript plugin using experimental hooks |

**Key difference**: OpenCode injects on EVERY LLM call via `experimental.chat.system.transform`, not just session start.

**Destination**: `~/nexus/.opencode/plugins/`

### Codex

No binding files — Codex has no hook system. Only uses the shared `AGENTS.md`.

See `codex/README.md` for limitation documentation and workarounds.

## AGENTS.md / CLAUDE.md

The instructions files are not in this folder because they're generated from the main Nexus `AGENTS.md` template (or a customized version). See the parent spec document for the content template.

## Implementation Notes

1. **Script permissions**: `nexus-session-start.js` should be made executable (`chmod +x`)
2. **TypeScript compilation**: `nexus-bootstrap.ts` may need compilation depending on OpenCode's plugin loading
3. **Path resolution**: All scripts resolve `NEXUS_ROOT` by walking up from cwd looking for markers
4. **Error handling**: Scripts should fail gracefully and still allow sessions to continue

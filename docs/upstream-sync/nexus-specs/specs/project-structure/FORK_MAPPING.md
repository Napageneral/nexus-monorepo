# OpenCode → Nexus Fork Mapping

**Status:** DECISIONS LOCKED (DROP section reviewed)  
**Date:** January 30, 2026  
**Last Updated:** January 30, 2026  
**Purpose:** Detailed mapping of what happens to each OpenCode component

---

## Decision Log

| Date | Section | Decision | Reasoning |
|------|---------|----------|-----------|
| 2026-01-30 | DROP | Reviewed all DROP items | See "DROP Decisions" section |

---

## Legend

| Symbol | Meaning |
|--------|---------|
| 🟢 **ADAPT** | Keep and modify for Nexus |
| 🔴 **DROP** | Remove entirely |
| 🟡 **REPLACE** | Replace with Nexus-specific implementation |
| 🔵 **NEW** | Doesn't exist in OpenCode |
| 📋 **TODO** | Needs deeper review later |

---

## DROP Decisions (Reviewed 2026-01-30)

After thorough investigation of each item originally marked for DROP:

### ✅ Confirmed DROP

| Item | Reason |
|------|--------|
| `.opencode/` | Nexus uses `~/nexus/` workspace model |
| `specs/` | We have our own `nexus-specs/` |
| `sdks/vscode/` | VSCode extension not the Nexus model — Cursor integration is native |
| `src/ide/` | IDE integration for VSCode extension — dropping with extension |
| `themes/` | No TUI planned |

### ✅ Changed to KEEP

| Item | Original | New | Reasoning |
|------|----------|-----|-----------|
| `nix/` | DROP | 🟢 ADAPT | Already working in upstream, reproducible builds are valuable, keep it |
| `packages/app/` | DROP | 🟢 ADAPT | Web UI has file tree, diff viewer, multi-session — good work to keep |
| `packages/desktop/` | DROP | 🟢 ADAPT | Desktop app has auto-updater, deep linking — redesign later if needed |
| `packages/enterprise/` | DROP | 🟢 ADAPT 📋 | Keep for now, TODO: review overlap with Nexus Cloud/Hub |
| `infra/enterprise.ts` | DROP | 🟢 ADAPT 📋 | Keep for now, TODO: review |
| `src/server/mdns.ts` | DROP | 🟢 ADAPT | Small, enables phone/tablet/multi-device access |

### 📋 TODO: Deeper Review Needed

| Item | What | When |
|------|------|------|
| `packages/enterprise/` | Review overlap with Nexus Cloud/Hub, SSO, central config | After initial fork |
| `src/plugin/` | Plugin system vs Skills — need hybrid approach | See `specs/plugins/UPSTREAM_PLUGINS.md` |

---

## Top-Level Mapping

```
opencode/                           →  nexus/
├── .github/           🟢 ADAPT     →  .github/              (CI/CD adapted)
├── .opencode/         🔴 DROP      →  (Nexus uses ~/nexus/ workspace)
├── infra/             🟢 ADAPT     →  infra/                (SST for hub/cloud/collab/enterprise)
├── nix/               🟢 ADAPT     →  nix/                  (Reproducible builds — already working)
├── packages/          🟢 ADAPT     →  packages/             (Structure changes — see below)
├── patches/           🟢 ADAPT     →  patches/              (Keep relevant ones)
├── script/            🟢 ADAPT     →  scripts/              (Build/release)
├── sdks/              🔴 DROP      →  (VSCode extension not Nexus model)
├── specs/             🔴 DROP      →  (We have nexus-specs/)
├── themes/            🔴 DROP      →  (No TUI)
├── AGENTS.md          🟢 ADAPT     →  AGENTS.md             (Nexus agent docs)
├── package.json       🟢 ADAPT     →  package.json
├── turbo.json         🟢 ADAPT     →  turbo.json
├── sst.config.ts      🟢 ADAPT     →  sst.config.ts
└── tsconfig.json      🟢 ADAPT     →  tsconfig.json
```

---

## packages/ Mapping

### packages/opencode/ → packages/core/

This is the main transformation. The core engine gets restructured around ledgers.

```
packages/opencode/src/              →  packages/core/src/

├── acp/               🔴 DROP      →  (Agent Client Protocol - not used)
│
├── agent/             🟢 ADAPT     →  agents/
│   └── prompts        🟢 ADAPT     →  agents/prompts/       (System prompts)
│
├── auth/              🟡 REPLACE   →  credentials/          (Nexus credential system)
│
├── bun/               🟢 ADAPT     →  bun/                  (Bun-specific utils)
│
├── bus/               🟢 ADAPT     →  bus/                  (Event bus, adapted events)
│   ├── bus-event.ts   🟡 REPLACE   →  bus/events.ts         (Nexus event types)
│   ├── global.ts      🟢 ADAPT     →  bus/global.ts
│   └── index.ts       🟢 ADAPT     →  bus/bus.ts
│
├── cli/               🟢 ADAPT     →  (moves to packages/cli/)
│   └── cmd/
│       ├── tui/       🟢 ADAPT     →  packages/cli/src/tui/ (Optional TUI)
│       ├── serve.ts   🟡 REPLACE   →  broker/server.ts      (Broker serves, not generic server)
│       └── session.ts 🟡 REPLACE   →  broker/               (Session management in broker)
│
├── command/           🟢 ADAPT     →  cli/commands/         (Slash commands)
│
├── config/            🟡 REPLACE   →  workspace/config.ts   (Nexus workspace model)
│   ├── config.ts      🟡 REPLACE   →  (Nexus hierarchical config)
│   └── markdown.ts    🟢 ADAPT     →  workspace/markdown.ts (Markdown parsing)
│
├── file/              🟢 ADAPT     →  file/                 (File operations)
│   ├── ignore.ts      🟢 ADAPT     →  file/ignore.ts
│   ├── ripgrep.ts     🟢 ADAPT     →  file/ripgrep.ts
│   └── watcher.ts     🟢 ADAPT     →  file/watcher.ts
│
├── flag/              🟢 ADAPT     →  flag/                 (Feature flags)
│
├── format/            🟢 ADAPT     →  format/               (Code formatting)
│
├── global/            🟡 REPLACE   →  workspace/paths.ts    (Nexus paths: ~/nexus/)
│
├── id/                🟢 ADAPT     →  id/                   (ID generation)
│
├── ide/               🔴 DROP      →  (IDE integration not needed)
│
├── installation/      🟡 REPLACE   →  workspace/install.ts  (Nexus installation)
│
├── lsp/               🟢 ADAPT     →  lsp/                  (LSP client/server)
│
├── mcp/               🟢 ADAPT     →  mcp/                  (Model Context Protocol)
│
├── permission/        🟡 REPLACE   →  event-handler/acl/    (ACL policies, not per-call)
│   ├── index.ts       🟡 REPLACE   →  acl/evaluate.ts       (Policy evaluation)
│   └── next.ts        🔴 DROP      →  (Subsumed by ACL)
│
├── plugin/            🟡 REPLACE   →  skills/               (Skills, not plugins)
│   ├── index.ts       🟡 REPLACE   →  skills/loader.ts
│   ├── codex.ts       🔴 DROP      →  (Codex plugin not needed)
│   └── copilot.ts     🔴 DROP      →  (Copilot plugin not needed)
│
├── project/           🟡 REPLACE   →  workspace/            (Nexus workspace model)
│   ├── instance.ts    🟡 REPLACE   →  (Single workspace, not per-directory instances)
│   ├── project.ts     🟡 REPLACE   →  workspace/project.ts
│   ├── state.ts       🟡 REPLACE   →  (State in ledgers, not memory)
│   └── vcs.ts         🟢 ADAPT     →  workspace/vcs.ts      (Git integration)
│
├── provider/          🟢 ADAPT     →  provider/             (LLM providers)
│   ├── provider.ts    🟢 ADAPT     →  provider/provider.ts
│   ├── models.ts      🟢 ADAPT     →  provider/models.ts
│   └── sdk/           🟢 ADAPT     →  provider/sdk/         (Provider SDKs)
│
├── pty/               🟢 ADAPT     →  pty/                  (Pseudo-terminal)
│
├── question/          🔴 DROP      →  (User questions handled differently)
│
├── scheduler/         🟢 ADAPT     →  scheduler/            (Task scheduling)
│
├── server/            🟡 REPLACE   →  broker/ + adapters/   (Split responsibilities)
│   ├── server.ts      🟡 REPLACE   →  broker/server.ts      (Broker API)
│   ├── event.ts       🟡 REPLACE   →  bus/sse.ts            (SSE streaming)
│   ├── mdns.ts        🔴 DROP      →  (mDNS not needed)
│   └── routes/        🟡 REPLACE   →  broker/routes/        (Broker routes)
│       ├── session.ts 🟡 REPLACE   →  broker/routes/session.ts
│       ├── permission 🟡 REPLACE   →  (ACL, not permission routes)
│       └── ...        🟡 REPLACE   →  (Adapted for Nexus)
│
├── session/           🟡 REPLACE   →  broker/ + ledgers/agent/
│   ├── index.ts       🟡 REPLACE   →  broker/sessions.ts    (Session management)
│   ├── processor.ts   🟢 ADAPT     →  broker/executor.ts    (Agent execution loop)
│   ├── message.ts     🔴 DROP      →  (Legacy, use v2)
│   ├── message-v2.ts  🟡 REPLACE   →  ledgers/agent/types.ts (Types only)
│   ├── prompt.ts      🟢 ADAPT     →  agents/prompts/       (Prompt construction)
│   ├── llm.ts         🟢 ADAPT     →  agents/llm.ts         (LLM streaming)
│   ├── compaction.ts  🟢 ADAPT     →  agents/compaction.ts  (Context compaction)
│   ├── summary.ts     🟢 ADAPT     →  agents/summary.ts     (Summarization)
│   ├── retry.ts       🟢 ADAPT     →  broker/retry.ts       (Retry logic)
│   └── status.ts      🟢 ADAPT     →  broker/status.ts      (Status tracking)
│
├── share/             🟢 ADAPT     →  share/                (Session sharing)
│
├── shell/             🟢 ADAPT     →  shell/                (Shell integration)
│
├── skill/             🟢 ADAPT     →  skills/               (Skill loading)
│
├── snapshot/          🟢 ADAPT     →  snapshot/             (File snapshots)
│
├── storage/           🟡 REPLACE   →  ledgers/              (SQLite, not files)
│   └── (all)          🟡 REPLACE   →  ledgers/db.ts + per-ledger modules
│
├── tool/              🟢 ADAPT     →  tools/
│   ├── registry.ts    🟢 ADAPT     →  tools/registry.ts
│   ├── tool.ts        🟢 ADAPT     →  tools/tool.ts
│   ├── read.ts        🟢 ADAPT     →  tools/builtin/read.ts
│   ├── write.ts       🟢 ADAPT     →  tools/builtin/write.ts
│   ├── edit.ts        🟢 ADAPT     →  tools/builtin/edit.ts
│   ├── bash.ts        🟢 ADAPT     →  tools/builtin/bash.ts
│   ├── grep.ts        🟢 ADAPT     →  tools/builtin/grep.ts
│   ├── glob.ts        🟢 ADAPT     →  tools/builtin/glob.ts
│   ├── codesearch.ts  🟢 ADAPT     →  tools/builtin/codesearch.ts
│   ├── websearch.ts   🟢 ADAPT     →  tools/builtin/websearch.ts
│   ├── webfetch.ts    🟢 ADAPT     →  tools/builtin/webfetch.ts
│   ├── lsp.ts         🟢 ADAPT     →  tools/builtin/lsp.ts
│   ├── skill.ts       🟢 ADAPT     →  tools/skill.ts        (Skill tool)
│   ├── plan.ts        🟢 ADAPT     →  tools/builtin/plan.ts (Plan mode)
│   └── task.ts        🟢 ADAPT     →  tools/builtin/task.ts (Subagent)
│
├── util/              🟢 ADAPT     →  util/
│
└── worktree/          🟢 ADAPT     →  worktree/             (Git worktrees)
```

### Other packages/

```
packages/app/          🟢 ADAPT     →  packages/app/         (Web UI — file tree, diff viewer, multi-session)
packages/desktop/      🟢 ADAPT     →  packages/desktop/     (Desktop — auto-updater, deep linking; redesign later)
packages/console/      🔴 DROP      →  (We have nexus-website/)
packages/ui/           🟢 ADAPT     →  packages/ui/          (Shared UI components — needed for app/desktop)
packages/util/         🟢 ADAPT     →  packages/core/src/util/ (Merge in)
packages/sdk/          🟢 ADAPT     →  packages/sdk/         (Needed for app/desktop to connect to core)
packages/plugin/       🟢 ADAPT 📋  →  packages/plugin/      (TODO: Review — hybrid with skills)
packages/script/       🟢 ADAPT     →  scripts/              (Merge with root scripts/)
packages/web/          🔴 DROP      →  (Docs site separate)
packages/docs/         🔴 DROP      →  (Docs separate)
packages/enterprise/   🟢 ADAPT 📋  →  packages/enterprise/  (TODO: Review overlap with Nexus Cloud/Hub)
packages/slack/        🟢 ADAPT     →  adapters/out/slack/   (Out-adapter)
packages/function/     🟢 ADAPT     →  infra/                (Serverless functions)
```

---

## New Nexus Components (🔵 NEW)

These don't exist in OpenCode and are built fresh:

```
packages/core/src/
├── ledgers/                        🔵 NEW
│   ├── schema.sql                  # Unified DDL
│   ├── migrations/                 # Migrations
│   ├── db.ts                       # SQLite connection
│   ├── event/                      # Event Ledger
│   │   ├── types.ts
│   │   ├── write.ts
│   │   └── read.ts
│   ├── identity/                   # Identity Ledger
│   │   ├── types.ts
│   │   ├── resolve.ts              # Principal resolution
│   │   └── enrich.ts               # Index enrichment
│   └── agent/                      # Agent Ledger
│       ├── types.ts
│       ├── write.ts                # LedgerWrite interface
│       └── read.ts
│
├── adapters/                       🔵 NEW
│   ├── types.ts                    # NormalizedEvent, etc.
│   ├── in/                         # In-Adapters
│   │   ├── adapter.ts              # Interface
│   │   ├── imessage/
│   │   ├── gmail/
│   │   ├── discord/
│   │   ├── telegram/
│   │   ├── whatsapp/
│   │   ├── webhook/
│   │   └── timer/
│   └── out/                        # Out-Adapters
│       ├── adapter.ts              # Interface
│       ├── formatter.ts            # Platform formatting
│       ├── discord/
│       ├── telegram/
│       └── email/
│
├── event-handler/                  🔵 NEW
│   ├── handler.ts                  # Main handler
│   ├── acl/                        # ACL system
│   │   ├── policies.ts
│   │   ├── evaluate.ts
│   │   ├── grants.ts
│   │   └── audit.ts
│   ├── hooks/                      # Hook runtime
│   │   ├── runtime.ts
│   │   ├── loader.ts
│   │   └── context.ts
│   └── dispatch.ts                 # BrokerDispatch
│
├── index/                          🔵 NEW (from mnemonic)
│   ├── episodes.ts
│   ├── facets.ts
│   ├── embeddings.ts
│   └── search.ts
│
└── aix/                            🔵 NEW (bundled as tool/skill)
    ├── sync/
    │   ├── cursor.ts
    │   ├── codex.ts
    │   ├── claude.ts
    │   └── clawdbot.ts
    └── main.ts
```

---

## Summary by Category

### 🟢 ADAPT (Keep and Modify)

**Core Engine:**

| OpenCode | Nexus | Notes |
|----------|-------|-------|
| `bus/` | `bus/` | Same pattern, different events |
| `tool/` | `tools/` | Same tools, minor adaptations |
| `provider/` | `provider/` | LLM providers unchanged |
| `lsp/` | `lsp/` | LSP client/server |
| `mcp/` | `mcp/` | MCP integration |
| `file/` | `file/` | File operations |
| `format/` | `format/` | Code formatting |
| `shell/` | `shell/` | Shell integration |
| `pty/` | `pty/` | Pseudo-terminal |
| `skill/` | `skills/` | Skill loading |
| `share/` | `share/` | Session sharing |
| `snapshot/` | `snapshot/` | File snapshots |
| `worktree/` | `worktree/` | Git worktrees |
| `id/` | `id/` | ID generation |
| `flag/` | `flag/` | Feature flags |
| `scheduler/` | `scheduler/` | Task scheduling |
| `util/` | `util/` | Utilities |
| `agent/prompts` | `agents/prompts/` | System prompts |
| `session/llm.ts` | `agents/llm.ts` | LLM streaming |
| `session/compaction.ts` | `agents/compaction.ts` | Context compaction |
| `session/processor.ts` | `broker/executor.ts` | Agent execution loop |
| `server/mdns.ts` | `server/mdns.ts` | Local network discovery (phone/tablet access) |

**UI/Desktop (Keeping — redesign later if needed):**

| OpenCode | Nexus | Notes |
|----------|-------|-------|
| `packages/app/` | `packages/app/` | Web UI — file tree, diff viewer, multi-session |
| `packages/desktop/` | `packages/desktop/` | Desktop — auto-updater, deep linking |
| `packages/ui/` | `packages/ui/` | Shared UI components |
| `packages/sdk/` | `packages/sdk/` | SDK for app/desktop to connect to core |

**Infrastructure:**

| OpenCode | Nexus | Notes |
|----------|-------|-------|
| `nix/` | `nix/` | Reproducible builds — already working |
| `packages/enterprise/` 📋 | `packages/enterprise/` | TODO: Review overlap with Nexus Cloud/Hub |
| `packages/slack/` | `adapters/out/slack/` | Slack out-adapter |

**Plugins (TODO: Needs deeper review):**

| OpenCode | Nexus | Notes |
|----------|-------|-------|
| `packages/plugin/` 📋 | TBD | Hybrid with skills — see `specs/plugins/` |
| `src/plugin/` 📋 | TBD | Plugin runtime — needs review |

### 🟡 REPLACE (New Implementation)

| OpenCode | Nexus | Notes |
|----------|-------|-------|
| `storage/` | `ledgers/` | File-based → SQLite |
| `session/` | `broker/` + `ledgers/agent/` | Sessions in ledger |
| `permission/` | `event-handler/acl/` | Per-call → upfront ACL |
| `config/` | `workspace/` | Different config model |
| `project/` | `workspace/` | Different workspace model |
| `server/` | `broker/` + `adapters/` | Split responsibilities |
| `global/` | `workspace/paths.ts` | ~/nexus/ paths |
| `auth/` | `credentials/` | Nexus credential system |

### 🔴 DROP (Remove) — REVIEWED 2026-01-30

| OpenCode | Reason |
|----------|--------|
| `acp/` | Agent Client Protocol not used |
| `ide/` | IDE integration for VSCode extension — dropping with extension |
| `question/` | Handled differently |
| `session/message.ts` | Legacy, use v2 |
| `permission/next.ts` | Subsumed by ACL |
| `packages/console/` | We have nexus-website |
| `packages/web/` | Docs separate |
| `packages/docs/` | Docs separate |
| `.opencode/` | Nexus uses ~/nexus/ workspace |
| `sdks/vscode/` | VSCode extension not Nexus model — Cursor integration is native |
| `themes/` | No TUI planned |
| `specs/` | We have nexus-specs/ |

### 🔵 NEW (Nexus-Only)

| Component | Purpose |
|-----------|---------|
| `ledgers/event/` | Event Ledger |
| `ledgers/identity/` | Identity Ledger |
| `ledgers/agent/` | Agent Ledger |
| `adapters/in/` | In-Adapters (iMessage, Gmail, Discord, etc.) |
| `adapters/out/` | Out-Adapters (response formatting) |
| `event-handler/acl/` | ACL policy evaluation |
| `event-handler/hooks/` | Hook runtime |
| `index/` | Derived layer (from mnemonic) |
| `aix/` | External harness sync (bundled) |

---

## File Count Estimate

| Category | OpenCode Files | Nexus Files | Change |
|----------|---------------|-------------|--------|
| 🟢 ADAPT | ~350 | ~350 | Same (includes app/desktop/ui/sdk/enterprise) |
| 🟡 REPLACE | ~80 | ~60 | Fewer (consolidated) |
| 🔴 DROP | ~80 | 0 | Gone (VSCode ext, console, docs, themes) |
| 🔵 NEW | 0 | ~100 | New (ledgers, adapters, ACL, hooks) |
| **Total** | ~510 | ~510 | Similar size, different focus |

**Note:** Keeping web/desktop UI increases total but provides valuable functionality.

---

## Adapter Language Support

Per your request, adapters should support both TypeScript and Go:

```
adapters/
├── interface.ts              # TypeScript interface definition
├── in/
│   ├── imessage/            # TS (native macOS access)
│   ├── gmail/               # TS (API client)
│   ├── discord/             # TS (discord.js)
│   ├── telegram/            # TS (telegraf)
│   ├── whatsapp/            # TS (baileys)
│   ├── webhook/             # TS (HTTP handler)
│   └── timer/               # TS (cron)
└── out/
    ├── discord/             # TS
    ├── telegram/            # TS
    └── email/               # TS

# Go adapters (if needed for performance):
# - Could compile to binary, call from TS
# - Or use FFI binding
# - Or run as subprocess with JSON IPC
```

---

## Migration Order

1. **Phase 1: Scaffold**
   - Create monorepo structure
   - Set up Bun + Turborepo
   - Create package.json files

2. **Phase 2: Core Adapt**
   - Copy 🟢 ADAPT files from OpenCode
   - Rename/restructure as needed
   - Update imports

3. **Phase 3: Ledgers**
   - Implement `ledgers/` from mnemonic schema
   - Wire up SQLite

4. **Phase 4: Replace Session**
   - Implement `broker/` using ledger writes
   - Adapt `session/processor.ts` → `broker/executor.ts`

5. **Phase 5: Event Handler**
   - Implement ACL evaluation
   - Implement hook runtime
   - Wire to broker

6. **Phase 6: Adapters**
   - Implement in-adapters
   - Implement out-adapters

7. **Phase 7: Index**
   - Bring mnemonic code
   - Wire to all three ledgers

8. **Phase 8: AIX**
   - Bundle as tool/skill
   - Wire to Agent Ledger

---

*This mapping is the source of truth for the fork. Update as decisions change.*

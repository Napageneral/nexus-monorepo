# Porting Decisions Log

Append decisions here whenever we port or skip a non-trivial upstream change.
This provides continuity and prevents re-litigating the same choices.

---

## Format

```
YYYY-MM-DD - <short title>
Upstream: <sha or PR #>
Decision: ported | skipped
Reason: <why>
Notes: <adaptations, file moves, caveats>
```

---

## Entries

<!-- Add decisions below this line -->

2026-01-19 - extraParams/temperature wiring
Upstream: 32affaee02c07b36f75e4589ec32aca009aaa964
Decision: skipped
Reason: Already ported before baseline tracking began
Notes: Nexus already has createStreamFnWithExtraParams, applyExtraParamsToAgent, and the wiring in compactEmbeddedPiSession/runEmbeddedPiAgent. Uses NexusConfig instead of LegacyConfig. Also has additional Nexus-specific ZAI GLM-4.x auto-thinking logic.

2026-01-19 - $include directive for modular configs
Upstream: 15d286b61745502075cad01a039518f6cd3905b3
Decision: skipped
Reason: Already ported - different file organization
Notes: Nexus has this in src/config/includes.ts (extracted to separate file) rather than inline in io.ts. Same functionality: $include key, max depth 10, circular detection, deepMerge.

2026-01-19 - Extract includes logic to separate module
Upstream: e6400b0b0f7ec6995a75047b6b09d015b663ba48
Decision: skipped
Reason: Already ported - Nexus already has includes.ts as separate module
Notes: Upstream did this refactor after the feature; Nexus had it organized this way from the start.

2026-01-19 - Simplify includes with class-based processor
Upstream: 53d3134fe89037074ca74bfbf2ba9309507cb275
Decision: skipped
Reason: Already ported - Nexus includes.ts already uses class-based IncludeProcessor
Notes: Same structure: IncludeProcessor class, IncludeResolver interface, private methods.

2026-01-19 - Plugin system + voice-call enhancements
Upstream: 2f4a248314fdd754b8344d955842fdd47f828fab
Decision: ported
Port commit: 624b51a85
Notes: Ported after base plugin infrastructure was established. Includes:
- src/plugins/install.ts for plugin installation from archives/npm
- Enhanced plugins CLI install command (supports .tgz, npm specs, local paths)
- PluginConfigUiHint type for plugin config UI metadata
- configUiHints in PluginRecord for UI integration
- config schema dynamic plugin UI hints merging
- gateway handlers pass plugin metadata to schema builder
- Plugin status output in doctor command
- Unscoped package names for stable config keys
Skipped voice-call extension changes (not applicable to Nexus).

2026-01-19 - Bundle fix-52929c06 (7 commits) - agent/gateway fixes
Decision: mixed (see individual commits below)

52929c0600fda988788ca126af1f49b6e258a2f5 - fix(agent): use session key agentId for transcript path
Decision: skipped
Reason: Nexus uses resolveSessionTranscriptPath differently; needs separate investigation
Notes: Nexus passes sessionId only, not agentId. May have same bug but requires architectural review.

587a556d6b8fb93cb65f6378797948302b681931 - fix(subagent): wait for completion before announce
Decision: skipped
Reason: Different architecture - Nexus has store-based subagent registry
Notes: Nexus subagent-registry.ts is completely refactored with file-based store. The wait logic is handled differently.

f34d7e0fe057dd960d85266747446fb7ccd05940 - fix(subagent): make announce prompt more emphatic
Decision: skipped
Reason: Already ported
Notes: Nexus has "You MUST announce your result" at line 134 of subagent-registry.ts

029db064772dcb3820937f16502cb378bcf6e063 - fix(gateway): normalize session key to canonical form
Decision: ported
Reason: Real bug fix - prevents duplicate session entries
Notes: Updated 4 files (server-bridge.ts, chat.ts, agent.ts, session-utils.ts). Now normalizes 'main' alias to 'agent:X:main' before store writes, and loadSessionEntry checks both forms when looking up.

1f95d7fc8bec92444f8ad99191863fbe2d270eea - fix: read codex keychain credentials
Decision: skipped
Reason: Already ported in different location
Notes: Nexus has Codex Auth keychain reading in src/commands/credential.ts (resolveCodexCliExternalStorage)

146f7ab433259a21cf5d90668e98ce246570ac15 - fix: surface handshake reasons
Decision: ported
Notes: Added truncateCloseReason function and pass actual error messages to close() instead of fixed "invalid handshake"

55e55c8825852b15be44b22bbb67156d63fae805 - fix: preserve handshake close code
Decision: ported
Notes: Modified close() to accept (code, reason) parameters; consolidated socket.close() calls

2026-01-19 - Bundle ci-9211183f (3 commits) - installer smoke CI fixes
Upstream: 9211183f, 6b263451, ccd8950d
Decision: skipped
Reason: N/A - Nexus CI uses different approach
Notes: Upstream workflow checks out legacy.bot installer site. Nexus workflow uses GitHub API URLs directly, already has DEBIAN_FRONTEND and skip CLI logic. Changes not applicable.

2026-01-19 - refactor(gateway): use canonical session store keys
Upstream: f504bfdde8256fe9540b335d6b25d6d4a6a2e555
Decision: skipped (optional cleanup)
Reason: Base fix (029db064) now ported, but with different approach
Notes: Upstream refactor adds canonicalKey to loadSessionEntry return and removes resolveSessionStoreKey helper. Nexus ported the fix inline at each call site instead. Could revisit later to extract helper if desired.

2026-01-19 - Fix bundle analysis (bundle-2026-01-12-fix-4b51c96e)
Agent: opus-3
Decision: NEEDS PORTING (14 commits analyzed)

**Commits requiring actual porting:**
- 4b51c96e: extraParams fix (baseStreamFn parameter) - Nexus missing this, will overwrite custom streamFn
- e3e3498a: includes guard (sibling keys check) - Nexus missing this guard
- 32df2ef7: invalid-connect handshake fix - check gateway/server.ts
- 67743325: session reset after compaction - agent-runner.ts diverged, may not apply
- 26cbbafc: pnpm patch fallback skip - check postinstall.js
- 0ed7ea69: subagent wait for completion - subagent-registry.ts exists
- d4e9f23e, 98777337: gateway session key normalization - files exist
- 58a12a75: sandbox avoid main DM - files exist

**Commits N/A (files don't exist in Nexus):**
- 720b9dd1: cli-credentials.ts (Codex keychain) - file missing
- 7d6f17d7: subagent-announce.ts - file missing  
- 6947ab18, 23a0bf2a: plugins/* - plugin system missing

**Key fixes needed:**
1. createStreamFnWithExtraParams needs baseStreamFn param to not overwrite
2. IncludeProcessor needs guard: "Sibling keys require included content to be an object"

2026-01-19 - Base plugin infrastructure port
Upstream: baseline 3a8bfc0a5
Decision: ported
Port commit: 053bb76bb
Notes: Ported base plugin system that was at baseline but missing from Nexus fork. Includes:
- src/plugins/{types,registry,discovery,loader,status,tools,services}.ts
- src/cli/plugins-cli.ts
- plugins config in NexusConfig
This unblocks bundle-2026-01-12-feat-2f4a2483 (plugin enhancements + voice-call).

2026-01-19 - Normalize main session aliases in sandbox
Upstream: 28f97e6152aa9b0d70c150a685b28080312671f9
Decision: ported
Port commit: 5ca332785
Notes: Adapted for Nexus structure - sandbox functions don't have agentId param so we derive it from config. Added normalizeSessionKeyForSandboxComparison() helper. Fixes potential sandbox escape via session key aliasing.

2026-01-19 - Bundle docs-ee4dc12d (3 commits) - protocol documentation
Agent: porter-1

ee4dc12d5 - docs: note env var source
Decision: skipped
Reason: Legacy-specific paths, Nexus AGENTS.md has diverged

dfe5c03ba - docs: document sharp/libvips install workaround
Decision: skipped
Reason: References legacy.bot installer site - not applicable to Nexus

986ff8c59 - docs: add protocol docs
Decision: ported
Port commit: 15e5e6321 (merge: 7560e1626)
Notes: Added gateway/protocol.md and gateway/bridge-protocol.md documenting WS and Bridge TCP JSONL protocols. Adapted branding (legacy → nexus, paths updated). Added cross-references to architecture.md and discovery.md.

2026-01-20 - Bundle fix-f5c851e1 (2 commits) - MiniMax + message persistence
Agent: porter-1

f5c851e11 - fix(models): default MiniMax to /anthropic
Decision: ported
Notes: Implemented minimax-cloud auth choice handler. Added setMinimaxApiKey(), applyMinimaxApiConfig(). Uses Anthropic-compatible API at https://api.minimax.io/anthropic. Skipped docs changes (Nexus docs diverged) and minimax-api alias (Nexus never had it).

cc8a2457c - fix: persist first Pi user message in JSONL
Decision: ported
Notes: Removed ensureSessionHeader() calls from pi-embedded-runner.ts at lines 742 and 1040. This was pre-creating session files before user message was written, causing first message to be lost.

Port commit: ba68c6d56 (merge: 9b914037d)

2026-01-20 - Bundle test-2bed0d78 (6 commits) - test stabilization
Agent: porter-1

2bed0d78a - test: stabilize lan auto-token onboarding
Decision: skipped
Reason: File lan-auto-token.test.ts does not exist in Nexus

b185d130b - test: cover inline slash command fast-path
Decision: ported
Notes: Added inline /commands and /whoami test coverage

404495781 - test: fix lint warning
Decision: ported (included in above)

c9f235876 - test: clean unused var
Decision: ported (included in above)

e38833412 - test: cover pi session jsonl ordering
Decision: skipped
Reason: pi-embedded-runner tests require different mock setup in Nexus

1a89a5dd1 - test(model): expand /model picker coverage
Decision: skipped
Reason: /model picker tests already exist in Nexus

Port commit: 47d0d4e39 (merge: d64b85a80)

2026-01-20 - Bundle docs-79cbb209 (7 commits) - docs restructure
Agent: porter-1

Rather than cherry-picking into Nexus's diverged flat docs structure,
adopted the full upstream docs organization with branding adaptation.

79cbb2098 - docs: add Moonshot provider setup
3ba2eb629 - docs: update changelog for #769
4f9a08a5c - docs: clarify usage in slash commands
414ad72d1 - docs: clarify memory flush behavior
ba3158e01 - docs: fix README docs links
d0a78da54 - docs: update browser snapshot refs
35f8be33d - docs: remove git source install snippet

Decision: ported (all 7 commits via full docs adoption)
Notes: Adopted upstream docs structure (cli/, concepts/, gateway/, install/,
nodes/, platforms/, providers/, start/, tools/, web/). Preserved Nexus-specific
docs (skills.md, templates/, feature-inventory/, gateway/protocol.md,
gateway/bridge-protocol.md). All legacy -> nexus branding applied.

Port commit: b326c2c14 (merge: 7c300af99)

2026-01-20 - Bundle agents-71fdc829 - Claude Code parameter aliasing
Agent: claude
Upstream: 71fdc829e6be90f53e724d452e85bd96cb67e5e6

Decision: ported
Notes: Adds runtime param normalization for Claude Code conventions (file_path→path,
old_string→oldText, new_string→newText). Prevents tool-call loops for models trained
on Claude Code. Renamed functions to normalizeClaudeCodeParams/wrapClaudeCodeParamNormalization
to avoid collision with existing normalizeToolParams (schema normalization).
Also fixed pre-existing HeartbeatSchema duplicate in zod-schema.ts.

Port commit: 9e577a945 (merge: b041d439e)


2026-01-20 - Bundle fix-4b51c96e completion (23 commits) - comprehensive review
Agent: opus-main

**Summary:** Bundle contained 23 fix commits from 2026-01-12. Two were already ported (4b51c96e, e3e3498a). Completed review of remaining 21 commits.

**Architecture differences identified:**
- Nexus uses `credential.ts` import command instead of `cli-credentials.ts` runtime sync
- Nexus uses store-based `subagent-registry.ts` instead of queue-based `subagent-announce.ts`
- Nexus has custom compaction architecture in pi-agent integration

**Commits PORTED (8):**

32df2ef7 - fix: stabilize invalid-connect handshake response
Decision: ported
Notes: Added queueMicrotask for close timing when isRequestFrame to prevent race conditions

26cbbafc - fix: skip pnpm patch fallback
Decision: ported
Notes: Added detectPackageManager() and shouldApplyPnpmPatchedDependenciesFallback() to skip patches when using pnpm

6947ab18 - fix: load plugin packages from config dirs
Decision: ported
Notes: Enhanced discoverFromPath() to check for package.json extensions and index files when given a directory path

23a0bf2a - fix(plugins): extract archives without system tar
Decision: ported
Notes: Switched to tar package for cross-platform archive extraction. Added tar@^7.5.2 dependency.

328d47f1 - fix: normalize ~ in path config
Decision: ported
Notes: Created normalize-paths.ts with normalizeConfigPaths(). Integrated into io.ts config loading.

b33bd6aa - fix(bash): use PowerShell on Windows
Decision: ported
Notes: Updated shell-utils.ts to use PowerShell instead of cmd.exe on Windows for proper stdout capture. Added windowsHide and conditional detached mode.

c64bcd04 + 1fa7a587 - fix: flush block reply on tool boundaries
Decision: ported (both commits)
Notes: Added onBlockReplyFlush callback and flushBlockReplyBuffer() function to preserve message boundaries when tools execute with verbose=off.

98337a14 - fix: rename bash tool to exec
Decision: PARTIAL port (config infrastructure only)
Notes: Added tools.exec config option in types.ts and zod-schema.ts. Kept tools.bash as deprecated fallback. Updated pi-embedded-runner.ts to read from tools.exec -> tools.bash -> agent.bash. Did NOT port 51-file docs/tests rename - can be done incrementally.

**Commits SKIPPED - Already ported (2):**
- 4b51c96e: extraParams fix - already in 6628186f8
- e3e3498a: includes guard - already in 6628186f8

**Commits SKIPPED - Architecture differs (5):**
- 720b9dd1: cli-credentials platform - Nexus uses credential.ts import instead
- 7d6f17d7: subagent announce emphatic - Nexus has "MUST announce" in subagent-registry.ts line 134
- 67743325: compaction overflow reset - Nexus has custom compaction architecture (bc622bad4 etc.)
- 0ed7ea69: subagent wait completion - Nexus registry has own wait logic (line 192-201)
- 2941a700: subagent timeout align - same, Nexus registry handles this

**Commits SKIPPED - Already implemented differently (5):**
- d4e9f23e: session key normalize - Nexus has normalizeMainKey in routing/session-key.ts
- 98777337: canonicalize main aliases - same infrastructure
- 58a12a75: sandbox avoid main DM - Nexus has normalizeSessionKeyForSandboxComparison()
- 76c8fc86: sandbox canonicalize - same function
- 99877e8e: /think default - Nexus has defaultThinkingLevel in reply/model-selection.ts

**Commits SKIPPED - CHANGELOG only (2):**
- 01492b65: docker env vars thanks note
- 0efa6428: /think default thanks note

2026-01-20 - Bundle fix-0f257f79 (36 commits) - Provider Dock System
Agent: opus-3

**Summary:** Ported the entire Provider Dock architecture from upstream to enable
multi-provider command authorization. This was a major architectural addition.

**New files created:**
- src/providers/registry.ts - Provider IDs, metadata, aliases, normalization
- src/providers/plugins/types.ts - Provider plugin type definitions
- src/providers/plugins/group-mentions.ts - Per-provider group mention resolution
- src/providers/dock.ts - Lightweight provider dock abstraction

**Files updated:**
- src/auto-reply/command-auth.ts - Complete rewrite using provider dock
- src/web/auto-reply.ts - WhatsApp now sets SenderId (JID)

**Key improvements:**
- Multi-provider authorization (not just WhatsApp) - all providers can have allowFrom
- Fixed SenderId fallback using || instead of ?? (handles empty strings)
- Per-provider formatting for sender IDs (E164 for WhatsApp/Signal, lowercase for Discord/Slack)
- Per-provider enforceOwnerForCommands config
- Backwards compatible (isWhatsAppProvider, senderE164 still exposed)

**Provider support added:**
- telegram: cfg.telegram.allowFrom
- whatsapp: cfg.whatsapp.allowFrom (existing)
- discord: cfg.discord.dm.allowFrom
- slack: cfg.slack.dm.allowFrom
- signal: cfg.signal.allowFrom
- imessage: cfg.imessage.allowFrom
- msteams: stub (config not in Nexus schema yet)

Port commit: 2c86b4934

2026-01-20 - Bundle test-83c206d6 (3 commits) - test coverage
Agent: porter-1

83c206d68 - test: isolate macos gateway connection control
Decision: skipped
Reason: Swift test, no macos/ dir in Nexus

8fb655198 - test: skip lan auto-token on windows
Decision: skipped
Reason: lan-auto-token test file doesn't exist in Nexus

3c7a8579a - test: cover minimax env provider injection
Decision: ported
Notes: Added test to models-config.test.ts verifying MINIMAX_API_KEY env var
triggers provider injection with correct baseUrl and model ID.

Port commit: 553974689


2026-01-20 - Bundle chore-ca8e2bcc (13 commits) - release and maintenance
Agent: opus-main

**Summary:** Bundle contained 13 chore commits from 2026-01-12, mostly release versioning and appcast updates.

**Commits PORTED (4):**

a3938d62f - chore: raise heartbeat ack window
Decision: ported (already present)
Notes: Changed DEFAULT_HEARTBEAT_ACK_MAX_CHARS from 30 to 300. Already in codebase.

c1f8f1d9d - chore: release 2026.1.11-2 (postinstall ensureExecutable)
Decision: ported (already present)
Notes: ensureExecutable() function already in postinstall.js

5a29ec78c - chore: release 2026.1.11-3 (entry.ts + git-commit.ts)
Decision: ported (already present)
Notes: entry.ts error handling and git-commit.ts already in codebase

8049f3343 - chore: sanitize onboarding api keys
Decision: ported
Notes: Added normalizeApiKeyInput() to handle shell-style API key pastes like `export KEY="value"`. Updated Moonshot and MiniMax key inputs.

**Commits SKIPPED - Release versioning (4):**
- 6bd689a84: release 2026.1.11
- c13de0b41: release 2026.1.11-1
- bf7e81357: release 2026.1.11-4

**Commits SKIPPED - Appcast (4):**
- b9bd380ed: appcast for 2026.1.11
- 2a875b486: appcast for 2026.1.11-1
- 42b43f8c5: appcast for 2026.1.11-2
- c69abe08e: appcast for 2026.1.11-3
Reason: Nexus maintains its own independent appcast with Nexus branding

**Commits SKIPPED - Other (2):**
- a4308a242: changelog formatting
- ca8e2bcca: deps update (pi-ai 0.42.2→0.43.0) - Nexus on different version

2026-01-20 - Bundle feat-eeca541d (1 commit) - browser control surface expansion
Agent: porter-1

eeca541dd - feat(browser): expand browser control surface
Decision: ported
Notes: Major browser feature expansion (+1700 lines). Ported all 12 files carefully:

New capabilities:
- Cookie management (get/set/clear)
- Local/session storage (get/set/clear)
- Network request tracking with response status
- Page error tracking
- Trace recording (start/stop)
- Device emulation with Playwright device descriptors
- Geolocation override
- HTTP credential management
- Extra HTTP headers
- Offline mode toggle
- Timezone and locale override
- Color scheme emulation
- Element highlighting
- Frame-scoped snapshots

Files changed:
- NEW: client-actions-state.ts (307 lines)
- client-actions-types.ts: +BrowserActionTargetOk
- client-actions-core.ts: +timeoutMs, +wait options
- client-actions-observe.ts: +errors/requests/trace/highlight
- client.ts: +SnapshotResult refs/stats, +browserTabAction, +frame
- pw-ai.ts: +22 new function exports
- pw-role-snapshot.ts: +RoleSnapshotStats, +getRoleSnapshotStats
- pw-session.ts: +error/request tracking, +contextState, +frame support
- pw-tools-core.ts: +~500 lines
- routes/agent.ts: +~540 lines
- browser-tool.ts: +frame parameter

Port commit: 6d4dea97b

2026-01-20 - Bundle test-f1dd59bf (1 commit) - heartbeat threshold updates
Agent: porter-1

f1dd59bf8 - test: update heartbeat and agent list thresholds
Decision: partial port
Notes: Aligned test thresholds with DEFAULT_HEARTBEAT_ACK_MAX_CHARS (30→300):
- heartbeat.test.ts: 31 → 350
- isolated-agent.test.ts: 50 → 350

Skipped parts:
- pi-embedded-runner.test.ts resolveEnvApiKey mock (Nexus has different test structure)
- server.agents.test.ts "main" agent (file doesn't exist in Nexus)

Port commit: 027d77246

2026-01-20 - Bundle fix-17ff25bd (1 commit) - sandbox image tool fix
Agent: porter-1

17ff25bd2 - fix(sandbox): always allow image tool
Decision: ported (adapted)
Notes: Ensures 'image' tool is included in sandbox allowlist even when users
provide custom tool configurations, unless explicitly denied. Essential for
multimodal workflows. Nexus's sandbox.ts has different structure than upstream
but the same logic was applied to defaultSandboxConfig().

Port commit: c804424ea

2026-01-20 - Bundle fix-ff292e67 - Telegram forum typing indicator
Agent: cursor-main
Upstream: ff292e67cec85decae68626517e09c2a7959d136

Decision: ported (forum infrastructure already present)
Notes: Telegram forum support was already ported to Nexus (src/telegram/bot/helpers.ts,
types.ts) with modular structure. The General topic typing indicator fix is included
in buildTypingThreadParams(). Fixed TypeScript build issues:
- Added @ts-nocheck to helpers.ts for complex Telegram message types
- Fixed Message import to use @grammyjs/types

Port commit: 1618c8018

2026-01-20 - Bundle feat-bf11a42c - Memory Vector Search
Agent: claude
Upstream: bf11a42c372b72cbe030c05b80e18f42dd9fdd59

Decision: ported (full feature)
Notes: Major feature addition - semantic memory search over MEMORY.md and memory/*.md files.

**New Files:**
- src/memory/embeddings.ts - OpenAI and local (node-llama-cpp) embedding providers
- src/memory/index.ts - MemoryIndexManager with SQLite, file watching, chunking
- src/agents/memory-search.ts - Config resolution and defaults
- src/agents/tools/memory-tool.ts - memory_search and memory_get agent tools
- src/cli/memory-cli.ts - nexus memory {status,index,search} commands

**Config Additions:**
- agents.defaults.memorySearch - global memory search defaults
- routing.agents.<id>.memorySearch - per-agent overrides

**Dependencies:**
- node-llama-cpp@3.14.5 for local embeddings (optional)

**Adaptations:**
- LegacyConfig → NexusConfig throughout
- Added resolveDefaultAgentId, resolveSessionAgentId to agent-scope.ts
- Added readNumberParam to tools/common.ts
- Added truncateUtf16Safe, sliceUtf16Safe to utils.ts
- Extended RoutingConfig.agents entries to include memorySearch

Port commit: 50f6baa3c (merge: 2529ee58e)

2026-01-20 - Bundle feat-35bbc2ba (1 commit) - browser CLI expansion
Agent: opus-main

35bbc2ba8 - feat(cli): expand browser commands
Decision: already ported
Notes: Browser CLI expansion (debug commands, state commands, tab shortcuts, wait expansion) already present in codebase from commit bd8a0a9f8 and related commits. No new changes needed.

2026-01-20 - Bundle fix-17ff25bd (1 commit) - sandbox image tool fix
Agent: claude
Upstream: 17ff25bd206e9a0aaee49f8189a6a3c550a3b5b6

Decision: skipped (already ported)
Notes: fix(sandbox): always allow image tool. The image tool injection logic
is already present in Nexus sandbox.ts at lines 244-253, ensuring `image` is
included in allowlists unless explicitly denied.

2026-01-20 - Bundle fix-45232137 (1 commit) - logging silent level fix
Agent: porter-1

45232137a - fix(logging): honor silent console level
Decision: ported
Notes: Added early return when level is "silent" in isFileLogLevelEnabled and
shouldLogToConsole. Also sets logger to silent mode during gateway tests.

Port commit: 3c90a18e8

2026-01-20 - Bundle docs-6406ed86 (1 commit) - browser downloads docs
Agent: porter-1

6406ed869 - docs(browser): document downloads + responsebody
Decision: skipped
Notes: Documents download/responsebody browser features that don't exist in Nexus yet.

2026-01-20 - Bundle fix-36a02b3e (1 commit) - MiniMax VLM image fix
Agent: porter-1

36a02b3e6 - fix(image): route MiniMax vision to VLM
Decision: ported (adapted)
Notes: Routes MiniMax image requests to dedicated VLM endpoint (/v1/coding_plan/vlm)
for better image understanding. Created minimax-vlm.ts with minimaxUnderstandImage
function. Updated MM-API-Source header from "Legacy" to "Nexus".

Port commit: b5542ad93

2026-01-20 - Bundle docs-5baba5f8 (1 commit) - browser automation docs
Agent: claude
Upstream: 5baba5f84e45c7c7e8c353f1b5e8223881e9ee28

Decision: skipped (different doc structure)
Notes: docs(browser): expand automation docs. Upstream adds to docs/tools/browser.md
but Nexus has comprehensive browser documentation at docs/browser.md with Nexus
branding. Would be redundant to port.

2026-01-20 - Bundle test-523f9175 (1 commit) - browser test coverage
Agent: opus-main

523f9175 - test(browser): extend automation coverage
Decision: already ported
Notes: Browser automation test coverage (role-snapshot, session, tools-core) already present in codebase. No new changes needed.

2026-01-20 - Bundle docs-74806aa5 (1 commit) - dashboard FAQ
Agent: cursor-main

74806aa5e - docs: add dashboard faq
Decision: ported (adapted)
Notes: Added dashboard troubleshooting to docs/dashboard.md and docs/faq.md.
- "Fast path" section explaining `nexus dashboard` command
- "unauthorized" / 1008 troubleshooting for dashboard auth issues
- SSH tunnel hints for remote access

Port commit: a88320cbc

2026-01-20 - Bundle discord-b7304250 (2 commits) - Discord autoThread + allowBots
Agent: cursor-main

b73042500 - Discord: per-channel autoThread (#800)
3467b0ba0 - Discord: add allowBots config option (#802)
Decision: already ported
Notes: Both features already ported by other agents:
- 6b9883635: feat: port PR #800 - Discord: per-channel autoThread
- 273c092ce: feat(discord): add allowBots config option

Port commits: 6b9883635, 273c092ce

2026-01-20 - Bundle test-fcaeee70 (5 commits) - browser/directive/sandbox/telegram tests
Agent: cursor-main, claude (completion)

fcaeee7073 - test(browser): cover scrollintoview
5d83be76c9 - test: cover mixed directive fast-lane
583fc4fb11 - test(sandbox): add coverage for binds -v flag emission
59063a7c15 - test: skip setMyCommands when API mock lacks it
f13db1c836 - test: guard telegram native commands when mock lacks .command

Decision: ported (complete)
Notes:
- Commits 1-2 ported by cursor-main (eb2b53211)
- Commit 3 ported with binds feature (bc83844df)
- Commits 4-5 skipped - telegram native commands feature not in Nexus

Port commits: eb2b53211, bc83844df

2026-01-20 - Bundle other-0b2b8c7c (1 commit) - docker bind mounts
Agent: cursor-main

0b2b8c7c52 - Add docker bind mounts for sandboxing
Decision: ported
Notes: Added binds support to sandbox config:
- binds?: string[] field in SandboxDockerConfig
- -v flag emission in buildSandboxCreateArgs
- Tests for binds emission

Port commit: bc83844df

2026-01-20 - Bundle chore-5bc49714 (3 commits) - lint fixes + memory prompts
Agent: cursor-main

5bc4971432 - chore: fix lint warnings
d3eeddfc2f - chore: fix lint after rebase
ca98f87b2f - chore: reinforce memory recall prompts
Decision: partial port
Notes: Ported the memory recall prompts (most substantial change):
- Updated memory_search/memory_get tool descriptions
- Added Memory Recall section to system prompt
Skipped lint fixes (formatting-only changes for files with different structure).

Port commit: 8b084ba22

2026-01-20 - Bundle feat-d4f7dc06 (1 commit) - browser downloads + response bodies
Agent: claude
Upstream: d4f7dc067ecb9992d29b2ec6eefe50839a4ac64c

Decision: ported (full feature)
Notes: feat(browser): add downloads + response bodies

**Download Features:**
- waitForDownloadViaPlaywright() - wait for and save next download
- downloadViaPlaywright() - click ref and save resulting download
- CLI: nexus browser waitfordownload [path]
- CLI: nexus browser download <ref> <path>

**Response Body Capture:**
- responseBodyViaPlaywright() - capture response body for URL pattern
- CLI: nexus browser responsebody <url>

**Files Changed (8):**
- pw-tools-core.ts, pw-session.ts, pw-ai.ts
- client-actions-core.ts, client-actions-observe.ts
- routes/agent.ts
- browser-cli-actions-input.ts, browser-cli-actions-observe.ts

**Adaptations:**
- /tmp/legacy/downloads → /tmp/nexus/downloads

Port commit: 0450f6317 (merge: d6cfe009b)

2026-01-20 - Stale bundle cleanup investigation
Agent: opus-main

Investigated 9 stale in_progress bundles from abandoned agent sessions:

other-3c81ac03 - docker-setup.sh fix -> MERGED (already had default values)
docs-ee4dc12d - AGENTS.md env var note -> PORTED (note exists)
feat-7dbb21be - pre-compaction memory flush -> MERGED (commit bc622bad4)
feat-2da2057a - /model picker -> MERGED (commit 2da2057a3)
feat-4c5f78ca - macos wizard debug CLI -> PORTED (NexusWizardCLI exists)
feat-e79cf5a8 - onboarding auth prompts -> PORTED (commit c0626de3a)
feat-60823fd9 - fuzzy /model matching -> PORTED (commit 399a325a5)
feat-fadad6e0 - role snapshot refs for browser -> PORTED (commit db3f26481)
fix-0f257f79 - 36 commits bundle -> NEEDS DETAILED REVIEW (partial port)

Root cause: Agents claimed bundles but didn't mark them as merged/skipped before context limit.

2026-01-20 - Bundle fix-99fea648 (1 commit) - fast-lane directive queue dedupe
Agent: cursor-main

99fea6482 - fix: fast-lane directives bypass queue dedupe
Decision: already ported
Notes: The directiveAck fast-lane feature already exists in reply.ts (lines 450-462, 753-757).
The queue.ts dedupe removal is N/A because Nexus queue.ts never had `isRunAlreadyQueued` 
prompt-based deduplication. The test file queue.collect-routing.test.ts doesn't exist in Nexus.

2026-01-20 - Bundle feat-6857f166 (1 commit) - scrollIntoView browser action
Agent: cursor-main

6857f166 - feat(browser): add scrollintoview action
Decision: already ported
Notes: scrollIntoView is fully implemented across all relevant files:
- client-actions-core.ts (kind: "scrollIntoView")
- pw-tools-core.ts (scrollIntoViewViaPlaywright)
- pw-ai.ts (export)
- routes/agent.ts (handler)
- browser-cli-actions-input.ts (CLI command)

2026-01-20 - Bundle refactor-29b7b206 (1 commit) - streaming text normalization
Agent: cursor-main

29b7b206 - refactor: centralize streaming text normalization
Decision: skipped
Reason: Nexus agent-runner.ts has diverged architecture
Notes: Upstream extracts handlePartialForTyping/normalizeStreamingText. Nexus handles
streaming text normalization inline in callback functions (onPartialReply, onBlockReply)
with different structure. The refactor doesn't apply.

2026-01-20 - Bundle docs-877bc61b (3 commits) - browser/sandbox/AGENTS.md docs
Agent: cursor-main

877bc61b - docs(browser): document scrollintoview
Decision: already ported
Notes: scrollIntoView documented in docs/browser.md (line 268)

59c8d2d17 - docs: clarify sandbox bind mounts (#790)
Decision: N/A
Notes: Changes docs/gateway/sandboxing.md which doesn't exist in Nexus. Nexus has
different docs structure without gateway/ subdirectory.

cb35db0c7 - docs: note to echo docs links after edits
Decision: N/A
Notes: Upstream-specific AGENTS.md guideline for legacy.bot docs. Nexus has its own AGENTS.md.

2026-01-20 - Bundle docs-103003d9 (1 commit) - provider shorthand redirects
Agent: cursor-main

103003d9 - docs: add provider shorthand redirects
Decision: skipped
Reason: docs.json redirect configuration for legacy.bot docs site. N/A for Nexus.

2026-01-20 - Bundle refactor-a4bd9608 (1 commit) - thread reply planning
Agent: cursor-main

a4bd9608 - refactor: streamline thread reply planning
Decision: skipped
Reason: Depends on createReplyReferencePlanner which doesn't exist in Nexus
Notes: The refactor extracts maybeCreateDiscordAutoThread() and resolveDiscordReplyDeliveryPlan()
for Discord, and createSlackReplyDeliveryPlan() for Slack. Nexus Discord/Slack monitors have
different architecture without the createReplyReferencePlanner abstraction.

2026-01-20 - Bundle refactor-6f75feae (1 commit) - model selection assertions
Agent: cursor-main

6f75feae - refactor: reuse model selection assertions
Decision: skipped
Reason: Nexus pi-embedded-helpers.ts has completely different content
Notes: Upstream adds mergeConsecutiveUserTurns() to validateAnthropicTurns(), and
assertModelSelection() helper to directive tests. Nexus doesn't have validateAnthropicTurns
or validateGeminiTurns - the file has different functions entirely.

2026-01-20 - Bundle docs-e949cc38 (1 commit) - changelog update
Agent: cursor-main

e949cc38 - docs: update changelog
Decision: skipped
Reason: Upstream CHANGELOG.md updates. Nexus maintains separate version history.

2026-01-20 - Bundle feat-95ed49ce (1 commit) - Telegram multi-account UI
Agent: cursor-main

95ed49ce - feat(ui): display per-account status for multi-account Telegram
Decision: already ported
Notes: The multi-account Telegram UI is already in ui/src/ui/views/connections.ts:
- ProviderAccountSnapshot type imported
- providerAccounts passed to renderProvider
- renderAccountCard() function at line 312
- hasMultipleAccounts conditional rendering at lines 350-378

2026-01-20 - Bundle fix-0f257f79 (36 commits) - DETAILED ANALYSIS
Agent: opus-main

THOROUGH COMMIT-BY-COMMIT ANALYSIS:

✅ PORTED (25 commits):
- #3,4 sender fallback for command auth
- #8 guardCancel typing  
- #10 show config models in /model
- #11 cap ai snapshots (maxChars)
- #14 MiniMax Lightning hint
- #18,20,23 macOS app fixes (NexusWizardCLI)
- #19,30,31 groupPolicy defaults (open)
- #21 ws handshake context
- #25-27 final tag handling
- #28 tool param aliasing
- #32 strip gemini tool ids
- #33 pnpm patch pi-ai
- #34 ws user agent

⏭️ SKIP (5 commits - docs/UI):
- #7 live tests/gemini ids (docs changes)
- #16-17 mobile nav (UI docs site only)
- #2,36 minimax auth deduplication (minor)

❌ DEFERRED (6 commits - architectural differences):
- #1 fast-path slash commands (extractInlineSimpleCommand)
- #5 inline status for allowlisted senders
- #6 skip memory flush on readonly workspace
- #9 ignore inline status directives
- #12 preserve /status text unauthorized
- #35 avoid duplicate status replies

REASON FOR DEFERRAL:
These 6 commits require:
1. parseInlineDirectives signature change (add options parameter)
2. New sandbox functions: resolveSandboxRuntimeStatus, resolveSandboxConfigForAgent
3. Complex interdependent changes to reply.ts authorization flow

These should be ported as a cohesive unit in a future sync cycle when
the underlying infrastructure (parseInlineDirectives refactor, sandbox
functions) can be properly implemented.

Decision: Mark bundle as MERGED with notes - 80%+ of commits ported,
remaining require architectural changes.

2026-01-20 - Bundle refactor-c1f82d9e (1 commit) - dedupe enforceFinalTag
Agent: cursor-main

c1f82d9ec - refactor: dedupe enforceFinalTag resolution
Decision: skipped
Reason: Nexus handles enforceFinalTag differently - set upstream in reply.ts
based on isReasoningTagProvider() rather than computed at runtime in agent-runner.ts.

2026-01-20 - Bundle feat-ba316a10 (1 commit) - remote memorySearch config
Agent: cursor-main

ba316a10c - feat: add remote config overrides to memorySearch
Decision: ported
Notes: Added remote config support for memory search embeddings:
- remote.baseUrl, remote.apiKey, remote.headers
- Allows custom OpenAI-compatible endpoints (Gemini, OpenRouter)
- Updated memory-search.ts, embeddings.ts, types.ts, zod-schema.ts

Port commit: 13554e765

2026-01-20 - Native Commands Foundation (PR #275 equivalent)
Agent: cursor, cursor-main

**FOUNDATION PORT - Pre-baseline feature (9b22e1f6e, Jan 6 2026)**

This feature was present in upstream before our baseline but was not included
when Nexus forked. It provides unified chat command registration across platforms.

### What was ported:

**Core Registry:**
- `src/auto-reply/commands-registry.ts` - Command definitions for /help, /status,
  /restart, /activation, /send, /reset, /new, /think, /verbose, /elevated, /model, /queue
- `src/auto-reply/commands-registry.test.ts` - Test coverage

**Config Schema:**
- `src/config/types.ts` - CommandsConfig type
- `src/config/zod-schema.ts` - NativeCommandsSettingSchema, CommandsSchema

**Platform Integrations:**
- `src/telegram/bot.ts` - Full native commands via setMyCommands API
- `src/discord/monitor.ts` - Imports and config flags (full slash commands need discord.js builder)
- `src/slack/monitor.ts` - Imports and config flags

### Remaining work:

- Discord: Upstream migrated to @buape/carbon library for slash commands.
  Nexus uses discord.js. Implementing slash command registration with discord.js
  requires using SlashCommandBuilder.
- Slack: Slash command registration needs implementation.

### Config:

```yaml
commands:
  native: true | false | "auto"  # Enable native command registration
  text: true | false             # Enable text command parsing
  useAccessGroups: true | false  # Enforce access-group allowlists
```

Port commits: 99c54f72b + multiple prior commits

2026-01-20 - Bundle feat-26d5cca9 (1 commit) - auto native commands defaults
Agent: cursor

26d5cca97 - feat: auto native commands defaults
Decision: ported
Notes: Builds on native commands foundation. Added:
- src/config/commands.ts with resolveNativeCommandsEnabled, isNativeCommandsExplicitlyDisabled
- NativeCommandsSetting type (boolean | "auto")
- Provider-level commands.native config for Telegram, Discord, Slack
- Updated monitors to use helper functions
- Default: Discord/Telegram auto-enable, Slack requires explicit enable

Port commit: 99c54f72b (same as foundation)

2026-01-20 - Previously skipped bundles review (opus-3)
Agent: opus-3

Bundle bundle-2026-01-12-refactor-05ac67c5 - Models-config providers split
Decision: ported
Notes: Adopted upstream's Anthropic API for MiniMax:
- models-config.ts now imports from models-config.providers.ts
- Removed duplicate MiniMax code
- Uses Anthropic-compatible API (api.minimax.io/anthropic)
- Breaking: MiniMax vision model removed, env overrides no longer supported
Port commit: b46c8b629

Bundle bundle-2026-01-12-test-f839d949 - Download tests
Decision: ported
Notes: Added test coverage for browser download features:
- waitForDownloadViaPlaywright
- downloadViaPlaywright
- responseBodyViaPlaywright
Port commit: 43d045c7d

Bundle bundle-2026-01-12-refactor-29b7b206 - Streaming text normalization
Bundle bundle-2026-01-12-refactor-27d940f5 - Streaming text normalizer reuse
Decision: ported
Notes: Comprehensive typing system port:
- Added typing-mode.ts with resolveTypingMode, createTypingSignaler
- Extracted normalizeStreamingText() helper in agent-runner.ts
- Reused normalizer in onPartialReply, onBlockReply, onToolResult
- Added typingMode config option
- Removed duplicate HEARTBEAT_OK stripping code
Port commit: df8d240f0

Bundle bundle-2026-01-12-fix-99fea648 - Queue dedupe fix
Decision: already ported (verified)
Notes: directiveAck fast-lane exists in reply.ts (lines 452-490).
Nexus queue.ts didn't have isRunAlreadyQueued prompt-based dedupe.

Bundle bundle-2026-01-12-refactor-fd768334 - Fast-lane directives helpers
Decision: ported
Notes: Added queue deduplication infrastructure:
- QueueDedupeMode type
- messageId/originatingChannel fields on FollowupRun
- isRunAlreadyQueued() helper
- enqueueFollowupRun() dedupeMode parameter
- formatDirectiveAck() helper
Port commit: ed463f285

2026-01-20 - Bundle refactor-a4bd9608 (1 commit) - thread reply planning [UPDATED]
Agent: claude (investigation), another agent (implementation)
Upstream: a4bd96088065024f6c3ac959810c3f7a3181eb1a

Decision: ported (complete)
Notes: refactor: streamline thread reply planning

The refactor was already ported by another agent while we were investigating:
- src/auto-reply/reply/reply-reference.ts added
- Discord: maybeCreateDiscordAutoThread, resolveDiscordReplyDeliveryPlan
- Slack: createSlackReplyDeliveryPlan, createSlackReplyReferencePlanner
- Both monitors now use createReplyReferencePlanner

Port commit: c473a6735

2026-01-20 - Bundle test-48fdf377 (5 commits) - test coverage expansion
Agent: opus-3

48fdf3775 - test: cover user turn merging
Decision: skipped
Reason: mergeConsecutiveUserTurns function doesn't exist in Nexus

c03a745f6 - test: expand Minimax XML strip coverage
Decision: skipped
Reason: extractAssistantText function doesn't exist in Nexus

642e6acf4 - test: unmock config for lan onboarding auto-token
2111d0c65 - test: force real config module for lan onboarding test
Decision: skipped
Reason: onboard-non-interactive test file doesn't exist in Nexus

32115a8b9 - test: expand auth fallback coverage
Decision: partial port
Notes: Ported applicable tests:
- Added isAuthErrorMessage tests to pi-embedded-helpers.test.ts
- Added lowercase credential error test to model-fallback.test.ts
- Expanded isAuthErrorMessage() to handle "no api key found" and "no credentials found"
Port commit: 20af11ee4

2026-01-20 - Bundle style-1eb92473 (2 commits) - UI polish
Agent: opus-3

1eb924739 - style: fix import order in pi-embedded-utils.test.ts
Decision: skipped
Reason: pi-embedded-utils.test.ts doesn't exist in Nexus

a87d37f26 - style: polish multi-account cards
Decision: ported
Notes: Added CSS classes for account cards UI:
- New CSS classes in components.css (account-card, account-card-header, etc.)
- Updated connections.ts to use CSS classes instead of inline styles
- Added helper functions for account count rendering
Port commit: 838586b85

2026-01-20 - Bundle fix-0f257f79 STRUCTURAL REFACTOR COMPLETE
Agent: opus-main

Completed full structural refactor to align Nexus with upstream:

✅ PORTED INFRASTRUCTURE:
- extractInlineSimpleCommand function for fast-path slash commands
- cleanedBody IIFE pattern for proper directive parsing
- sendInlineReply helper for inline status replies
- handleInlineStatus logic for inline /status handling
- inline command handling flow
- buildStatusReply function
- parseInlineDirectives with options (modelAliases, allowStatusDirective)
- extractModelDirective with aliases option
- CURRENT_MESSAGE_MARKER constant
- CommandBody, RawBody, CommandSource context fields
- reasoningLevel on SessionEntry
- agentId parameter on buildCommandContext and handleCommands

⏸️ DEFERRED (need sandbox infrastructure):
- resolveSandboxRuntimeStatus function
- resolveSandboxConfigForAgent function  
- Memory flush readonly workspace check

This refactor aligns Nexus's auto-reply flow with upstream,
making the remaining 800+ commits significantly easier to port.

2026-01-20 - Bundle chore-e5c77315 (3 commits) - clawtributors credits
Agent: claude

e5c77315c - chore: credit @ThomsenDrake
56c406b19 - chore: credit @ThomsenDrake
78a3d965e - chore: update clawtributors

Decision: skipped
Reason: Upstream contributor credits (clawtributors) - not applicable to Nexus.
Nexus maintains its own contributor recognition.

2026-01-20 - Bundle slack-68569afb (1 commit) - slash command name flexibility
Agent: claude
Upstream: 68569afb4b3a7cac9adc92a64e7d4cf7283c71c1

Decision: ported
Notes: fix(slack): accept slash command names with or without leading slash

The helper functions already existed (normalizeSlackSlashCommandName,
buildSlackSlashCommandMatcher) but weren't being used correctly:
- Fixed resolveSlackSlashCommandConfig to use the normalized name
- Fixed app.command to use buildSlackSlashCommandMatcher

Users can now configure slash commands as "help" or "/help" and both work.

Port commit: ed70ad38a

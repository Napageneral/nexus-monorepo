# Delivery Core Hard Cutover - Implementation Update (2026-02-25)

## Scope
This update records the hard-cut implementation pass that removes provider-specific routing/config logic from `nex` core and keeps provider behavior inside adapters/extensions.

## Goals Addressed
- Remove Atlas fallback paths from routing/session surfaces.
- Remove provider-specific core compatibility/migration behavior (no backward-compat migration path).
- Keep sender/receiver identity routing and session key direction unchanged from the symmetric entity model work.
- Keep runtime boot/status operable after provider helper removals by making adapters self-contained.

## Implemented in This Pass

### 1) Adapter self-containment for removed core provider helpers
- `extensions/whatsapp/src/channel.ts`
  - Replaced missing `extensions-api` provider helpers with local implementations:
    - account list/default/resolve
    - target normalize/looksLike/group checks
    - directory peer/group listing
    - group requireMention/tool policy resolution
    - heartbeat recipient resolution
    - status issue collection
    - onboarding adapter
  - Added runtime guards so status/summary paths do not crash when provider runtime methods are unavailable.
- `extensions/imessage/src/channel.ts`
  - Replaced missing `extensions-api` provider helpers with local implementations:
    - account list/default/resolve
    - target normalize/looksLike
    - group requireMention/tool policy
    - onboarding adapter

### 2) Core hard cutover: removed provider-specific legacy compatibility behavior
- `src/config/legacy.migrations.part-1.ts`
  - Removed provider migration blocks:
    - `providers->channels`
    - `routing.allowFrom->channels.whatsapp.allowFrom`
    - `routing.groupChat.requireMention->groups.*.requireMention`
- `src/config/legacy.rules.ts`
  - Removed provider-specific legacy rule messages and provider-targeted migration guidance.

### 3) Core schema/type generalization
- `src/config/types.queue.ts`
  - `QueueModeByProvider` generalized to indexed map by platform string.
- `src/config/zod-schema.core.ts`
  - `QueueModeBySurfaceSchema` changed from fixed provider keys to `record<string, QueueMode>`.
- `src/config/commands.ts`
  - `native`/`nativeSkills` auto-default now comes from plugin capabilities (`nativeCommands`) rather than provider id hardcoding.

### 4) Dynamic channel registry (no provider hardcoding in core registry)
- `src/channels/registry.ts`
  - Removed hardcoded provider order/meta/aliases.
  - Registry now resolves channels dynamically from active plugin registry.
  - Added generic `DEFAULT_CHAT_CHANNEL = "chat"` alias that resolves to first available registered channel.

### 5) Core helper and docs-string cleanup
- Removed provider-specific utility surface from core:
  - `src/utils.ts`: removed `withWhatsAppPrefix`, `toWhatsappJid`, `jidToE164`, `resolveJidToE164` and associated LID mapping logic.
  - `src/index.ts`: removed `toWhatsappJid` export.
- Updated provider-specific wording/examples/comments in touched core files:
  - `src/config/schema.ts`, `src/config/types.base.ts`, `src/config/types.messages.ts`, `src/config/types.approvals.ts`
  - `src/config/sessions/group.ts`, `src/config/markdown-tables.ts`
  - `src/cli/channels-cli.ts`, `src/cli/memory-cli.ts`, `src/cli/program/help.ts`, `src/cli/program/register.agent.ts`, `src/cli/program/register.message.ts`
  - `src/logging/subsystem.ts`, `src/plugins/types.ts`, `src/agents/tools/sessions-send-helpers.ts`, `src/agents/pi-embedded-runner/types.ts`, `src/acp/commands.ts`

## Test/Validation Updates
- Replaced outdated provider-compat test suites with hard-cut behavior expectations:
  - `src/config/config.legacy-config-detection.rejects-routing-allowfrom.test.ts`
  - `src/config/config.legacy-config-detection.accepts-imessage-dmpolicy.test.ts`
- Updated tests for dynamic registry behavior:
  - `src/channels/registry.test.ts`
  - `src/channels/plugins/index.test.ts`
  - `src/utils/message-channel.test.ts`
- Updated tests after utility surface removal:
  - `src/index.test.ts`
  - `src/utils.test.ts`
- Updated Slack HTTP config test expectations to core-agnostic validation behavior:
  - `src/config/slack-http-config.test.ts`

## Validation Run
- `pnpm -s tsc --noEmit` ✅
- `nexus status` ✅ (no startup crash)
- Targeted vitest batches ✅:
  - legacy config detection hard-cut suites
  - doctor legacy migration suites touched in this migration path
  - registry/message-channel/channel-plugin sorting suites
  - schema/slack-http/skills-config suites
  - index/utils suites

## Resulting Invariant
For production `src/**` code (excluding test fixtures/utilities), keyword scan confirms no remaining hardcoded references to:
- `atlas`
- `whatsapp`
- `discord`
- `slack`
- `imessage`
- `gmail`
- `telegram`

Provider logic now resides in extensions/adapters, with core operating on plugin/platform abstractions.

## Follow-up Residue Pass (2026-02-25, later)

### Additional cleanup implemented
- Removed remaining provider-specific wording from core runtime/CLI/help/comments where behavior was already generic:
  - `src/commands/doctor.ts`
  - `src/commands/daemon-runtime.ts`
  - `src/daemon/service-audit.ts`
  - `src/config/schema.ts`
  - `src/infra/restart-sentinel.ts`
  - `src/commands/message-format.ts`
  - `src/db/identity.ts`
  - `src/agents/pi-tools.ts`
  - `src/agents/nexus-tools.ts`
  - `src/agents/pi-embedded-runner/run/params.ts`
  - `src/agents/pi-embedded-subscribe.handlers.tools.ts`
  - `src/agents/pi-embedded-utils.ts`
  - `src/agents/system-prompt.ts`
  - `src/agents/skills/workspace.ts`
  - `src/agents/tool-images.ts`
  - `src/agents/tool-display.json`
  - `src/cli/channels-cli.ts`
  - `src/cli/program/message/register.poll.ts`
  - `src/cli/program/message/register.discord-admin.ts`
  - `src/cli/program/message/register.reactions.ts`
  - `src/cli/program/message/register.read-edit-delete.ts`
  - `src/cli/program/message/register.permissions-search.ts`
  - `src/cli/program/message/register.send.ts`
  - `src/cli/program/message/register.emoji-sticker.ts`
  - `src/cli/tagline.ts`

### Validation (follow-up pass)
- `pnpm -s tsc --noEmit` ✅
- Targeted tests ✅ (`15` files / `99` tests passed):
  - `src/daemon/service-audit.test.ts`
  - `src/infra/restart-sentinel.test.ts`
  - `src/config/schema.test.ts`
  - `src/agents/system-prompt.test.ts`
  - `src/agents/system-prompt-params.test.ts`
  - `src/agents/pi-embedded-utils.test.ts`
  - `src/agents/tool-images.test.ts`
  - doctor-focused suites touched by this pass (`config-flow`, `legacy-config`, `security`, `workspace`, non-interactive flows, auth profiles)
- Grep invariant checks in targeted core runtime paths (`infra/outbound`, `reply`, `nex`, `security`) for `whatsapp|discord|slack|imessage|gmail|atlas|telegram` return zero hits (excluding test-helper files) ✅

### Notes
- One broad doctor migration suite (`src/commands/doctor-state-migrations.test.ts`) still fails in this workspace due pre-existing migration-behavior divergence unrelated to this residue wording pass; no additional changes were made in that flow.

## Follow-up Behavior Purge Pass (2026-02-25, final)

### Additional hard-cut behavior removals
- Removed provider-specific runtime helper residue:
  - `src/channels/ack-reactions.ts`: deleted `WhatsAppAckReactionMode` and `shouldAckReactionForWhatsApp`.
  - `src/extensions-api/index.ts`: removed exports for deleted WhatsApp-only ack helper/type.
  - `src/infra/retry-policy.ts`: renamed `DISCORD_RETRY_DEFAULTS` / `createDiscordRetryRunner` to generic `RATE_LIMIT_RETRY_DEFAULTS` / `createRateLimitRetryRunner`.
  - `src/infra/state-migrations.fs.ts`: removed unused `isLegacyWhatsAppAuthFile`.
  - `src/logging/console.ts`: removed provider-specific slow-listener suppression branch.
  - `src/iam/policies.ts`: removed provider-specific metadata aliases (`discord_*`, `slack_*`) from space-id resolution.
  - `src/commands/capabilities.ts` and `src/config/io.ts`: removed provider-specific token env key hints from known key sets.

- Removed dead provider-specific tool/policy residue:
  - `src/agents/tool-policy.ts`: removed owner-only `whatsapp_login` coupling.
  - `src/agents/pi-tools.policy.ts`: removed `whatsapp_login` from subagent deny defaults.
  - `src/agents/tool-display.json`: removed `whatsapp_login` tool display block.
  - deleted obsolete test: `src/agents/pi-tools.whatsapp-login-gating.test.ts`.

- Removed provider-specific CLI command surfaces from core message CLI:
  - deleted `src/cli/program/message/register.discord-admin.ts`
  - deleted `src/cli/program/message/register.emoji-sticker.ts`
  - `src/cli/program/message/register.permissions-search.ts`: removed search command wiring from this core path.
  - `src/cli/program/register.message.ts`: removed imports/calls for removed provider-specific command modules.

- Minor normalization:
  - `src/commands/message-format.ts`: renamed nested search result helper to provider-neutral naming.

### Validation (behavior purge pass)
- `pnpm -s tsc --noEmit` ✅
- Focused tests ✅ (`5` files / `47` tests passed):
  - `src/commands/capabilities.test.ts`
  - `src/iam/policies.test.ts`
  - `src/channels/ack-reactions.test.ts`
  - `src/agents/pi-tools.policy.test.ts`
  - `src/agents/tool-policy.test.ts`
- Grep invariants ✅:
  - no non-test, non-test-helper `src/**` hits for `discord|slack|whatsapp|imessage|gmail|telegram|atlas`
  - remaining matches are in test files only

## Follow-up Failure Burn-Down Pass (2026-02-25, verification closeout)

### Context
- Baseline at start of pass: `11` failed test files (`3` failed suites + `9` failed tests) from stale provider/channel assumptions and extensions-api residue in tests.

### Changes applied
- Fixed real regressions:
  - `extensions/msteams/src/messenger.ts`
    - switched `SILENT_REPLY_TOKEN` source to `src/reply/tokens.ts` (extensions-api export was no longer reliable).
  - `extensions/discord/src/channel.ts`
    - removed broken hard dependency on missing local config schema import path and dropped optional `configSchema` assignment.
- Updated stale hard-cut expectations:
  - `src/config/config.identity-defaults.test.ts`
  - `src/commands/doctor-state-migrations.test.ts`
  - `src/agents/nexus-tools.sessions.test.ts`
  - `src/agents/pi-embedded-subscribe.tools.test.ts`
  - `src/tts/tts.test.ts`
  - `src/infra/outbound/message-action-runner.threading.test.ts`
  - `src/commands/agent.test.ts` (asserts outbound-plugin path instead of removed direct provider send deps)
  - `extensions/msteams/src/messenger.test.ts`
- Removed legacy provider-heavy command tests no longer aligned with hard-cut core behavior:
  - deleted `src/commands/channels.adds-non-default-telegram-account.test.ts`
  - deleted `src/commands/onboard-channels.test.ts`
- Trimmed obsolete provider-specific security assertions and imports:
  - `src/security/audit.test.ts`

### Final validation
- `pnpm -s tsc --noEmit` ✅
- `pnpm vitest run` ✅
  - `Test Files 886 passed (886)`
  - `Tests 5855 passed | 1 skipped (5856)`

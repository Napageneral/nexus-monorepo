## CHUNK-05 Spec: CLI Grammar + Functionality Deep Review

### Baseline Comparison Targets
- **Nexus baseline:** `bulk-sync-ref` (`src/cli/program.ts` + registered sub-CLIs)
- **Upstream:** `upstream/main` (`src/cli/program/*` + `src/cli/program/register.*`)

### Nexus CLI Grammar (bulk-sync-ref)
- `nexus init [workspace]` — create workspace, config, gateway daemon, skills manifest, cursor hooks/rules, credential scan.
- `nexus login` — sign into Nexus Hub/Cloud.
- `nexus status` — onboarding guidance + credentials/capabilities/usage views.
- `nexus capabilities` + `nexus map` — capability map + filters.
- `nexus quest` — onboarding quests/progress.
- `nexus identity [user|agent]` — show identity file paths.
- `nexus config` — view/list/get/set config values.
- `nexus update` — update CLI.
- `nexus suggestions` — usage-driven suggestions.
- `nexus skill ...` — scan/list/info/use/verify skills; manifest tooling.
- `nexus skills-hub ...` — hub registry + install flows.
- `nexus cloud ...` — cloud login/sync.
- `nexus collab ...` — collaboration commands.
- `nexus credential ...` — list/get/add/verify/scan/revoke/import/flag credentials.
- `nexus dns ...` — DNS helpers.
- `nexus gateway ...` — gateway control (start/stop/status/etc).
- `nexus events` (alias: `nexus log`) — event/skill usage logs.
- `nexus tool-connector ...` — tool connectors.
- `nexus usage ...` — usage reporting.

### Upstream CLI Grammar (upstream/main)
- `legacy setup` — initialize config + workspace; optionally run `onboard`.
- `legacy onboard` — wizard for gateway/auth/channels/skills; non-interactive requires `--accept-risk`.
- `legacy configure` — interactive credentials/device defaults by section.
- `legacy config ...` — config tooling (via `config-cli`).
- `legacy doctor` — health + repair (deep, repair, token fixes, service scans).
- `legacy dashboard` — open control UI.
- `legacy reset` — reset config/state/workspace (scoped).
- `legacy uninstall` — uninstall daemon/state/workspace/app.
- `legacy message ...` — send/broadcast/poll/react/thread/pin/etc.
- `legacy memory ...` — memory status/index helpers.
- `legacy agent` — run an agent turn via gateway; `legacy agents ...` manages agents.
- `legacy status | health | sessions` — gateway health + session info (+ routed fast path).
- **Sub-CLIs:** `acp`, `daemon`, `gateway`, `service`, `logs`, `models`, `approvals`, `nodes`, `node`, `sandbox`, `tui`, `cron`, `dns`, `docs`, `hooks`, `webhooks`, `pairing`, `plugins`, `channels`, `directory`, `security`, `skills`, `update`, `browser`.

### Key Functional Deltas
- **Bootstrapping:** Nexus uses `init`; upstream replaces with `setup` + expanded `onboard` + `configure`.
- **Auth defaults:** Upstream onboarding adds `auth-choice` pipeline and requires `--accept-risk` for non-interactive; `doctor` pushes gateway token auth.
- **Daemon/service control:** Upstream adds explicit `daemon` + `service` CLIs and `gateway-status`; Nexus relies mainly on `gateway` CLI + `init`.
- **Config guard:** Upstream enforces config validity + plugin validation before most commands; Nexus checks identity first.
- **Messaging:** Upstream replaces `send` with `message` command group (much richer).
- **Command removal:** Upstream drops `init`, `send`, `credential`, `capabilities`, `cursor-*`, `quest*`, `suggestions`, `skills-manifest`, etc.

### Deep Dive: `nexus init` vs `nexus setup`
- **`init` (Nexus):** full bootstrap. Writes config, creates workspace + bootstrap files, initializes gateway service, sets up cursor hooks/rules, copies bundled skills + manifest, scans credentials, ensures systemd linger, and seeds identity files. It is opinionated and “day‑1 ready”.
- **`setup` (upstream):** minimal bootstrap. Writes config with `agents.defaults.workspace`, ensures workspace + session transcripts directory. No daemon install, no skills, no cursor hooks, no credential scan.
- **Implication:** `setup` is safe and minimal; `init` is a heavy bootstrap. Union strategy keeps both and treats `setup` as a lighter entry point.

### Deep Dive: legacy `nexus send` vs `nexus message`
- **`send` (Nexus):** direct send by provider with a fallback to gateway. Supports WhatsApp/Telegram/Discord/Slack/Signal/iMessage and `--media`, `--gif-playback`, `--account`. It embeds provider logic in the command.
- **`message` (upstream):** channel‑agnostic action runner. Uses `--channel` + `--target` abstraction with many actions (send, broadcast, poll, reactions, pins, threads, read/edit/delete, permissions/search, emoji/stickers, etc). It delegates to channel plugins and central action runner.
- **Decision:** drop `send`, adopt `message` as the only surface.

### What is `--accept-risk`?
- Upstream `onboard` blocks **non‑interactive** onboarding unless the user explicitly passes `--accept-risk`.
- It’s a guardrail that prevents unattended runs from configuring powerful agents without explicit acknowledgement (see `commands/onboard.ts`).

### Config Guard vs Nexus Soft Guard
- **Upstream config guard:** `ensureConfigReady` runs before most commands, validates config + plugin registry, and **hard‑fails** with instructions to run `doctor --fix` if invalid (exceptions: `doctor`, `status`, `health`, `logs`, `service`).
- **Nexus soft guard:** preAction only checks identity + legacy migration (hard‑fails mainly in Nix mode). Invalid config does not block most commands.
- **Union approach:** keep identity checks and add upstream validation, but scope it to Nexus config path and keep a small allowlist for commands that should run even with invalid config.

### Auth Defaults (Upstream)
- Upstream onboarding introduces an **auth‑choice pipeline** (`--auth-choice` with many providers), plus profile‑based auth config and credential storage.
- `doctor` pushes gateway auth toward **token mode** and can generate a token if missing.
- `configure` is interactive and modular by section; it expects `credential`/auth flows to be in place.
- **Adoption:** keep upstream pipeline but preserve Nexus naming/paths and integrate with Nexus credential/skill flows.

### Daemon/Service Control (Upstream)
- Adds `service gateway ...` and `service node ...` to manage OS services (launchd/systemd/schtasks) with install/start/stop/restart/status.
- Adds `daemon` CLI wrappers and a rich `gateway-status` probe (network discovery, SSH tunnel probes, multi‑gateway diagnostics).
- **Decision:** adopt upstream `gateway` + `daemon`/`service` surfaces; keep `init` for full bootstrap; add compatibility shims for legacy `gateway stop/restart/uninstall` if needed.

### Mapping Plan (Keep Nexus, Add Upstream)
- **Keep Nexus functionality:** `init`, `credential`, `capabilities`, `quest`, `suggestions`, `skill` (local), `skills` (Hub), `cloud`, `collab`, `tool`, `connector`, `usage`, `events`.
- **Replace with upstream implementations:** `status`, `health`, `sessions`, `memory`, `config`, `gateway`, `update`, `dashboard`, `message`, `agent/agents`, `logs`.
- **Add upstream groups:** `setup`, `onboard`, `configure`, `channels`, `daemon`, `service`, `models`, `approvals`, `nodes`, `node`, `cron`, `dns`, `docs`, `hooks`, `webhooks`, `pairing`, `plugins`, `directory`, `security`, `sandbox`, `tui`, `browser`, `acp`, `uninstall`.
- **Aliases:** `log` → `events` (optional alias: `activity`); keep `init` ↔ `setup` (prefer `init` as the “full bootstrap” entry).
- **Guarding:** keep Nexus identity checks, add upstream config validation as a second guard (Nexus config path + plugin validation).

### Implementation Strategy
- Create a merged CLI registry with Nexus-first names; replace/rename commands per the final spec.
- Add compatibility aliases for renamed Nexus commands (e.g., `status` → `overview`, `log` → `events`, legacy `gateway stop/restart/uninstall`).
- Normalize doc links + CLI name to `nexus` across all upstream commands.
- Merge gateway/daemon/service commands but preserve Nexus workspace/ODU assumptions.
- Preserve `credential` and `capabilities` commands; wire upstream `configure` to use them internally.

### Default Decisions (assumed unless contradicted)
- Keep both `setup` (light) and `init` (full bootstrap). Favor `init` as primary; mark for future dedupe/review.
- Rename `nexus status` (onboarding) → `nexus overview`; reserve `status` for upstream ops view.
- Drop `send`; adopt `message` only.
- Enforce `--accept-risk` for non‑interactive onboarding.
- Adopt upstream config guard with a Nexus allowlist + identity checks.
- Keep dedicated `service` CLI and preserve Nexus “auto‑start + setup” experience via `init`.

### Final merged CLI spec (implementation-ready)
This is the canonical merged grammar and naming. Another agent should implement against this list.

#### Renames + ownership
- **Nexus onboarding status** → `nexus overview` (new name; keep Nexus output/flags).
- **Upstream ops status** → `nexus status` (use upstream implementation/flags).
- **Nexus log** → `nexus events` (optional alias: `nexus activity`).
- **Skills**: keep Nexus split: `skill` (local) + `skills` (Hub). Upstream `skills` is absorbed into `skill`.
- **Config**: use upstream `config` wizard + get/set/unset. Drop Nexus `config list/view` (optional: keep `config list` as alias for full JSON dump).
- **Gateway**: use upstream `gateway` (run/status/discover/call) + `service`/`daemon`. Remove Nexus-only gateway subcommands, add shims as noted below.

#### Canonical top-level commands (merged)
- `nexus init [workspace]` (Nexus full bootstrap)
- `nexus setup` / `nexus onboard` / `nexus configure` (upstream flows, renamed to Nexus)
- `nexus overview` (Nexus onboarding status)
- `nexus status` / `nexus health` / `nexus sessions` (upstream)
- `nexus memory` (upstream)
- `nexus config` (upstream: wizard + get/set/unset)
- `nexus dashboard` (upstream)
- `nexus update` (upstream update engine)
- `nexus events` (Nexus event + skill usage log viewer)
- `nexus identity` / `nexus quest` / `nexus suggestions` / `nexus capabilities` / `nexus map` (Nexus)
- `nexus agent` / `nexus agents` / `nexus message` (upstream)
- `nexus skill` / `nexus skills` (Nexus local + Hub)
- `nexus cloud` / `nexus collab` / `nexus credential` / `nexus dns` / `nexus usage` (Nexus)
- Upstream sub-CLIs (renamed to Nexus): `acp`, `daemon`, `gateway`, `service`, `logs`, `models`, `approvals`, `nodes`, `node`, `sandbox`, `tui`, `cron`, `docs`, `hooks`, `webhooks`, `pairing`, `plugins`, `channels`, `directory`, `security`, `browser`

#### Grammar summary (canonical)
- `nexus overview [--json|--brief|--capabilities|--credentials|--usage|--quiet]`
- `nexus status [--json|--deep|--all|--usage|--timeout <ms>|--verbose]`
- `nexus health [--json|--timeout <ms>|--verbose]`
- `nexus sessions [--json|--store <path>|--active <minutes>]`
- `nexus memory status|index|search ...` (upstream)
- `nexus config [--section <name>...]` (wizard)
- `nexus config get <path> [--json]`
- `nexus config set <path> <value> [--json]`
- `nexus config unset <path>`
- `nexus dashboard [--no-open]`
- `nexus update [--json|--restart|--channel <stable|beta>|--tag <tag>|--timeout <ms>]`
- `nexus events [--json|--errors|--since <time>|--limit <n>|--skill <name>|--source <id>|--command <path>]`
- `nexus agent ...` / `nexus agents ...` (upstream)
- `nexus message ...` (upstream)
- `nexus skill scan|list|info|use|verify|stats`
- `nexus skills search|install|publish|updates|update`
- `nexus tool verify|path`
- `nexus connector verify|accounts`
- `nexus gateway (run)` + `gateway status|discover|health|call`
- `nexus daemon ...` / `nexus service ...` (upstream)
- `nexus logs ...` (upstream gateway logs)

#### Gateway migration notes (important)
- Use upstream `gateway` surface (run/status/discover/call). Service lifecycle moves to `service`/`daemon`.
- Legacy Nexus `gateway stop|restart|uninstall` should be **compat shims** to `service gateway ...` (optional but recommended).
- Legacy Nexus `gateway send|agent|wake` are removed; use:
  - `message send` for send
  - `agent` for agent runs
  - `gateway call wake` for wake (optional alias: `gateway wake`)
- Keep upstream run flags: `--dev`, `--reset`, `--raw-stream`, `--raw-stream-path`, strict auth checks.
- Preserve Nexus auth/env renames (`NEXUS_*`), and accept `bind` values from upstream; consider aliasing `tailnet` → `custom` if needed.

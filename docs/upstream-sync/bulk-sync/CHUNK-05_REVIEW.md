## CHUNK-05: Commands System

### Summary
Upstream overhauls the CLI commands: doctor/onboard/status/models are modularized and expanded; new command groups (agents, channels, configure, status-all) and utilities (message, dashboard, docs, sandbox) are introduced; several legacy commands are removed.

### Key Changes
- Doctor split into `doctor-*` modules with gateway health, config migrations, sandbox checks, security notes, and update prompts.
- Onboarding reworked: auth-choice pipeline, channel onboarding, hooks onboarding, non-interactive flows now require `--accept-risk`, Quickstart removed.
- New `agents` and `channels` command suites plus `configure` and `status-all` modules.
- Models command expanded (list/status/registry/auth order), model picker + default-model helpers.
- New commands: `message`, `gateway-status`, `dashboard`, `docs`, `sandbox`, `uninstall`, and expanded health formatting.
- Removed commands: `init`, `send`, `log`, `poll`, `quest*`, `skills-manifest`, `config`, `credential`, `capabilities`, `cursor-*`, `update`, `usage-*`, `suggestions`, `onboard-providers`, `onboard-quickstart`, and more.

### Nexus Conflicts
- Doctor/onboard reference `LegacyConfig` and `CONFIG_PATH_LEGACY`; Nexus must keep `nexus`-named paths and docs URLs.
- Removing `init`, `send`, `credential`, `capabilities`, `cursor-*` may break existing Nexus workflows and docs.
- New `message` command likely replaces `send`; need to decide which is canonical for Nexus.
- Onboarding references `docs.legacy.bot` and risk-ack flows; update to Nexus docs + policy.
- Gateway/daemon helpers + auth defaults may conflict with Nexus ODU or workspace bootstrap assumptions.

### Recommendation
ADAPT

### Adaptation Notes
- Rebrand all CLI strings, docs links, and config paths to Nexus (`CONFIG_PATH_NEXUS`, `nexus`).
- Decide which removed commands must be preserved; either reintroduce or provide aliases to new command equivalents (`send` → `message`, etc.).
- Merge upstream doctor/onboard improvements but keep Nexus-specific bootstrap, cursor integrations, and state layout.
- Validate new commands (`configure`, `agents`, `channels`, `status-all`) against Nexus permission model and ODU workflows.

### Questions for Tyler
- Should Nexus keep legacy commands (`init`, `send`, `credential`, `capabilities`, `cursor-*`) or migrate to new equivalents?
- Do we want the new non-interactive onboarding `--accept-risk` gate?
- Should `message` replace `send`, or keep both?

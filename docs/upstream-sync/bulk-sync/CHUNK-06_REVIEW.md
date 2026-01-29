## CHUNK-06: CLI Commands

### Summary
Upstream refactors the CLI into a modular command registry and adds many new subcommands. It also removes several legacy CLIs. For Nexus, we need to keep and port the Nexus-specific CLIs (cloud, collab, credential, skills hub) into the new command structure, while taking upstream improvements and renaming all branding/env/config paths.

### Key Changes
- New CLI core: argv parsing, banners/taglines, `program/` command registry, routing, config guards, and structured subcommand registration.
- Large expansion: daemon lifecycle, nodes tooling, plugins, memory, exec-approvals, logs, security, service, webhooks, channels, config, docs, etc.
- Browser CLI overhaul: new action registries, extension flows, state management, debug helpers, and new tests.
- Gateway CLI split into subcommands (`run`, `discover`, `dev`, `call`, `run-loop`) with shared utilities.
- Removed legacy CLIs: `cloud-cli`, `collab-cli`, `credential-cli`, `skills-hub-cli`, `tool-connector-cli`, `upstream-sync-cli`, `usage-cli`, `canvas-cli`, `telegram-cli`, `log-cli`.

### Nexus Conflicts
- Extensive `legacy` branding and paths in help text, examples, tests, env vars, and default config locations.
- Removed Nexus-specific CLIs that must be preserved:
  - `cloud-cli` (Nexus Cloud auth + Rust CLI passthrough)
  - `collab-cli` (spaces + collab session control)
  - `credential-cli` (credential store management + import/verify/expose)
  - `skills-hub-cli` (hub search/install/publish/updates)
- Daemon/install service identifiers use `legacy` naming.

### Recommendation
**ADAPT (Careful merge: keep Nexus CLIs + upstream structure)**

### Adaptation Notes
- Port `cloud`, `collab`, `credential`, and `skills` hub commands into the new `program/` registry instead of dropping them.
- Also port Nexus legacy CLIs that were removed upstream: `tool-connector`, `usage`, `upstream-sync`, and `log` (as alias to `logs`).
- Keep upstream CLI improvements (daemon/nodes/plugins/etc.) and reconcile flags/UX with existing Nexus workflows.
- Rename all `legacy`/`LEGACY_*` strings to Nexus equivalents, including help text, docs links, and service names.
- Telegram/canvas CLIs can remain removed (per guidance).
- Ensure the CLI continues to route Nexus Cloud and skills hub auth through the credential store.

### Assumptions
- Keep all removed Nexus CLIs except `telegram` and `canvas`.

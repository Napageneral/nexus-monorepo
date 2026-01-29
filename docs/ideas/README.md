# Nexus Ideas + Backlog

This folder is the backlog. Capture ideas here so we can triage later. Keep
this as a backlog, not a plan.

Recovered from the prior `docs/IDEAS.md` (via git history) and merged with
newer notes in this folder.

## Active Ideas
- [ ] Gateway vs broker: review cron scheduling ownership and terminology.
- [ ] Browser tooling guidance: explain `agent-browser` vs `nexus browser` and
  add a skill/guidance doc. See `browser-guidance.md`.
- [ ] Canvas + nodes: investigate device surfaces and whether json-render UI
  trees can be hosted on node canvas targets.
- [ ] Hooks deep dive: validate hook architecture and whether hooks should be
  a gogcli plugin or remain a gateway-integrated CLI surface.
- [ ] Models CLI: clarify model policy/catalog roles vs credentials.
- [ ] Telegram pairing: consolidate wrapper into generic pairing CLI.
- [ ] Devices grouping: make nodes/canvas/browser relationships explicit in
  CLI help text and docs.
- [ ] Credential broker: define gateway access policy + non-interactive secrets.
- [ ] Agent selection flow: define UX + persistence rules. See
  `agent-selection-flow.md`.

## Skills Layer (Local)
- [x] Add/standardize skill frontmatter (name, type, provides, requires)
- [x] Implement `nexus skill scan` to build local skill index JSON
- [x] Decide on "managed" vs "local" source semantics (treat bundled as managed)
- [x] Add `managed_modified` state (local edits on managed skills)
- [x] Add local skill provenance (hub slug + version + checksum)

## Capabilities Layer (Hub + CLI)
- [ ] Hub becomes canonical capability registry (taxonomy + aliases)
- [ ] CLI syncs registry snapshot from hub
- [ ] Local `provides` for unknown capabilities -> proposal queue
- [ ] Capability readiness should show provider-level readiness

## Skill Updates + Conflicts
- [ ] Update propagation from hub (version available notifications)
- [ ] Define conflict policy for managed skills with local edits
- [ ] Evaluate patch/overlay model for managed skill customization

## Automation / Daemons
- [x] Inventory existing daemons + heartbeat jobs
- [x] Add file watcher or heartbeat-driven skill scan
- [x] Emit state updates without user/agent prompts

## Cursor Bindings
- [ ] Add Cursor agent bindings that load Nexus as a skill
- [ ] Define best-practice prompt injection for Cursor agents

## Tool Context / Memory
- [ ] Per-tool context snapshots (e.g., Vercel projects, Google accounts)
- [ ] Structured "shape + size + flavor" summaries per data source
- [ ] Feed context maps into skills + hub discovery

## Seed Docs
- `browser-guidance.md`
- `credential-broker.md`
- `agent-selection-flow.md`

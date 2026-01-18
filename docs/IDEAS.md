# Nexus Ideas + Tasks (Draft)

Capture ideas here so we can triage later. Keep this as a backlog, not a plan.

## Skills Layer (Local)
- [ ] Add/standardize skill frontmatter (name, type, provides, requires)
- [ ] Implement `nexus skill scan` to build local skill index JSON
- [ ] Decide on "managed" vs "local" source semantics (treat bundled as managed)
- [ ] Add `managed_modified` state (local edits on managed skills)
- [ ] Add local skill provenance (hub slug + version + checksum)

## Capabilities Layer (Hub + CLI)
- [ ] Hub becomes canonical capability registry (taxonomy + aliases)
- [ ] CLI syncs registry snapshot from hub
- [ ] Local `provides` for unknown capabilities → proposal queue
- [ ] Capability readiness should show provider-level readiness

## Skill Updates + Conflicts
- [ ] Update propagation from hub (version available notifications)
- [ ] Define conflict policy for managed skills with local edits
- [ ] Evaluate patch/overlay model for managed skill customization

## Automation / Daemons
- [ ] Inventory existing daemons + heartbeat jobs
- [ ] Add file watcher or heartbeat-driven skill scan
- [ ] Emit state updates without user/agent prompts

## Cursor Bindings
- [ ] Add Cursor agent bindings that load Nexus as a skill
- [ ] Define best-practice prompt injection for Cursor agents

## Tool Context / Memory
- [ ] Per-tool context snapshots (e.g., Vercel projects, Google accounts)
- [ ] Structured "shape + size + flavor" summaries per data source
- [ ] Feed context maps into skills + hub discovery

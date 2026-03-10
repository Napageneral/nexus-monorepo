# Spike Roadmap

> **ARCHIVED 2026-03-04.** Superseded by
> `../../specs/SPIKE_DATA_MODEL.md`,
> `../../specs/SPIKE_INTEGRATIONS_AND_CALLBACK_OWNERSHIP.md`, and
> `../../workplans/SPIKE_WORKPLAN.md`. Kept for historical reference.

> Captured 2026-03-03 from research session across the full spike ecosystem.
> Supersedes the Phase 0–5 workplan in `../../workplans/SPIKE_WORKPLAN.md`
> (all phases complete).

---

## Current State — What's Built

### Spike Engine (Go Service) ✅
- 31 fully-implemented nex operation handlers, zero stubs
- Core oracle: ask, status, sync with full PRLM tree management
- GitHub App connector: complete install flow, token minting, repo/branch/commit listing, webhook processing, git clone auth
- Session management: 9 methods for the PRLM broker
- Data queries: repositories, repo-refs, tree-versions, jobs, ask-requests (including inspector/timeline)
- All original HTTP endpoints preserved for standalone mode
- Nex service protocol shim: GET /health, POST /operations/{method}
- Full test suite: 11 packages, all passing

### Dashboard UI ✅
- `app/dist/index.html` — 5-panel workspace: GitHub connect → repo/branch picker → hydrate orchestration → ask oracle → request timeline
- `app/dist/inspector.html` — forensic ask inspector with navigator
- Dual-mode API: WebSocket RPC (nex mode) + HTTP operations (standalone mode)
- Served from filesystem dist/ directory (not embedded in Go binary)

### Nex App Package ✅
- Complete manifest: 31 methods, service config, lifecycle hooks, UI, product/plans/entitlements
- Binary at app/bin/spike-engine (22.7MB, darwin/arm64)
- All 5 lifecycle hooks implemented
- Product page at product/ (Vercel-deployable)

### Eval Framework ✅ (Standalone Module)
- Separate Go module at home/projects/spike/eval/ (restored from GitHub)
- Docker-based execution engine with 9 experimental variants
- 6 target repos (50k–3M tokens)
- Blind group judging with LLM judge (configurable: Anthropic, OpenAI, Codex)
- Reactive dashboard (React + SQLite + WebSocket invalidation)
- SQLite work queue with adaptive concurrency
- Decoupled from spike (HTTP API boundary only)

---

## Immediate Priority: E2E GitHub App Testing

**Goal:** Connect my own GitHub, pick a repo, hydrate the oracle tree, ask questions — all through the UI running in standalone mode.

### Blocking Gaps

1. **isNexMode false positive after GitHub callback** — The GitHub install callback redirects to `/app/spike?tree_id=...&github_connect=connected`. Since the path starts with `/app/`, the dashboard thinks it's in nex mode and tries WebSocket RPC, which doesn't exist in standalone mode. Fix: redirect to `/?tree_id=...&github_connect=connected` instead.

2. **Tree profile YAML required before startup** — Engine refuses to start without at least one `.yaml` tree profile in the configs directory. Need to create a profile YAML for each target codebase.

3. **Tree ID must match profile** — The GitHub connector can only bind to tree IDs that exist in the loaded profiles. The tree_id in the dashboard must match a profile.

4. **GitHub App Setup URL** — The GitHub App's "Setup URL" must point to `{engine_host}/connectors/github/install/callback`. For local dev, need ngrok/cloudflare tunnel or similar.

### What Works
- All 10 dashboard API calls have matching nex operation handlers
- Response shapes match between handlers and JS expectations
- Sync/hydrate pipeline is fully wired (git clone → init → hydrate)
- Connector credential persistence works
- Ask + timeline flow is correct (requires hydrate first)

### Config Required
```bash
spike-engine serve \
  --configs ./trees \
  --github-app-slug YOUR_SLUG \
  --github-app-id YOUR_ID \
  --github-app-private-key "$(cat private-key.pem)" \
  --port 7422
```

With a tree profile at `./trees/my-repo.yaml`:
```yaml
tree_id: "my-repo"
capacity: 120000
max_children: 12
max_parallel: 4
```

---

## Roadmap Phases

### Phase 1: E2E Standalone Testing (THIS WEEK)
- [ ] Fix isNexMode false positive (callback redirect → `/` not `/app/spike`)
- [ ] Create GitHub App on github.com with correct setup URL
- [ ] Set up tunnel (ngrok) for local callback
- [ ] Create tree profile YAML, start engine
- [ ] Full flow: connect GitHub → pick repo → hydrate → ask → timeline
- [ ] Verify inspector works at /control/ask-inspector
- [ ] Test multiple trees (multi-repo support)

### Phase 2: Atlassian Integration (NEXT 2 WEEKS — First Client)
- [ ] Jira connector: OAuth2 setup, issue fetching, project/board listing
- [ ] Bitbucket connector: OAuth2, repo listing, PR/branch listing, clone auth
- [ ] Task pipeline: Jira issue → oracle context → gameplan output
- [ ] Webhook receiver for Jira issue updates
- [ ] Webhook receiver for Bitbucket push/PR events

### Phase 3: Eval as Standalone Service (MONTH 1)
- [ ] Extract eval/ to its own git repo
- [ ] Decouple cartographer binary build from parent repo
- [ ] Make oracle server URL configurable (point at any spike engine)
- [ ] Add Jira-sourced task loader (issues become eval targets)
- [ ] Nex app wrapper for eval (optional — run as spike sub-service)

### Phase 4: Git History → Memory Pipeline (MONTH 1–2)
- [ ] Ingest git commits/PRs as nexus events
- [ ] Run memory retain pipeline over commit history
- [ ] Feed historical context into oracle for richer gameplans
- [ ] PR-based knowledge graph: who changed what, when, why

### Phase 5: Production Pipeline (MONTH 2)
- [ ] Jira issue → oracle review → gameplan (automated)
- [ ] Multi-task orchestration with Docker environments
- [ ] Quality feedback loop: eval judges production gameplans
- [ ] Screen recording / walkthrough generation for completed work

### Phase 6: Platform Features (MONTH 2–3)
- [ ] Pricing/entitlement enforcement (spike-free vs spike-pro)
- [ ] Admin console build-out
- [ ] Multi-provider git adapter (GitHub + Bitbucket + GitLab)
- [ ] UI polish and Next.js conversion

---

## Architecture Decisions

### Eval Framework — Standalone Module
- Born as an eval benchmark, led to spike via intent layer experiments
- Separate Go module, no code dependency on spike
- Connects via HTTP API boundary (oracle /ask endpoint)
- Long-term: the execution engine for both eval AND production task processing
- Key insight: **Jira integration IS the eval pipeline in production mode**
  - Task definition ↔ Jira ticket
  - Target ↔ customer's codebase
  - Oracle prefetch ↔ spike context review
  - Instruction template ↔ assembled gameplan
  - Docker execution ↔ agent working on customer task
  - Judge scoring ↔ quality assurance

### Connector Strategy
- GitHub connector: inline in engine (working, ~800 lines Go)
- Jira/Bitbucket connectors: inline in engine (same pattern as GitHub)
- Long-term: extract to modular adapter system with platform modules
- Nex adapter protocol available but designed for messaging — connectors stay engine-inline for now

### UI Architecture
- Static HTML/JS in dist/ (no build step, no framework)
- Dual-mode API: WebSocket RPC (nex) + HTTP operations (standalone)
- Inspector as separate page (not SPA route)
- Next.js conversion deferred — functionality first

---

## Key Files

| Component | Location |
|---|---|
| Engine source | `apps/spike/service/cmd/spike-engine/` |
| Internal packages | `apps/spike/service/internal/` |
| Nex app package | `apps/spike/app/` |
| Dashboard HTML | `apps/spike/app/dist/index.html` |
| Inspector HTML | `apps/spike/app/dist/inspector.html` |
| App manifest | `apps/spike/app/app.nexus.json` |
| Lifecycle hooks | `apps/spike/app/hooks/` |
| Marketing page | `apps/spike/product/` |
| Eval framework | `home/projects/spike/eval/` |
| Nex app spec | `apps/spike/docs/archive/specs/SPIKE_NEX_APP_SPEC.md` |
| Old workplan | `apps/spike/docs/workplans/SPIKE_WORKPLAN.md` (phases 0–5 complete) |

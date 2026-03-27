# Current UI vs Reference Design — Comparison

## Shell & Navigation

| Aspect | Current UI | Reference Design | Gap |
|--------|-----------|-----------------|-----|
| **Layout** | Left sidebar nav + main content area | Top horizontal nav bar + full-width content | **Major restructure** — sidebar → top nav |
| **Primary tabs** | 8 tabs: Home, Console, Identity, Agents, Operations, Memory, Integrations, System | 3 tabs: Apps, Agents, Monitor | **Simplify** — consolidate 8 tabs into 3 + settings overlay |
| **Sidebar groups** | "Operator" group + "System" group, collapsible | No sidebar, flat top tabs | Remove sidebar entirely |
| **Brand** | "NEXUS / Operator Console" with favicon, hamburger toggle | "one" logo (placeholder) + workspace name | Restyle header |
| **Status** | Health pill (OK/Offline) + theme toggle in top-right | Environment badge ("Production"), utility icons (notifications, help, settings, chat), user avatar | **New components**: env badge, notifications panel, user menu |
| **Theme toggle** | Sun/moon toggle in topbar status area | In user menu dropdown + system settings | Move to user menu |
| **Workspace switcher** | None | Dropdown from workspace name (Personal, Create organization) | **New** |
| **User menu** | None | Avatar dropdown with account links, role tags, log out | **New** |
| **Notifications** | None | Bell icon → slide-out notifications panel | **New** |

## Tab Mapping: Current → New

| Reference Design Tab | Current Equivalent | Notes |
|---------------------|-------------------|-------|
| **Apps** | `integrations` tab | Very similar — both show adapter list with OAuth/API-key connection. Design adds: platform picker first-run, visual catalog modal, "Connected Apps" framing, get-started cards |
| **Agents** | `agents` tab | Agents exist but are a flat panel with sub-tabs (overview, files, tools, skills, accounts, automations). Design adds: creation wizard, provisioning animation, split-panel detail with chat, schedule templates, channel management, guardrails/memory modals, run history stats |
| **Monitor** | `system` → `logs` sub-tab (partially) | Current has log stream viewer. Design shows structured API call table with status codes, platform icons, connection keys. More "audit trail" than "log stream" |
| *(Webhooks — sub-page of Monitor or standalone)* | None | **Entirely new** — webhook subscription management, event types, event history |
| **Settings overlay** | `system` tab (config, sessions, debug, usage, overview) | Current "System" tab has overlapping features scattered across sub-tabs. Design consolidates into a clean overlay panel with: Profile, Billing, Usage, Invoices, API Keys, Auth |

## Agents Tab — Detailed Comparison

### Current Agent Panels

The current `agents` tab has 6 sub-panels: `overview | files | tools | skills | accounts | automations`

| Current Panel | Reference Design Equivalent | Status |
|--------------|---------------------------|--------|
| **overview** | Agent detail → Settings tab (left side) | Partial overlap — current shows agent list + selected agent overview. Design shows richer settings sections |
| **files** | Agent detail → CLAUDE.md section in Settings | Current has full file browser for agent workspace. Design shows a CLAUDE.md editor inline |
| **tools** | Agent detail → "Manage Tools" modal | Current has detailed tool permission grid. Design has modal with API key + connections + action permissions |
| **skills** | Agent detail → Skills tab | Very close match — both show skill list with toggle/edit |
| **accounts** | Agent detail → Channels section + connections | Current shows adapter connections per-agent. Design splits this into Channels (Telegram, Slack, WhatsApp) and Tools (connections) |
| **automations** | Agent detail → Triggers section (schedules + event triggers) | Current has schedule form. Design adds: schedule templates, event triggers, "deliver results to" channels |

### New in Design (not in current)

| Feature | Description | Complexity |
|---------|------------|------------|
| **Agent creation wizard** (images 07-12) | 4-step flow: Basics → Apps → Guardrails → Review | Medium — new multi-step form, but data already exists in runtime |
| **Provisioning animation** (13-15) | Animated step sequence when creating agent | Low-medium — visual only |
| **Split-panel layout** (16+) | Settings left, chat right on agent detail | Medium — layout restructure, chat already exists |
| **Schedule templates** (17) | Pre-built schedule templates (Morning inbox, Weekly digest, etc.) | Low — just pre-fills the existing schedule form |
| **Event triggers** (20) | Platform-based event triggers (Stripe, Gmail, etc.) | Medium — may need runtime support |
| **Guardrails modal** (22) | Action policy (full/read-write/read-only), budget, max steps | Low — UI over existing config |
| **Memory modal** (23) | Stateless vs Persistent toggle | Low — UI over existing config |
| **Run History tab** (32) | Stats cards (succeeded/failed/timeout) + run log | Medium — needs run data from runtime |
| **Channel setup wizards** (25-26) | Multi-step Slack app creation with YAML manifest | Medium — guided flow over existing channel config |
| **Model selector dropdown** (28) | Simple Haiku/Sonnet/Opus popover | Low — exists in current code |

## Integrations → Apps

| Aspect | Current | Design | Gap |
|--------|---------|--------|-----|
| **Layout** | Flat list of all adapters with status badges, OAuth/custom connect buttons, test/disconnect actions | Table with Platform/Online/Tags/Last used columns, "Get started" cards | Restyle the list view |
| **First-run** | Shows adapter list immediately | Platform picker with greeting + grid of icons | **New** first-run experience |
| **Connect flow** | Inline OAuth start + custom field forms | Modal-based: OAuth info modal → authenticate → success modal | Wrap existing OAuth in modals |
| **App catalog** | All adapters shown inline | Modal grid with search, paginated | New catalog modal |

## Operations → Merged into Agents

| Current | Design |
|---------|--------|
| Operations tab with Overview + Jobs & Schedules sub-tabs | Schedules live inside each agent's detail (Triggers section) |
| Global schedule form with job definitions | Per-agent schedule with templates and "deliver results to" |

## Identity Tab → Removed/Simplified

The reference design has **no Identity tab**. Identity concepts (contacts, channels, groups, merges) are either:
- Absorbed into the Agent detail (channels section)
- Not visible in the new control plane (deeper runtime concern)

## Memory Tab → Absorbed into Agent Detail

Current has a dedicated Memory tab with runs, episodes, search, quality review. The design simplifies to a "Memory" section in agent settings with just a Stateless/Persistent toggle and stored memories list.

## System Tab → Absorbed into Settings Overlay

| Current System Sub-tab | Design Equivalent |
|----------------------|-------------------|
| Overview (health, uptime) | Removed — health shown via status indicators in top bar |
| Sessions | Removed from main UI (runtime concern) |
| Config | Removed (runtime config editing is lower-level) |
| Logs | → Monitor tab (restyled as API call table) |
| Debug | Removed from main UI |
| Usage | → Settings overlay → Usage (with charts) |

## Settings Overlay (NEW)

Entirely new full-screen overlay with sidebar nav:

| Section | Current Equivalent | Notes |
|---------|-------------------|-------|
| Profile | None | **New** — username, email, name fields |
| Billing | None | **New** — plan cards (Free/Starter/Pro/Enterprise), manage billing |
| Usage | System → Usage sub-tab | Restyle with connections chart + API calls chart |
| Invoices | None | **New** — invoice list with paid status |
| API Keys | None (runtime token in overview) | **New** — create/manage API keys |
| Auth | Integrations tab (partially) | Integration visibility/config management |

## Webhooks (NEW)

Entirely new section:
- Webhook subscriptions list with search
- Create webhook modal (URL, event types, secret, description, active toggle)
- Event history viewer
- Use-case cards (React to events, Track connections, Detect failed auth)

## Visual / Design System Changes

| Aspect | Current | Design |
|--------|---------|--------|
| **Color scheme** | Light default with dark mode toggle | Dark-first design, light variants |
| **Typography** | System font stack, basic hierarchy | Similar but more refined — larger titles, better spacing |
| **Cards** | Basic `.card` with title/sub/content | Richer cards with status badges, icon grids, action buttons |
| **Modals** | None used currently | Extensive modal system — overlays with dimmed backdrop |
| **Forms** | Basic inputs in cards | Polished forms with validation, step indicators |
| **Tables** | Basic log table in logs view | Styled data tables with colored status badges, filters |
| **Buttons** | `.btn` / `.btn--sm` | Yellow/gold primary CTA, outlined secondary |
| **Status indicators** | `.statusDot` (green/red) + text pills | Green dot badges, colored "Active/Open/Pause" pills |
| **Toast notifications** | None | Bottom-right toast slide-ups |
| **Charts** | SVG chart in usage view | Bar + line charts in settings usage |

## Summary: Effort Estimation

| Area | Effort | Notes |
|------|--------|-------|
| Shell restructure (sidebar → top nav) | **High** | Fundamental layout change |
| Apps tab (restyle integrations) | **Medium** | Existing data, new UI |
| Agent creation wizard | **Medium** | New multi-step flow |
| Agent detail split-panel | **Medium** | New layout with existing chat |
| Agent settings sections + modals | **Medium** | New modal components wrapping existing data |
| Monitor tab | **Medium** | New table view, may need API |
| Webhooks | **High** | New feature end-to-end |
| Settings overlay | **High** | Mostly new screens (profile, billing, invoices, API keys) |
| Remove old tabs (Identity, Memory, Operations, System) | **Low** | Delete code, redirect |
| Design system (colors, modals, toasts, buttons) | **Medium** | Cross-cutting CSS work |

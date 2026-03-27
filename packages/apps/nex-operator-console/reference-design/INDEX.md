# Reference Design Index

This document maps every reference design screenshot to its page, flow, and components.
Use it as the guide when implementing the new UI.

> **Branding note:** The designs use "one" as a placeholder name. Do not adopt that name in this pass — keep existing branding for now.
>
> **Auth note:** The designs show an "Anthropic API key" field in agent creation. We will replace this with OAuth for Claude Code / Codex to drive the underlying model.

---

## Global Shell

Every page shares a consistent shell:

- **Top nav bar**: Logo (left), primary tabs (Apps, Agents, Monitor), environment badge ("Production" with toggle), utility icons (notifications bell, help, settings gear, chat), user avatar (right)
- **Workspace switcher**: Dropdown from the workspace name (top-left) with "Personal" workspace and "Create organization" option (image 35)
- **User menu**: Avatar dropdown with workspace info, role/plan/API-user tags, links to Account, Documentation, Light/Dark Mode toggle, Log out (image 49)
- **Notifications panel**: Slide-out from bell icon, empty state + "View all notifications" link (image 36)
- **Theme**: Dark mode is the primary theme shown; light mode variants exist for several pages

---

## 1. Apps (Connected Platforms)

The first-run and management experience for connecting third-party platforms (integrations).

| # | File | Page / State | Key Components |
|---|------|-------------|----------------|
| 01 | `01-apps-connect-platform-picker-light.png` | Apps — First run (light) | Greeting "Hey Tyler Brandt, connect a platform", 3x4 grid of platform icons (Gmail, Google Calendar, Notion, Google Drive, etc.), "Browse all integrations" link |
| 02 | `02-apps-oauth-connect-modal-light.png` | Apps — OAuth connect modal (light) | Modal over dimmed background, Gmail icon, "Connect your Gmail account", 3 benefit bullets (Authenticate instantly, Always connected, Enterprise security), large "Connect" CTA, "Secured by one" footer |
| 03 | `03-apps-connected-success-modal-dark.png` | Apps — Connection success modal (dark) | Green checkmark, "Connected successfully!", "Your integration is ready to use", Close button, "Secured by one" footer |
| 04 | `04-apps-connected-list-dark.png` | Apps — Connected Apps list (dark) | Page title "Connected Apps", search bar with Tag/Platform filters, table (Platform, Online, Tags, Last used), Gmail row showing Active status, "Get started" cards (Connect your agent, Create an agent, Browse the catalog), "+ Add new app" yellow CTA |
| 05 | `05-apps-add-new-app-catalog-modal-dark.png` | Apps — Add new app catalog modal (dark) | Search field, grid of app icons (Clockwise, Google Drive, Asana, Notion, Google Calendar, X/Twitter, OpenAPI, Agility, Google Workspace, HubSpot, Monday, Salesforce), paginated, "Secured by one" footer |

### Flow
First visit → Platform picker (01) → Click platform → OAuth modal (02) → Authenticate → Success (03) → Connected list (04). From the list, "+ Add new app" → Catalog modal (05).

---

## 2. Agents — Creation Wizard

A 4-step wizard: Basics → Apps → Guardrails → Review.

| # | File | Page / State | Key Components |
|---|------|-------------|----------------|
| 06 | `06-agents-empty-state-light.png` | Agents — Empty state (light) | "Agents" heading, "0 of 1 agent seats used", empty card "No agents yet", "Create agent" CTA |
| 07 | `07-agents-create-step1-basics-light.png` | Create Agent — Step 1: Basics (light) | Step indicator (1-Basics, 2-Apps, 3-Guardrails, 4-Review), Name field, "What should your agent do?" textarea, Anthropic API key field (masked), Model selector cards (Haiku/Sonnet/Opus), Cancel + Next buttons |
| 08 | `08-agents-create-step2-apps-light.png` | Create Agent — Step 2: Apps (light) | "Connected platforms" list with checkboxes, Gmail shown checked, search field, "Select all" / "+ Add new app" actions, Back + Next |
| 09 | `09-agents-create-step3-guardrails-light.png` | Create Agent — Step 3: Guardrails (light) | "What can your agent do?", explanation text, Gmail row with "All actions" expandable, Budget per conversation ($5 input), Max steps per task (100 input), Memory toggle (Stateless vs Persistent cards), Back + Next |
| 10 | `10-agents-create-step3-guardrails-actions-expanded-dark.png` | Create Agent — Step 3: Actions expanded (dark) | Gmail expanded showing individual action permissions with read/write badges (List and View Read or Unread Emails, List and View Email Threads, List and View Email Drafts, Send Email), "Connect all" toggle |
| 11 | `11-agents-create-step3-guardrails-actions-scrolled-dark.png` | Create Agent — Step 3: Actions scrolled (dark) | Continued scroll showing more Gmail actions (List a User's Drafts, Send a User's Draft Email, Update a User's Draft, List a User's Gmail History) with read/write badges |
| 12 | `12-agents-create-step4-review-light.png` | Create Agent — Step 4: Review (light) | Summary card with sections: Basics (Name, Model), Tools (API Key: Provided, Connections: All), Guardrails (Action policy: Full access, Budget: $5/conv, Max steps: 100), Memory (Persistent), Back + "Create agent" CTA |

### Flow
Agents empty (06) → "Create agent" → Step 1 (07) → Step 2 (08) → Step 3 (09, with expand 10/11) → Step 4 (12) → Create.

---

## 3. Agents — Provisioning

The animated provisioning sequence after creating an agent.

| # | File | Page / State | Key Components |
|---|------|-------------|----------------|
| 13 | `13-agents-provisioning-spinner-dark.png` | Provisioning — Spinning up (dark) | Dotted background pattern, loading spinner, "Setting up test-9f429a74", step checklist (Spinning up a dedicated runtime — active), toast notification "Agent created" |
| 14 | `14-agents-provisioning-warming-up-dark.png` | Provisioning — Warming up (dark) | Same layout, steps progressing (Spinning up — done, Connecting Gmail — done, Warming up Claude Opus — active) |
| 15 | `15-agents-provisioning-ready-dark.png` | Provisioning — Ready (dark) | Green checkmark, "test-9f429a74 is ready", "Your agent is live. Try sending a message.", model badge "claude-opus Powered by Claude Opus", "Start chatting" CTA |

---

## 4. Agent Detail — Settings Tab

The main agent management view with a split layout: settings on left, chat panel on right.

| # | File | Page / State | Key Components |
|---|------|-------------|----------------|
| 16 | `16-agent-detail-settings-tab-dark.png` | Agent Detail — Settings (dark) | Left panel: back arrow, agent name + created time, status badges (Open/Active/Pause), tabs (Settings, Skills, Run History), sections: Triggers (empty + "Add schedule" / "Add event trigger"), Tools (1 connection), Guardrails (Full access, $5/conv, 100 steps), Memory (Persistent), Stored Memories (empty), Channels (Telegram). Right panel: "Test Agent" chat with message input, thinking indicator |
| 17 | `17-agent-detail-new-schedule-modal-dark.png` | Agent Detail — New Schedule modal (dark) | Template picker: Morning inbox summary, Weekly email digest, Daily Summary, Hourly Monitor, Weekday Standup, Weekly Digest, Nightly Cleanup, Alert Check. "Start from scratch" link |
| 18 | `18-agent-detail-schedule-config-dark.png` | Schedule Configuration (dark) | Breadcrumb (agent > New Schedule), Label field, Schedule presets (Every hour, Daily at 9am (selected), Weekdays at 9am, Bi-weekly on Monday, Custom), Timezone (America/Chicago), "Deliver results to" chips (Connected Slack, Connected Telegram), Instructions textarea with "Generate with AI" button, Skill reference field, "Next 3 runs" preview |
| 19 | `19-agent-detail-schedule-config-scrolled-dark.png` | Schedule Config — scrolled (dark) | More run previews visible (5 upcoming runs with dates/times and status badges), "Run now" button, Save button |
| 20 | `20-agent-detail-add-event-trigger-platform-picker-dark.png` | Agent Detail — Add Event Trigger modal (dark) | "Choose a platform" grid: Stripe, Settings, Gmail, Google Calendar, Nostr, Notion, Brainplan, Slack, Cancel + Continue |
| 21 | `21-agent-detail-manage-tools-modal-dark.png` | Agent Detail — Manage Tools modal (dark) | API key field (masked), Connections section with "Unselect all" toggle, Gmail connection shown (user email, date), "Action Permissions" expandable (Gmail: 40 actions), Cancel + Save |
| 22 | `22-agent-detail-edit-guardrails-modal-dark.png` | Agent Detail — Edit Guardrails modal (dark) | Action policy radio cards: Full access (selected), Read & write, Read only. Budget/conversation ($5), Max steps (100), Cancel + Save |
| 23 | `23-agent-detail-manage-memory-modal-dark.png` | Agent Detail — Manage Memory modal (dark) | Two cards: Stateless (no memory between messages) vs Persistent (remembers across all conversations, selected), Cancel + Save |

---

## 5. Agent Detail — Channels

Channel connection and configuration from within agent settings.

| # | File | Page / State | Key Components |
|---|------|-------------|----------------|
| 24 | `24-agent-detail-settings-full-dark.png` | Agent Detail — Full settings view (dark) | Scrolled to show Channels section: Telegram (connected), Slack (+ Off, connect), WhatsApp (coming soon). Persona & Info section: CLAUDE.md editor, Model dropdown, Environment badge, Session ID |
| 25 | `25-agent-detail-create-slack-app-modal-dark.png` | Create Slack App — Step 1 (dark) | Multi-step wizard: instructions to go to api.slack.com/apps, YAML manifest preview with app name/description/scopes, Cancel + Next, "Step 1 of 3" |
| 26 | `26-agent-detail-slack-bot-token-modal-dark.png` | Create Slack App — Step 2 (dark) | "Bot Token" instructions: go to OAuth & Permissions, install to workspace, copy Robot User OAuth Token, token input field, "Starts with xoxb-", Back + Next, "Step 2 of 3" |
| 27 | `27-agent-detail-settings-persona-edit-dark.png` | Agent Detail — CLAUDE.md editing (dark) | CLAUDE.md section in edit mode with Save/Cancel buttons, textarea active |
| 28 | `28-agent-detail-model-selector-dropdown-dark.png` | Agent Detail — Model dropdown (dark) | Popover with Haiku, Sonnet (checkmark = selected), Opus options |

---

## 6. Agent Detail — Skills Tab

| # | File | Page / State | Key Components |
|---|------|-------------|----------------|
| 29 | `29-agent-detail-skills-tab-empty-dark.png` | Skills — Empty state (dark) | Robot icon, "No skills attached", description text, "+ Add your first skill" yellow CTA |
| 30 | `30-agent-detail-skills-tab-with-skill-dark.png` | Skills — With skill (dark) | Search bar, "+ Add skill" yellow button, skill card "customer-onboarding-multi" with description, tag chips (3 steps, 4 actions, gmail), toast "Skill 'customer-onboarding' added" |
| 31 | `31-agent-detail-edit-skill-modal-dark.png` | Edit Skill modal (dark) | "Edit customer-onboarding-multi", Description field, "Skill content (Markdown)" editor with markdown content showing structured steps, "Save changes" yellow CTA |

---

## 7. Agent Detail — Run History Tab

| # | File | Page / State | Key Components |
|---|------|-------------|----------------|
| 32 | `32-agent-detail-run-history-tab-dark.png` | Run History — Empty (dark) | Three stat cards at top (Test N, Last 24h, Last 7d — each with Succeeded/Failed/Timeout counts), "Run History" section with empty state "No runs yet" |

---

## 8. Agents List

| # | File | Page / State | Key Components |
|---|------|-------------|----------------|
| 33 | `33-agents-list-with-agent-light.png` | Agents List — With agents (light) | "Agents (1)", "1 of 1 agent seats used", "+ Buy a seat" button, agent card showing: robot icon, name "test-9f429a74", model "Opus", status "Active" green dot, label "teste", "All tools", "4 minutes ago" |

---

## 9. Monitor

| # | File | Page / State | Key Components |
|---|------|-------------|----------------|
| 34 | `34-monitor-log-table-dark.png` | Monitor — Log table (dark) | "Monitor" heading, "Track and review activity across your APIs and connected apps", search + Platform filter, table columns: Time, Status (200 OK green badges), Environment (Production), Action, Platform (Gmail icons), Connection Key (masked). Rows show Gmail API calls |
| 35 | `35-monitor-workspace-switcher-dropdown-dark.png` | Monitor — Workspace switcher (dark) | Dropdown from "Personal" showing Personal workspace selected + "Create organization" option |
| 36 | `36-monitor-notifications-panel-dark.png` | Monitor — Notifications panel (dark) | Slide-over "Notifications" panel, bell icon, "No notifications yet", "View all notifications" link |

---

## 10. Webhooks

| # | File | Page / State | Key Components |
|---|------|-------------|----------------|
| 37 | `37-webhooks-empty-state-dark.png` | Webhooks — Empty state (dark) | "Webhooks" heading, "Subscribe to real-time events and deliver them to your endpoints", search bar, "Event history" + "Create webhook" buttons, empty state card, "What can you do with webhooks?" cards: React to any third-party events, Track connection changes, Detect failed auth |
| 38 | `38-webhooks-event-history-empty-light.png` | Webhook Events — Empty (light) | "Webhook events" heading, search + "All event types" filter, "Back to webhooks" button, empty state |
| 39 | `39-webhooks-create-subscription-modal-dark.png` | Create Webhook — Modal (dark) | Webhook URL field, Event types checkboxes (passthrough.executed, connection.created, connection_code.created), Webhook secret field, Description field, Cancel + "Create webhook" CTA |
| 40 | `40-webhooks-create-subscription-scrolled-dark.png` | Create Webhook — Scrolled (dark) | More event types visible (invoice.updated, payment.retrieved, connection_code.updated), Active toggle, Cancel + "Create webhook" |

---

## 11. Settings (Account Panel)

Full-screen overlay with left sidebar navigation: Account (Profile, Billing, Usage, Invoices), Manage (API Keys, Auth).

| # | File | Page / State | Key Components |
|---|------|-------------|----------------|
| 41 | `41-settings-api-keys-light.png` | Settings — API Keys (light) | Left sidebar, "API Keys" heading, "These keys allow you to authenticate API requests", "+ Create API Key" button, empty state with key icon |
| 42 | `42-settings-create-api-key-modal-light.png` | Settings — Create API Key modal (light) | "Create a new API key", Key name input, validation rules (no spaces, lowercase, hyphens/underscores only), Cancel + Create |
| 43 | `43-settings-auth-integrations-dark.png` | Settings — Auth / Integrations (dark) | "Auth" heading, search + visibility/config filters, table: Integration name, icon, Status, Access, Enabled toggle. Shows Password, Ticktick, Ally, Ally Control, Abstract services |
| 44 | `44-settings-invoices-light.png` | Settings — Invoices (light) | "Invoices" heading, invoice rows with month, invoice ID, Paid badge, Total Due amount |
| 45 | `45-settings-usage-connections-chart-light.png` | Settings — Usage: Connections (light) | "Usage" heading, "Connections" chart (bar chart by date), Environment/Platforms tabs, Production/Sandbox breakdown table |
| 46 | `46-settings-usage-api-calls-chart-dark.png` | Settings — Usage: API Calls (dark) | "API calls" chart (line chart over time), "Total" legend |
| 47 | `47-settings-billing-plans-dark.png` | Settings — Billing & Plans (dark) | "Billing" heading, current plan info (Always Free Plan), Agent Seats section with "Buy Seats" CTA, 4 plan cards: Free, Starter ($29/mo), Pro ($199/mo), Enterprise (Contact Sales), Monthly/Yearly toggle with 15% savings |
| 48 | `48-settings-profile-light.png` | Settings — Profile (light) | "Profile" heading, fields: Username, Email, First Name, Last Name, Save button |

---

## 12. User Menu

| # | File | Page / State | Key Components |
|---|------|-------------|----------------|
| 49 | `49-user-menu-dropdown-dark.png` | User Menu dropdown (dark) | Avatar + name + email, role chips (Tester Tier, Member, API user), links: Account, Documentation, Light Mode toggle, Log out |

---

## Component Inventory (Cross-cutting)

These reusable components appear across multiple pages:

| Component | Appears In | Notes |
|-----------|-----------|-------|
| **Top nav bar** | All pages | Logo, tabs (Apps/Agents/Monitor), env badge, utility icons, avatar |
| **Step wizard** | Agent creation (07-12) | Numbered steps with check/active/pending states, connected by lines |
| **Modal overlay** | 02, 03, 05, 17, 20, 21, 22, 23, 25, 26, 31, 39, 40, 42 | Centered card on dimmed backdrop, consistent close button |
| **Status badge** | Agent detail, monitor | Green "Active", yellow "Open", "Pause" toggle, "200 OK" |
| **Split panel layout** | Agent detail (16+) | Left: settings/config, Right: chat/terminal panel |
| **Card grid** | Platform pickers (01, 05, 20), plan cards (47) | Icon + label, selectable |
| **Tag chips** | Skills (30), apps (04), user menu (49) | Small colored pills |
| **Toggle cards** | Memory (09, 23), action policy (22), model (07) | Selectable card pair/trio |
| **Schedule presets** | 17, 18 | Template cards + custom config form |
| **Toast notifications** | 13, 30 | Bottom-right slide-up toasts |
| **Data table** | Monitor (34), auth (43), invoices (44) | Sortable rows with status badges |
| **Chart widgets** | Usage (45, 46) | Bar + line charts with legend/breakdown |
| **Secured by badge** | OAuth modals (02, 03, 05) | "Secured by [logo] one" footer |

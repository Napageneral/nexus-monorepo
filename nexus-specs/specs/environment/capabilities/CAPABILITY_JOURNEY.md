# Capability Onboarding Journey

**Status:** SPEC COMPLETE  
**Source:** `nexus-cli/.intent/specs/05_CAPABILITY_TAXONOMY.md`, `07_AGENT_BINDINGS.md`

---

## Summary

The **onboarding journey** guides users from zero capabilities to full AI power through a progressive expansion path. Each stage builds on the previous, with clear dependencies and parallel tracks where user choice matters.

---

## The Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CORE ONBOARDING (Required)                          │
│                                                                             │
│  1. ACCESS PLANE ──► 2. NEXUS INSTALL ──► 3. IDENTITY ──► 4. FIRST WOW     │
│                                                                             │
│  Immediately usable: filesystem, computer-use, weather, tmux               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                        ════ DEPTH TRACK ════
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    5. CREDENTIAL MANAGER (Recommended)                      │
│                    1Password, Bitwarden, or Keychain                        │
│                                                                             │
│  Multiplier: Makes all future setup easier and more secure                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                        ════ BREADTH TRACK ════
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CAPABILITY EXPANSION (Parallel)                       │
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │ 6. USER COMMS   │    │ 7. USER DATA    │    │ 8. ENABLE LLM   │         │
│  │ email, messages │    │ calendar, notes │    │ API keys        │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│                                                                             │
│  User chooses their own path — all same level                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                   (Enable LLM unlocks next level)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AGENT INDEPENDENCE (Requires LLM)                        │
│                                                                             │
│  ┌─────────────────────────┐    ┌─────────────────────────┐                │
│  │ 9. AGENT COMMUNICATIONS │    │ 10. AUTOMATION          │                │
│  │ Discord, Telegram       │    │ cron, reminders         │                │
│  └─────────────────────────┘    └─────────────────────────┘                │
│                                                                             │
│  Agent can reach you outside IDE, work while you sleep                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Stage Breakdown

### Stage 1: Core Onboarding (Required)

The foundation that everything else builds on. Complete this first.

#### Step 1: Access Plane (~5 min)

Choose and configure an AI development environment:

| Platform | Setup | Notes |
|----------|-------|-------|
| **Cursor** | Install + open workspace | Recommended - has hooks support |
| **Claude Code** | Install + open workspace | Alternative IDE binding |
| **VS Code + Copilot** | Install + configure | Requires manual bootstrap |

**What happens:** You get an AI agent with terminal and file access.

#### Step 2: Nexus Install (~5 min)

```bash
# Clone the Nexus workspace
git clone https://github.com/nexus-ai/nexus ~/nexus

# Initialize the workspace
cd ~/nexus
nexus init
```

**What `nexus init` does:**
1. Creates `state/` directory structure
2. Creates default `state/user/IDENTITY.md` (empty template)
3. Creates default agent identity in `state/agents/default/`
4. Sets up credential storage structure
5. Validates skill directory structure

#### Step 3: Identity (~5 min)

Two identity files must be created:

**User Identity** (`state/user/IDENTITY.md`):
```markdown
---
name: Your Name
call: What to call you
timezone: Your/Timezone
email: you@example.com
---
# IDENTITY.md - About You

Basic info about yourself that helps your agent understand who you are.
```

**Agent Identity** (`state/agents/{name}/IDENTITY.md`):
```markdown
---
name: AgentName
emoji: 🤖
creature: "A helpful AI assistant"
vibe: "Direct, helpful, curious"
---
# IDENTITY.md - Who I Am

- **Name:** AgentName
- **Emoji:** 🤖
```

**Cursor Hook Integration:** During the Identity step, the Cursor sessionStart hook injects identity and memory into agent context automatically. See [Bootstrap Flow](#bootstrap-flow-agent-bindings) below.

#### Step 4: First Wow (~0 min)

Immediately after identity setup, these capabilities work with no additional configuration:

| Skill | Type | Why It Works | Example |
|-------|------|--------------|---------|
| `filesystem` | Guide | Just shell commands | "Organize my Downloads folder" |
| `computer-use` | Guide | Uses peekaboo (macOS FDA) | "Take a screenshot" |
| `weather` | Guide | Free API, no key needed | "What's the weather?" |
| `tmux` | Tool | Usually pre-installed | "Start a background process" |
| `peekaboo` | Tool | macOS FDA only | "Click on the Safari icon" |

**The "Wow" moment:** Ask your agent to do something useful with just these capabilities. Example: "Find all PDFs in my Downloads older than 30 days and move them to ~/Archive/old-pdfs/"

---

### Stage 2: Depth Track

#### Step 5: Credential Manager (~10 min)

A credential manager is a **multiplier** — it makes all future setup easier and more secure.

| Provider | Setup Time | Notes |
|----------|------------|-------|
| **1Password** | 10 min | Best integration, CLI available |
| **Bitwarden** | 10 min | Open source alternative |
| **macOS Keychain** | 5 min | Built-in, no install needed |

```bash
# Example: 1Password setup
nexus credential add 1password
# Follow prompts to configure op CLI

# Import existing credentials
nexus credential import 1password
nexus credential scan --deep
```

**Why this matters:**
- API keys stored securely (not in plaintext files)
- Agent can retrieve credentials programmatically
- Credentials portable across machines
- Audit trail of credential access

---

### Stage 3: Breadth Track (Parallel)

These three stages can be done in any order. User chooses based on what they want first.

#### Step 6: User Communications (~20 min total)

Give your agent access to how you communicate with humans.

| Capability | Provider | Setup Time | What It Enables |
|------------|----------|------------|-----------------|
| `email-read` | gog + google-oauth | 15 min | Read your emails |
| `email-send` | gog + google-oauth | (same) | Send emails for you |
| `messaging-read` | eve, imsg | 5 min | Read iMessage/SMS |
| `messaging-send` | imsg, wacli | 5 min | Send messages |

**Alignment unlock:** Agent learns who you communicate with, how you write, what matters to you.

#### Step 7: User Data (~15 min total)

Give your agent access to your information.

| Capability | Provider | Setup Time | What It Enables |
|------------|----------|------------|-----------------|
| `calendar` | gog + google-oauth | 5 min | See your schedule |
| `notes` | apple-notes, obsidian | 5 min | Read/write notes |
| `tasks` | things-mac, reminders | 5 min | Manage todos |
| `contacts` | gog + google-oauth | (included) | Know who people are |

**Capability unlock:** Agent can reason about your time, commitments, and knowledge base.

#### Step 8: Enable LLM (~5 min)

Configure API keys for independent agent operation.

| Provider | Setup | Notes |
|----------|-------|-------|
| **Anthropic** | API key | Claude models |
| **OpenAI** | API key | GPT models, DALL-E |
| **Gemini** | API key | Google models |
| **Ollama** | Local install | Privacy-first, no API |

```bash
# Add Anthropic API key
nexus credential add anthropic
# Enter API key when prompted

# Verify it works
nexus credential verify anthropic
```

**Critical unlock:** This enables the Agent Independence stage. Without LLM API access, agents can't run autonomously.

---

### Stage 4: Agent Independence (Requires LLM)

These capabilities require LLM API access to function.

#### Step 9: Agent Communications (~10 min)

Let your agent reach you **outside** the IDE.

| Capability | Provider | What It Enables |
|------------|----------|-----------------|
| `chat-send` | Discord | Agent DMs you on Discord |
| `chat-send` | Telegram | Agent messages via Telegram |
| `chat-send` | Slack | Agent posts to Slack |

**The breakthrough:** You can close Cursor and your agent can still contact you. "Hey, that build finished" or "Your flight is delayed."

```bash
# Setup Discord bot
nexus skills use discord
# Follow guide to create bot and add to server
```

#### Step 10: Automation (~15 min)

Let your agent work while you sleep.

| Capability | Provider | What It Enables |
|------------|----------|-----------------|
| `scheduling` | nexus cron + LLM | Scheduled tasks |
| `reminders` | apple-reminders, gog | Time-based notifications |

**Examples of autonomous work:**
- Check email every hour, summarize important ones
- Monitor GitHub PRs and notify on reviews
- Run daily backup and report status
- Check weather and suggest outfit

```bash
# Setup scheduled tasks
nexus cron add --schedule "0 9 * * *" --task "Check email and summarize"
```

---

## Zero-Config Capabilities

These work immediately after core onboarding with no additional setup:

| Skill | Type | Requirements | Example Use |
|-------|------|--------------|-------------|
| `filesystem` | Guide | None (shell) | File organization, search |
| `computer-use` | Guide | macOS FDA granted | GUI automation |
| `weather` | Guide | None (free API) | Weather queries |
| `tmux` | Tool | tmux installed | Background processes |
| `peekaboo` | Tool | macOS FDA granted | Screenshots, clicks |

**Why these work:**
- No API keys required
- No OAuth flows needed
- Use built-in OS capabilities
- Leverage tools already installed

---

## Recommended Paths

### Quick Path (~35 min)

For users who want to **text their agent from their phone** ASAP:

```
Core Onboarding (15 min)
  └─ Filesystem wow moment
      │
      ▼
User Comms: iMessage via eve (5 min)
  └─ "You should text Mom back"
      │
      ▼
Enable LLM: Anthropic API (5 min)
      │
      ▼
Agent Comms: Discord (10 min)
  └─ Can text agent from phone!
```

**End state:** Agent can read your messages, knows who you talk to, and you can message it on Discord from anywhere.

### Developer Path (~75 min)

For developers who want **full automation**:

```
Core Onboarding (15 min)
      │
      ▼
Credential Manager: 1Password (10 min)
      │
      ▼
User Data: GitHub (5 min) + Gmail (15 min)
      │
      ▼
Enable LLM: Multiple API keys (5 min)
      │
      ▼
Agent Comms: Discord (10 min)
      │
      ▼
Automation: cron jobs (15 min)
```

**End state:** Agent monitors your repos, handles email triage, runs scheduled tasks, and reports to you on Discord.

---

## AI Power Formula

```
AI Power = Capability × Alignment × Duration × Throughput
```

| Factor | What It Measures | Key Unlocks | Journey Stage |
|--------|------------------|-------------|---------------|
| **Capability** | What agent CAN do | Each connector adds capability | Breadth Track |
| **Alignment** | How well agent knows YOU | User comms, identity, memory | Core + User Comms |
| **Duration** | How LONG agent can work | Automation, scheduling | Agent Independence |
| **Throughput** | PARALLEL agent work | Enable LLM + Agent Comms | Agent Independence |

**Key insight:** The deeper you go in the taxonomy, the more powerful ALL your capabilities become. Email access isn't just "read email" — it's alignment data that makes every other capability smarter.

---

## Full Power Scenario

When everything is configured, complex workflows become possible:

```
1. Email arrives about flight check-in (email-read)
2. Agent reads it automatically (Enable LLM + Automation)
3. Agent checks your calendar for conflicts (calendar)
4. Agent uses computer-use to check you in (gui-automation)
5. Agent texts you: "Checked in! Seat 14A" (agent-comms)
6. Agent sets reminder for departure (scheduling)
7. Agent checks weather at destination (weather)
8. Agent updates your travel notes (notes)
```

**Required capabilities:** `email-read` + `llm-anthropic` + `calendar` + `gui-automation` + `chat-send` + `scheduling` + `weather` + `notes`

This is the compound effect of the journey — each capability multiplies the others.

---

## Bootstrap Flow (Agent Bindings)

### Binding Layers (Order of Enforcement)

| Layer | Mechanism | Purpose | Enforcement |
|-------|-----------|---------|-------------|
| 1 | Cursor hooks | Hard gate + context injection | Deterministic |
| 2 | `AGENTS.md` | Canonical protocol | Human readable |
| 3 | `.cursor/rules` | Persistent guidance | Advisory |
| 4 | Skills | How-to docs | Not for bootstrap |

### Cursor SessionStart Hook

The sessionStart hook is the **authoritative bootstrap**. It runs before the first response and injects identity context.

**Files:**
- `.cursor/hooks.json` — Hook configuration
- `.cursor/hooks/nexus-session-start.js` — Hook implementation

**What the hook does:**
1. Runs `nexus status --json`
2. Resolves identity file paths from status output
3. Falls back to default paths if CLI unavailable
4. Injects identity + memory + recent logs as context
5. Includes bootstrap prompt if identity is missing

**Example `hooks.json`:**
```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": "node .cursor/hooks/nexus-session-start.js" }
    ]
  }
}
```

**Context payload injected:**
- Agent identity (`IDENTITY.md`)
- Agent values (`SOUL.md`)
- Agent memory (`MEMORY.md`)
- User identity (`IDENTITY.md`)
- Recent daily logs (today + yesterday)
- Bootstrap prompt (when identity missing)

### AGENTS.md Fallback

When hooks are missing or disabled, agents follow `AGENTS.md`:

```markdown
## 🚀 First Action - Orient Yourself

Run `nexus status` to understand the current state:
```bash
nexus status
```
```

This ensures consistent behavior even without hooks.

---

## CLI Integration

### `nexus status`

Shows current onboarding progress and suggests next steps:

```
$ nexus status

🧭 Atlas | Tyler's Nexus co-pilot

Capabilities:
  ✅ filesystem (active)
  ✅ weather (active)
  ⭐ tmux (ready - never used)
  🔧 email-read (needs-setup: google-oauth)
  🔧 chat-send (needs-setup: discord)

Suggested next steps:
  → Set up Google OAuth to unlock email capabilities
  → Run `nexus skills use google-oauth` to get started
```

### `nexus capabilities`

Full capability map with status:

```
$ nexus capabilities

🗣️ Communication
  ✅ email-read        gog + google-oauth
  ✅ email-send        gog + google-oauth
  🔧 messaging-read    eve (needs FDA)
  📥 chat-send         discord (needs-install)

📋 Productivity
  🔧 calendar          gog + google-oauth
  📥 tasks             things-mac (needs-install)
  ...
```

### `nexus quest` (Future)

Guided onboarding with progress tracking:

```
$ nexus quest start quick-path

🎯 Quick Path Quest
  ✅ Step 1: Core Onboarding (complete)
  ✅ Step 2: iMessage setup (complete)
  ⏳ Step 3: Enable LLM (in progress)
     → Run `nexus skills use anthropic` to continue
  ⬚ Step 4: Discord setup (pending)
```

---

## Capability Status Legend

| Emoji | Status | Meaning | Action |
|-------|--------|---------|--------|
| ✅ | `active` | Configured AND has been used | None - working |
| ⭐ | `ready` | Configured but never used | Try it! |
| 🔧 | `needs-setup` | Installed but needs credentials/config | Run setup |
| 📥 | `needs-install` | Tool needs to be installed | Install first |
| ⛔ | `unavailable` | Not available on this platform | N/A |
| ❌ | `broken` | Was working, now failing | Troubleshoot |

---

## Dependencies

```
                    ┌─────────────┐
                    │   ACCESS    │
                    │   PLANE     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   NEXUS     │
                    │   INSTALL   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  IDENTITY   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐     │     ┌──────▼──────┐
       │ ZERO-CONFIG │     │     │ CREDENTIAL  │
       │   SKILLS    │     │     │   MANAGER   │
       └─────────────┘     │     └──────┬──────┘
                           │            │
         ┌─────────────────┼────────────┼─────────────────┐
         │                 │            │                 │
  ┌──────▼──────┐   ┌──────▼──────┐   ┌▼─────────────┐   │
  │ USER COMMS  │   │  USER DATA  │   │  ENABLE LLM  │   │
  │   (email,   │   │  (calendar, │   │  (API keys)  │───┘
  │  messages)  │   │   notes)    │   │              │
  └─────────────┘   └─────────────┘   └──────┬───────┘
                                             │
                           ┌─────────────────┤
                           │                 │
                    ┌──────▼──────┐   ┌──────▼──────┐
                    │   AGENT     │   │ AUTOMATION  │
                    │   COMMS     │   │  (cron,     │
                    │  (Discord)  │   │  reminders) │
                    └─────────────┘   └─────────────┘
```

**Key dependency:** Enable LLM is required for Agent Independence. Without API access, agents cannot run autonomously outside the IDE session.

---

## See Also

- `COMMANDS.md` — `nexus status`, `nexus capabilities` commands
- `CAPABILITIES.md` — Full provider mapping
- `../../foundation/WORKSPACE_LAYOUT_REFERENCE.md` — Workspace file paths
- `../../foundation/harnesses/HARNESS_BINDINGS.md` — Hooks, rules, bootstrap flow

---

*This document defines the progressive capability expansion path from zero to full AI power.*

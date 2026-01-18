# Capability Taxonomy

> The onboarding journey from zero to full power.

---

## What are Capabilities?

Capabilities are abstract goals: "Can the agent read email?" not "Is gog installed?"

```
Capability (abstract)  →  Provider (concrete)
     email-read        →  gog + google-oauth
     messaging-read    →  eve, imsg, wacli
     chat-send         →  discord, slack
```

Multiple providers can satisfy the same capability. This enables:
- Portability (swap Gmail for Outlook)
- Choice (use whatever tools you prefer)
- Graceful degradation (some capability is better than none)

---

## The Onboarding Journey

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

Note: During the Identity step, the Cursor sessionStart hook injects identity
and memory into agent context. See `07_AGENT_BINDINGS.md`.

---

## Capability Categories

### 🗣️ Communication

| Capability | Description | Providers |
|------------|-------------|-----------|
| `email-read` | Read emails | gog + google-oauth |
| `email-send` | Send emails | gog + google-oauth |
| `messaging-read` | Read SMS/iMessage/WhatsApp | imsg, eve, wacli |
| `messaging-send` | Send messages | imsg, wacli |
| `chat-read` | Read Discord/Slack | discord, slack |
| `chat-send` | Send to Discord/Slack | discord, slack |
| `contacts` | Address book access | gog + google-oauth |

### 📱 Social & News

| Capability | Description | Providers |
|------------|-------------|-----------|
| `social-x` | X/Twitter feed & posting | bird + twitter |
| `rss` | RSS feed monitoring | blogwatcher |
| `news` | News search | brave-search |

### 🔮 Insights

| Capability | Description | Providers |
|------------|-------------|-----------|
| `relationship-insights` | Communication patterns | eve, comms |
| `session-insights` | AI conversation analysis | aix |

### 📋 Productivity

| Capability | Description | Providers |
|------------|-------------|-----------|
| `calendar` | Events, scheduling | gog + google-oauth |
| `tasks` | Todo management | things-mac, apple-reminders |
| `notes` | Note-taking | apple-notes, obsidian, notion |
| `reminders` | Time-based notifications | apple-reminders, gog |

### 💾 Data Access

| Capability | Description | Providers |
|------------|-------------|-----------|
| `cloud-storage` | Google Drive, Dropbox | gog + google-oauth |
| `local-files` | Filesystem access | filesystem guide |

### 🤖 Automation

| Capability | Description | Providers |
|------------|-------------|-----------|
| `scheduling` | Cron/scheduled tasks | nexus cron + LLM |
| `gui-automation` | Screen/mouse control | peekaboo |
| `browser-automation` | Web automation | computer-use + peekaboo |

### 🧠 AI & LLM

| Capability | Description | Providers |
|------------|-------------|-----------|
| `llm-anthropic` | Claude models | anthropic connector |
| `llm-openai` | GPT models | openai connector |
| `llm-gemini` | Gemini models | gemini connector |
| `llm-local` | Local models | ollama |
| `text-to-speech` | Voice synthesis | elevenlabs |
| `speech-to-text` | Transcription | openai-whisper |
| `image-generation` | Generate images | openai (DALL-E) |

### 🏠 Smart Home

| Capability | Description | Providers |
|------------|-------------|-----------|
| `smart-lights` | Philips Hue | openhue |
| `smart-audio` | Sonos, BluOS | sonoscli, blucli |
| `smart-sleep` | Eight Sleep | eightctl |

### 🎵 Music

| Capability | Description | Providers |
|------------|-------------|-----------|
| `spotify` | Spotify playback | spotify-player |
| `music-detection` | Identify songs | songsee |

### 🌐 Web

| Capability | Description | Providers |
|------------|-------------|-----------|
| `web-search` | Search the web | brave-search |
| `web-scraping` | Extract content | firecrawl, apify |
| `weather` | Weather forecasts | weather guide |

### 💻 Development

| Capability | Description | Providers |
|------------|-------------|-----------|
| `version-control` | Git/GitHub | github connector |
| `terminal-sessions` | Tmux management | tmux |
| `mcp-tools` | MCP server management | mcporter |

### 🔐 Security

| Capability | Description | Providers |
|------------|-------------|-----------|
| `credential-management` | Secure secret storage | 1password, keychain |
| `oauth-management` | OAuth token handling | google-oauth |

---

## Capability Status Levels

| Emoji | Status | Meaning |
|-------|--------|---------|
| ✅ | `active` | Configured AND has been used |
| ⭐ | `ready` | Configured, never used |
| 🔧 | `needs-setup` | Needs credential/config |
| 📥 | `needs-install` | Tool needs installation |
| ⛔ | `unavailable` | Not available on this platform |
| ❌ | `broken` | Was working, now failing |

---

## What's Usable Immediately

After core onboarding (identity + workspace), these work with no setup:

| Skill | Type | Why |
|-------|------|-----|
| filesystem | Guide | Just shell commands |
| computer-use | Guide | Uses peekaboo (macOS FDA) |
| weather | Guide | Free API |
| tmux | Tool | Usually pre-installed |
| peekaboo | Tool | macOS FDA only |

Everything else requires connector setup (API keys, OAuth, etc.).

---

## Recommended Paths

### Quick Path (~35 min)

For users who want to text their agent ASAP:

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

### Developer Path (~75 min)

For developers who want full automation:

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

---

## AI Power Formula

```
AI Power = Capability × Alignment × Duration × Throughput
```

| Factor | What It Measures | Key Unlocks |
|--------|------------------|-------------|
| **Capability** | What agent CAN do | Each connector adds capability |
| **Alignment** | How well agent knows YOU | User comms, identity |
| **Duration** | How LONG agent can work | Automation, scheduling |
| **Throughput** | PARALLEL agent work | Enable LLM + Agent Comms |

The deeper you go in the taxonomy, the more powerful ALL your capabilities become.

---

## Full Power Scenario

When everything is configured:

```
1. Email arrives about flight check-in (email-read)
2. Agent reads it automatically (Enable LLM)
3. Agent uses computer-use to check you in (gui-automation)
4. Agent texts you: "Checked in! Seat 14A" (agent-comms)
5. Agent sets reminder for departure (scheduling)
```

This requires: Email + LLM + GUI Automation + Agent Comms + Scheduling

---

## See Also

- **[Full Capability List](./06_CAPABILITIES_REFERENCE.md)** - Exhaustive provider mapping
- **[CLI Reference](./02_CLI_REFERENCE.md)** - `nexus capabilities` command

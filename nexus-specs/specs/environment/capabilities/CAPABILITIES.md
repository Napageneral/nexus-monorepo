# Capabilities System Specification

**Status:** DESIGN
**Source:** `nexus-cli/.intent/specs/05_CAPABILITY_TAXONOMY.md`, `06_CAPABILITIES_REFERENCE.md`

---

## Summary

The **capabilities system** is an abstraction layer that maps abstract goals to concrete providers. It answers "what can the agent do?" rather than "what tools are installed?"

This is a core differentiator from upstream — Nexus thinks in terms of capabilities, enabling portability, choice, and graceful degradation.

---

## Core Concept

Capabilities are abstract goals. Providers are concrete implementations.

```
Capability (abstract)  →  Provider (concrete)
     email             →  gog + google-oauth
     messaging         →  eve, imsg, wacli
     chat              →  discord, slack
     web-search        →  brave-search
```

**Benefits:**

| Benefit | Description |
|---------|-------------|
| **Portability** | Swap Gmail for Outlook without changing skills |
| **Choice** | Use whatever tools you prefer |
| **Graceful degradation** | Some capability is better than none |
| **Status tracking** | Know what's active, ready, or needs setup |

Multiple providers can satisfy the same capability. The system tracks which are configured and lets agents know what's possible.

---

## Status System

Each **skill** (provider) has a status indicating its readiness. Capabilities inherit status from their providers — if any provider for a capability is active, the capability is active.

| Emoji | Status | Meaning |
|-------|--------|---------|
| ✅ | `active` | Configured AND has been used |
| ⭐ | `ready` | Configured but never used — try it! |
| 🔧 | `needs-setup` | Installed but needs credentials/config |
| 📥 | `needs-install` | Tool needs to be installed |
| ⛔ | `unavailable` | Not available on this platform |
| ❌ | `broken` | Was working, now failing |

**Status Resolution Logic:**

```
if platform_incompatible:
    status = "unavailable"
elif binary_missing:
    status = "needs-install"
elif credentials_missing:
    status = "needs-setup"
elif never_used:
    status = "ready"
else:
    status = "active"
```

The `broken` status is set when verification fails on a previously working capability.

---

## How Capabilities Are Resolved

Capabilities emerge from skills through frontmatter declarations.

### Skill Declaration

Skills declare what they provide and require:

```yaml
---
name: gog
type: tool
capabilities:
  - email
  - calendar
  - contacts
  - cloud-storage
requires:
  bins:
    - gog
  credentials:
    - google-oauth
platforms:
  - darwin
  - linux
---
```

### Resolution Algorithm

1. **Scan skills** — Find all skills with `capabilities:` declarations
2. **Check requirements** — For each skill:
   - `bins:` — Is the binary in PATH?
   - `credentials:` — Are credentials configured?
   - `platforms:` — Does current platform match?
3. **Compute status** — Based on which requirements are met
4. **Track usage** — Update to `active` after first use

### Multiple Providers

When multiple skills provide the same capability:

```
messaging:
  ├─ eve (darwin) → status: active
  ├─ imsg (darwin) → status: ready
  └─ wacli (all) → status: needs-setup
```

The capability's overall status is the "best" of its providers.

---

## Capability Categories

### 🗣️ Communication

| Capability | Description | Providers | Setup |
|------------|-------------|-----------|-------|
| `email` | Read and send emails | gog + google-oauth | OAuth |
| `messaging` | SMS/iMessage/WhatsApp messaging | imsg (darwin), eve (darwin), wacli | FDA / QR |
| `chat` | Discord/Slack chat | discord, slack | Bot token / OAuth |
| `contacts` | Address book access | gog + google-oauth | OAuth |
| `voice` | Voice calls | (TBD) | — |

### 📱 Social & News

| Capability | Description | Providers | Setup |
|------------|-------------|-----------|-------|
| `social-x` | X/Twitter feed & posting | bird + twitter | Cookie auth |
| `social-instagram` | Instagram access | (needs provider) | — |
| `social-linkedin` | LinkedIn access | (needs provider) | — |
| `rss` | RSS feed monitoring | blogwatcher | None |
| `news` | News search | brave-search | API key |

### 🔮 Insights

| Capability | Description | Providers | Setup |
|------------|-------------|-----------|-------|
| `personal-insights` | Personal pattern analysis | eve, comms | FDA |
| `relationship-insights` | Communication patterns | eve, comms | FDA |
| `session-insights` | AI conversation analysis | aix | None |
| `communication-insights` | Cross-platform comms analysis | comms | Multiple sources |

### 📋 Productivity

| Capability | Description | Providers | Setup |
|------------|-------------|-----------|-------|
| `calendar` | Events, scheduling | gog + google-oauth | OAuth |
| `tasks` | Todo management | things-mac (darwin), apple-reminders (darwin), trello | App/API |
| `notes` | Note-taking | apple-notes (darwin), bear-notes (darwin), obsidian, notion | App/API |
| `reminders` | Time-based notifications | apple-reminders (darwin), gog | App/OAuth |
| `pdf-processing` | PDF manipulation | nano-pdf | API key |
| `collaboration` | Shared workspace | nexus-cloud | Account |

### 💾 Data Access

| Capability | Description | Providers | Setup |
|------------|-------------|-----------|-------|
| `cloud-storage` | Google Drive, Dropbox | gog + google-oauth | OAuth |
| `local-files` | Filesystem access | filesystem guide | FDA |

### 🤖 Automation

| Capability | Description | Providers | Setup |
|------------|-------------|-----------|-------|
| `scheduling` | Cron/scheduled tasks | nexus cron | LLM API |
| `reactive-triggers` | Event-based automation | (needs implementation) | LLM API |
| `gui-automation` | Screen/mouse control | peekaboo (darwin) | FDA |
| `browser-automation` | Web automation | computer-use + peekaboo | FDA |

### 🧠 AI & LLM

| Capability | Description | Providers | Setup |
|------------|-------------|-----------|-------|
| `llm-anthropic` | Claude models | anthropic connector | API key |
| `llm-openai` | GPT models | openai connector | API key |
| `llm-gemini` | Gemini models | gemini connector | API key |
| `llm-local` | Local models | ollama | Install |
| `text-to-speech` | Voice synthesis | elevenlabs | API key |
| `speech-to-text` | Transcription | openai-whisper, openai-whisper-api | Install/API |
| `image-generation` | Generate images | openai (DALL-E), nano-banana-pro | API key |
| `summarization` | Content summarization | summarize + LLM | API key |

### 🏠 Smart Home & IoT

| Capability | Description | Providers | Setup |
|------------|-------------|-----------|-------|
| `smart-lights` | Philips Hue control | openhue + hue | Bridge auth |
| `smart-audio` | Sonos, BluOS | sonoscli, blucli | Network |
| `smart-sleep` | Eight Sleep | eightctl + eightsleep | Account auth |
| `bluetooth` | Bluetooth devices | blucli (darwin) | None |
| `camera-control` | Camera capture | camsnap (darwin) | Camera config |

### 🎵 Music

| Capability | Description | Providers | Setup |
|------------|-------------|-----------|-------|
| `spotify` | Spotify playback | spotify-player + spotify | OAuth |
| `apple-music` | Apple Music | (needs provider) | — |
| `youtube-music` | YouTube Music | (needs provider) | — |
| `music-detection` | Identify songs | songsee (darwin) | None |

### 🌐 Web

| Capability | Description | Providers | Setup |
|------------|-------------|-----------|-------|
| `web-search` | Search the web | brave-search | API key |
| `web-scraping` | Extract content | firecrawl, apify | API key |
| `url-fetch` | Fetch and summarize URLs | summarize | LLM API |
| `weather` | Weather forecasts | weather guide | None |
| `place-search` | Location/business search | goplaces, local-places | API key |

### 🎬 Media & Creative

| Capability | Description | Providers | Setup |
|------------|-------------|-----------|-------|
| `video-processing` | Video manipulation | video-frames (ffmpeg) | Install |
| `screenshot-annotation` | Annotate screenshots | sag | None |
| `gif-search` | Search GIFs | gifgrep | API key (full) |
| `transcription` | Audio transcription | openai-whisper | Install/API |
| `document-rendering` | Render documents | qmd | Install |

### 💻 Development

| Capability | Description | Providers | Setup |
|------------|-------------|-----------|-------|
| `version-control` | Git/GitHub | github | OAuth/token |
| `vercel` | Vercel deployment | (needs skill) | API token |
| `cloudflare` | Cloudflare management | cloudflare | API token |
| `aws` | AWS services | (needs skill) | Credentials |
| `gcloud` | Google Cloud | (needs skill) | Credentials |
| `coding-agents` | Spawn coding agents | coding-agent guide | Codex + API |
| `mcp-tools` | MCP server management | mcporter | Install |
| `git-sync` | Upstream syncing | upstream-sync | None |
| `terminal-sessions` | Tmux management | tmux | Install |

### ☁️ Cloud & Sync

| Capability | Description | Providers | Setup |
|------------|-------------|-----------|-------|
| `cloud-sync` | Encrypted backup | nexus-cloud | Account |
| `rollback` | Version rollback | nexus-cloud, github | Account |

### 🔐 Security

| Capability | Description | Providers | Setup |
|------------|-------------|-----------|-------|
| `credential-management` | Secure secret storage | 1password, keychain | App/None |
| `oauth-management` | OAuth token handling | google-oauth, etc. | OAuth flow |

### 🛒 Commerce

| Capability | Description | Providers | Setup |
|------------|-------------|-----------|-------|
| `food-ordering` | Order food delivery | ordercli, food-order | Account auth |

---

## Immediately Usable Capabilities

After core onboarding (identity + workspace), these work with no additional setup:

| Capability | Provider | Why |
|------------|----------|-----|
| `local-files` | filesystem guide | Just shell commands |
| `gui-automation` | peekaboo | macOS FDA only |
| `weather` | weather guide | Free API |
| `terminal-sessions` | tmux | Usually pre-installed |
| `session-insights` | aix | No external deps |
| `screenshot-annotation` | sag | No external deps |
| `rss` | blogwatcher | No API key needed |

Everything else requires connector setup (API keys, OAuth, etc.).

---

## Platform Notes

- **(darwin)** — macOS only
- **FDA** — Full Disk Access required
- **LLM API** — Requires an LLM API key configured
- **OAuth** — Requires OAuth flow completion
- **API key** — Requires service API key

---

## CLI Integration

### View All Capabilities

```bash
nexus capabilities
```

Output grouped by category with status indicators:

```
🗣️ Communication
  ✅ email              gog + google-oauth
  ⭐ messaging          eve
  🔧 chat               discord (needs-setup)

📋 Productivity
  ✅ calendar           gog + google-oauth
  📥 tasks              things-mac (needs-install)
```

### Filter by Status

```bash
nexus capabilities --status ready
nexus capabilities --status needs-setup
```

### Check Specific Capability

```bash
nexus skills info gog  # Shows capabilities provided by skill
```

### Status Command Integration

`nexus status` includes a capabilities summary:

```
Capabilities: 12 active, 5 ready, 8 need setup
```

---

## Adding New Capabilities

Capabilities emerge from skills. To add a new capability:

1. **Create a skill** that provides it
2. **Add frontmatter** declarations:
   ```yaml
   capabilities:
     - new-capability-name
   requires:
     bins:
       - required-binary
     credentials:
       - required-credential
   ```
3. **The capability appears** in `nexus capabilities`

The predefined categories above are the starting taxonomy. New capabilities can be added as skills define them.

---

## The Onboarding Journey

Capabilities unlock progressively through onboarding:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CORE ONBOARDING (Required)                          │
│                                                                             │
│  Immediately usable: filesystem, weather, tmux, peekaboo                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                        ════ DEPTH TRACK ════
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CREDENTIAL MANAGER (Recommended)                         │
│                    Unlocks: credential-management                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                        ════ BREADTH TRACK ════
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CAPABILITY EXPANSION (Parallel)                       │
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │ USER COMMS      │    │ USER DATA       │    │ ENABLE LLM      │         │
│  │ email, messages │    │ calendar, notes │    │ API keys        │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                   (Enable LLM unlocks next level)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AGENT INDEPENDENCE (Requires LLM)                        │
│                                                                             │
│  Unlocks: scheduling, reactive-triggers, autonomous agent work             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Full Power Scenario

When everything is configured, capabilities chain together:

```
1. Email arrives about flight check-in    (email)
2. Agent reads it automatically           (llm-anthropic)
3. Agent uses computer-use to check in    (gui-automation)
4. Agent texts you: "Checked in! 14A"     (chat)
5. Agent sets departure reminder          (scheduling)
```

**Required capabilities:** email + llm + gui-automation + chat + scheduling

---

## AI Power Formula

```
AI Power = Capability × Alignment × Duration × Throughput
```

| Factor | What It Measures | Key Unlocks |
|--------|------------------|-------------|
| **Capability** | What agent CAN do | Each connector adds capability |
| **Alignment** | How well agent knows YOU | User comms, identity, insights |
| **Duration** | How LONG agent can work | Automation, scheduling |
| **Throughput** | PARALLEL agent work | Enable LLM + Agent Comms |

The deeper you go in the taxonomy, the more powerful ALL your capabilities become.

---

## See Also

- `../skills/` — Skills system (how skills provide capabilities)
- `COMMANDS.md` — `nexus capabilities` command
- `../credentials/CREDENTIAL_SYSTEM.md` — How credentials enable capabilities

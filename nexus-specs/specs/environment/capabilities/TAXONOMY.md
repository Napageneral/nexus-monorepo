# Skills Taxonomy Specification

**Status:** SPEC COMPLETE  
**Last Updated:** 2026-01-22

---

## Overview

This document defines the taxonomy system for Nexus skills, including how domains, capabilities, and services work together to enable discovery, credential linking, and organization.

---

## Core Concepts

### Three-Layer Model

```
Domain (grouping - for display/search)
└── Capability (what you can access)
    └── Service (who provides it)
```

| Layer | Purpose | Examples | Where Defined |
|-------|---------|----------|---------------|
| **Domain** | Grouping for display, onboarding, search | communication, productivity, ai | Derived from capabilities |
| **Capability** | What kind of access | email, calendar, chat, llm, search | Skill `capabilities` field |
| **Service** | Who provides it, credential linkage | google, discord, anthropic, brave | Skill `requires.credentials` field |

### Key Insight

**Capabilities are what you can access.** They answer "what can you do?" (email, calendar, chat).

**Services are concrete providers.** They answer "through which service?" and link to credentials.

**Domains are for organization.** They're derived from capabilities, not declared by skills. A capability can belong to multiple domains.

---

## Taxonomy Definitions

### Domains

Domains group capabilities for display and onboarding. They are **not declared by skills** - they're derived from capabilities. A capability can belong to multiple domains.

```yaml
domains:
  communication:
    description: "Reach people and stay connected"
    capabilities: [email, messaging, chat, contacts]
  
  productivity:
    description: "Organize your time and tasks"
    capabilities: [calendar, tasks, notes, reminders]
  
  ai:
    description: "AI and machine learning capabilities"
    capabilities: [llm, tts, stt, image-gen, vision]
  
  data:
    description: "Access and search information"
    capabilities: [files, search, cloud-storage]
  
  automation:
    description: "Automate workflows and interfaces"
    capabilities: [gui, browser, scheduling, webhooks]
  
  social:
    description: "Social media and news"
    capabilities: [social, rss, news]
  
  media:
    description: "Audio, video, and images"
    capabilities: [music, video, audio, images]
  
  smart-home:
    description: "Control smart devices"
    capabilities: [lights, audio-devices, climate]
  
  development:
    description: "Developer tools and workflows"
    capabilities: [version-control, terminal, mcp]
```

### Capabilities

Capabilities are what skills provide access to. Skills declare which capabilities they enable.

```yaml
capabilities:
  # Communication
  email:
    domains: [communication]
    description: "Read and send email"
  messaging:
    domains: [communication]
    description: "SMS, iMessage, WhatsApp, Telegram"
  chat:
    domains: [communication]
    description: "Discord, Slack, and team chat"
  contacts:
    domains: [communication, productivity]
    description: "Address book and contact management"
  
  # Productivity
  calendar:
    domains: [productivity]
    description: "Events and scheduling"
  tasks:
    domains: [productivity]
    description: "Todo lists and task management"
  notes:
    domains: [productivity]
    description: "Note-taking and knowledge management"
  reminders:
    domains: [productivity]
    description: "Time-based notifications"
  
  # AI
  llm:
    domains: [ai]
    description: "Large language model access"
  tts:
    domains: [ai, media]
    description: "Text-to-speech synthesis"
  stt:
    domains: [ai, media]
    description: "Speech-to-text transcription"
  image-gen:
    domains: [ai, media]
    description: "Image generation"
  vision:
    domains: [ai]
    description: "Image and video analysis"
  
  # Data
  files:
    domains: [data]
    description: "Local filesystem access"
  search:
    domains: [data]
    description: "Web and information search"
  cloud-storage:
    domains: [data]
    description: "Cloud file storage"
  
  # Automation
  gui:
    domains: [automation]
    description: "GUI automation and screen control"
  browser:
    domains: [automation]
    description: "Browser automation"
  scheduling:
    domains: [automation]
    description: "Cron jobs and scheduled tasks"
  webhooks:
    domains: [automation]
    description: "Inbound webhook handling"
  
  # Social
  social:
    domains: [social]
    description: "Social media platforms"
  rss:
    domains: [social, data]
    description: "RSS feed monitoring"
  news:
    domains: [social, data]
    description: "News and current events"
  
  # Media
  music:
    domains: [media]
    description: "Music playback and discovery"
  video:
    domains: [media]
    description: "Video processing and playback"
  audio:
    domains: [media]
    description: "Audio processing"
  images:
    domains: [media]
    description: "Image processing"
  
  # Smart Home
  lights:
    domains: [smart-home]
    description: "Smart lighting control"
  audio-devices:
    domains: [smart-home, media]
    description: "Smart speakers and audio"
  climate:
    domains: [smart-home]
    description: "Thermostat and climate control"
  
  # Development
  version-control:
    domains: [development]
    description: "Git and version control"
  terminal:
    domains: [development]
    description: "Terminal session management"
  mcp:
    domains: [development]
    description: "MCP server management"
```

### Services

Services are providers that require credentials. The credential system stores secrets by service name. Connectors enable services by guiding credential setup.

```yaml
services:
  # Communication Services
  google:
    description: "Google Workspace (Gmail, Calendar, Drive)"
    capabilities: [email, calendar, contacts, cloud-storage, tasks]
  
  discord:
    description: "Discord chat platform"
    capabilities: [chat]
  
  slack:
    description: "Slack team messaging"
    capabilities: [chat]
  
  telegram:
    description: "Telegram messaging"
    capabilities: [messaging]
  
  apple:
    description: "Apple services (iMessage, Notes, Reminders)"
    capabilities: [messaging, notes, reminders, contacts]
  
  # AI Services
  anthropic:
    description: "Anthropic Claude models"
    capabilities: [llm]
  
  openai:
    description: "OpenAI GPT models and APIs"
    capabilities: [llm, tts, stt, image-gen]
  
  gemini:
    description: "Google Gemini models"
    capabilities: [llm, vision]
  
  elevenlabs:
    description: "ElevenLabs voice synthesis"
    capabilities: [tts]
  
  # Data Services
  brave:
    description: "Brave Search API"
    capabilities: [search]
  
  firecrawl:
    description: "Web scraping service"
    capabilities: [search]
  
  # Social Services
  twitter:
    description: "X/Twitter platform"
    capabilities: [social]
  
  # Development Services
  github:
    description: "GitHub version control"
    capabilities: [version-control]
  
  # Smart Home Services
  hue:
    description: "Philips Hue lighting"
    capabilities: [lights]
  
  sonos:
    description: "Sonos audio system"
    capabilities: [audio-devices]
```

---

## Skill Metadata Schema

### NexusSkillMetadata

```typescript
type NexusSkillMetadata = {
  // Classification
  type: "tool" | "connector" | "guide";
  emoji?: string;
  
  // What this skill provides
  capabilities?: string[];     // For tools/guides: capabilities enabled (email, calendar, etc.)
  enables?: string[];          // For connectors: services this sets up credentials for (google, discord, etc.)
  
  // Dependencies
  requires?: {
    credentials?: string[];    // Service names (links to credential system)
    bins?: string[];           // Required binaries (all must exist)
    anyBins?: string[];        // Alternative binaries (any one works)
  };
  
  // Platform restrictions
  platform?: string[];         // darwin, linux, win32
  
  // Installation instructions
  install?: SkillInstallSpec[];
  
  // Hub metadata
  hubSlug?: string;
};
```

**Field Usage by Skill Type:**

| Type | `capabilities` | `enables` | `requires.credentials` |
|------|----------------|-----------|------------------------|
| Tool | What it provides (email, calendar) | - | Services it needs (google) |
| Connector | - | Services it sets up (google) | - |
| Guide | What it provides (files, gui) | - | Optional |

### Changes from Upstream (ClawdbotSkillMetadata)

| Field | Upstream | Nexus | Notes |
|-------|----------|-------|-------|
| `type` | Inferred | Required | Explicit classification |
| `provides` | Not used | → `capabilities` | Renamed for clarity |
| `requires.env` | Used for API keys | Removed | Use `credentials` instead |
| `requires.config` | Config path checks | Removed | Simplify to credentials |
| `requires.credentials` | Not in upstream | Added | Service names for auth |
| `primaryEnv` | Env var name | Removed | Handled by credential system |
| `skillKey` | Config override | Removed | Use skill name |
| `always` | Force include | Keep | For core skills |

---

## Skill Examples

### Tool Skill (gog)

```yaml
---
name: gog
description: Google Workspace CLI for Gmail, Calendar, Drive, Contacts.
metadata:
  nexus:
    type: tool
    emoji: 📧
    capabilities: [email, calendar, contacts, cloud-storage]
    requires:
      credentials: [google]
      bins: [gog]
    platform: [darwin, linux]
    install:
      - kind: brew
        formula: steipete/tap/gogcli
---
```

### Connector Skill (google-oauth)

```yaml
---
name: google-oauth
description: Set up Google OAuth for Gmail, Calendar, Drive, and other Google services.
metadata:
  nexus:
    type: connector
    emoji: 🔐
    enables: [google]
---
```

**Note:** Connectors use `enables` to declare which services they set up credentials for. This enables discovery: "find connectors that enable the google service."

### Guide Skill (filesystem)

```yaml
---
name: filesystem
description: Organize and manage local files with safety-first principles.
metadata:
  nexus:
    type: guide
    emoji: 📁
    capabilities: [files]
    platform: [darwin, linux]
---
```

**Note:** No `requires.credentials` - this skill doesn't need external service auth.

### Tool Without Service (peekaboo)

```yaml
---
name: peekaboo
description: macOS GUI automation and screen capture.
metadata:
  nexus:
    type: tool
    emoji: 👀
    capabilities: [gui]
    requires:
      bins: [peekaboo]
    platform: [darwin]
    install:
      - kind: brew
        formula: steipete/tap/peekaboo
---
```

**Note:** Has capabilities but no credentials required - uses macOS native APIs.

---

## Credential ↔ Connector ↔ Tool Flow

### The Linking Model

```
Tool (gog)
  capabilities: [email, calendar, contacts, cloud-storage]
  requires.credentials: [google]
           │
           │ needs credential for service
           ▼
Credential Store
  services:
    google:
      accounts: [tnapathy@gmail.com]
      status: active
           │
           │ if missing, find connector that enables this service
           ▼
Connector (google-oauth)
  enables: [google]
  type: connector
           │
           │ guides user through setup
           ▼
Credential Created → Tool Works
```

### Discovery Flow

1. User wants email capability
2. Nexus finds gog: `capabilities: [email]`, `requires.credentials: [google]`
3. Nexus checks: does `google` credential exist?
4. If no: search for skills where `type: connector` AND `enables: [google]`
5. Finds google-oauth connector
6. Suggests: "Run `nexus skills use google-oauth` to set up Google credentials"

### Status Detection

```typescript
function getSkillStatus(skill: Skill): SkillStatus {
  const meta = skill.metadata?.nexus;
  
  // Check platform
  if (meta?.platform?.length && !meta.platform.includes(process.platform)) {
    return { status: "unavailable", reason: "platform" };
  }
  
  // Check binaries
  const missingBins = (meta?.requires?.bins ?? []).filter(b => !hasBinary(b));
  if (missingBins.length > 0) {
    return { status: "needs-install", missing: { bins: missingBins } };
  }
  
  // Check credentials
  const missingCreds = (meta?.requires?.credentials ?? [])
    .filter(s => !hasCredential(s));
  if (missingCreds.length > 0) {
    return { status: "needs-setup", missing: { credentials: missingCreds } };
  }
  
  // Check usage
  if (hasUsage(skill.name)) {
    return { status: "active" };
  }
  
  return { status: "ready" };
}
```

---

## Display Tree

The three-layer model renders as:

```
Communication (domain)
├── Email (capability)
│   └── google (service, via gog) ✅
├── Chat (capability)
│   ├── discord ✅
│   └── slack 🔧
├── Messaging (capability)
│   ├── apple (via eve) ✅
│   └── telegram 📥
└── Contacts (capability)
    └── google (via gog) ✅

Productivity (domain)
├── Calendar (capability)
│   └── google (via gog) ✅
└── Tasks (capability)
    └── things 📥

AI (domain)
├── LLM (capability)
│   ├── anthropic ✅
│   ├── openai ⭐
│   └── gemini ✅
└── TTS (capability)
    └── elevenlabs 🔧

Data (domain)
├── Files (capability)
│   └── local (via filesystem) ✅
└── Search (capability)
    └── brave 🔧

Automation (domain)
├── GUI (capability)
│   └── macos (via peekaboo) ✅
└── Browser (capability)
    └── chromium (via computer-use) ✅
```

### How This is Generated

1. Get all skills with their capabilities
2. For each capability, find skills that provide it
3. For each skill, check which service (from `requires.credentials`) or mark as "local"
4. Group by domain (derived from capability)
5. Show status emoji based on credential/binary availability

---

## Local vs Hub Behavior

### Local Skills

**Without metadata.nexus:**
- Include the skill
- Infer type from directory (tools/ → tool, connectors/ → connector, guides/ → guide)
- Capabilities: empty (skill works but won't appear in capability searches)
- Flag as "unclassified" in `nexus skills list`
- Agent can suggest adding metadata

**With partial metadata.nexus:**
- Accept whatever is provided
- Missing fields get defaults or remain empty
- Status detection still works for what's declared

### Hub Submissions

**Without metadata.nexus:**
- Accept submission
- Queue for agent-assisted metadata population
- Agent analyzes SKILL.md content, proposes:
  - `type` based on content patterns
  - `capabilities` based on what the skill does
  - `requires.credentials` based on mentioned services
- Human review before publishing

**With metadata.nexus:**
- Validate against taxonomy
- Unknown capabilities: create proposal record
- Unknown services: create proposal record
- Publish after review

---

## Extending the Taxonomy

### Adding New Capabilities

1. User publishes skill with unknown capability (e.g., `capabilities: [podcasts]`)
2. Hub creates capability proposal
3. Admin reviews:
   - Approve → adds to capability taxonomy with domain assignment
   - Map → points to existing capability (e.g., `podcasts` → `audio`)
   - Reject → skill works but capability won't appear in taxonomy tree
4. Uncategorized capabilities are fine - they'll show under "Other" until categorized

### Adding New Services

1. User publishes connector with new service (e.g., `enables: [fastmail]`)
2. Hub creates service proposal
3. Admin reviews:
   - Approve → adds to service taxonomy with capability mapping
   - Map → points to existing (unlikely for services)
   - Reject → connector works but service isn't "official"

### Community Governance

- Base taxonomy is curated (maintained by Nexus team)
- Extensions are proposed through hub submissions
- Popular unofficial capabilities/services get promoted to base
- Aliases supported (e.g., `mail` → `email`)
- New capabilities can be uncategorized initially - domains derived later

---

## CLI Integration

### nexus capabilities

Shows capability tree with status:

```bash
nexus capabilities                    # Full tree grouped by domain
nexus capabilities --domain communication
nexus capabilities --capability email
nexus capabilities --service google
nexus capabilities --status ready
nexus capabilities --json
```

### nexus skills list

Shows skills with capability info:

```bash
nexus skills list                      # All skills
nexus skills list --type tool
nexus skills list --capability email   # Skills providing email capability
nexus skills list --service google     # Skills requiring google credentials
```

### nexus skills info

Shows skill detail including capabilities:

```
📧 gog

Type: tool
Status: ✅ active

Capabilities: email, calendar, contacts, cloud-storage
Requires:
  Credentials: google ✅
  Binaries: gog ✅

Usage: 47 runs, last used 2 hours ago
```

---

## Summary

| Concept | What It Is | Where Declared | How Used |
|---------|------------|----------------|----------|
| **Domain** | Display grouping | Taxonomy file | UI organization, onboarding |
| **Capability** | What you can access | Skill `capabilities` | Search, status detection |
| **Service** | Provider/credential | Skill `requires.credentials` | Credential linking |
| **Type** | Skill classification | Skill `type` | Storage location, behavior |

**The formula:**
- Tools declare `capabilities` (what they enable) + `requires.credentials` (services they need)
- Connectors declare `enables` (services they set up credentials for)
- Guides declare `capabilities` without credential requirements
- Domains are derived from capabilities for display grouping

---

## Source Files

| File | Purpose |
|------|---------|
| `nexus-cli/src/agents/skills.ts` | Skill loading and metadata parsing |
| `nexus-cli/src/agents/skills-status.ts` | Status detection |
| `nexus-cli/src/cli/skills-cli.ts` | CLI commands |
| `nexus-website/app/lib/schema.ts` | Hub database schema |

---

*This taxonomy enables flexible skill discovery while maintaining clean credential integration and intuitive organization.*

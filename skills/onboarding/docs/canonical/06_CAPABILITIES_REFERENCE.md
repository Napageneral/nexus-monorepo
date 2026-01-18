# Capabilities Reference

> Exhaustive list of all capabilities and their providers.

---

## Overview

This is the complete mapping of capabilities to providers. Use `nexus capabilities` to see what's active in your workspace.

Agent bootstrap/binding is handled by Cursor hooks (not a capability). See
`07_AGENT_BINDINGS.md`.

---

## Communication

| Capability | Providers | Setup |
|------------|-----------|-------|
| `email-read` | gog + google-oauth | OAuth |
| `email-send` | gog + google-oauth | OAuth |
| `messaging-read` | imsg (darwin), eve (darwin), wacli | FDA / QR |
| `messaging-send` | imsg (darwin), wacli | FDA / QR |
| `chat-read` | discord, slack | Bot token / OAuth |
| `chat-send` | discord, slack | Bot token / OAuth |
| `contacts` | gog + google-oauth | OAuth |
| `voice` | (TBD) | — |

---

## Social & News

| Capability | Providers | Setup |
|------------|-----------|-------|
| `social-x` | bird + twitter | Cookie auth |
| `social-instagram` | (needs provider) | — |
| `social-linkedin` | (needs provider) | — |
| `rss` | blogwatcher | None |
| `news` | brave-search | API key |

---

## Insights

| Capability | Providers | Setup |
|------------|-----------|-------|
| `personal-insights` | eve, comms | FDA |
| `relationship-insights` | eve, comms | FDA |
| `session-insights` | aix | None |
| `communication-insights` | comms | Multiple sources |

---

## Productivity

| Capability | Providers | Setup |
|------------|-----------|-------|
| `tasks` | things-mac (darwin), apple-reminders (darwin), trello | App/API |
| `notes` | apple-notes (darwin), bear-notes (darwin), obsidian, notion | App/API |
| `calendar` | gog + google-oauth | OAuth |
| `reminders` | apple-reminders (darwin), gog | App/OAuth |
| `pdf-processing` | nano-pdf | API key |
| `collaboration` | nexus-cloud | Account |

---

## Data Access

| Capability | Providers | Setup |
|------------|-----------|-------|
| `cloud-storage` | gog + google-oauth | OAuth |
| `local-files` | filesystem guide | FDA |

---

## Automation

| Capability | Providers | Setup |
|------------|-----------|-------|
| `scheduling` | nexus cron | LLM API |
| `reactive-triggers` | (needs implementation) | LLM API |
| `gui-automation` | peekaboo (darwin) | FDA |
| `browser-automation` | computer-use + peekaboo | FDA |

---

## AI & LLM

| Capability | Providers | Setup |
|------------|-----------|-------|
| `llm-anthropic` | anthropic connector | API key |
| `llm-openai` | openai connector | API key |
| `llm-gemini` | gemini connector | API key |
| `llm-local` | ollama | Install |
| `text-to-speech` | elevenlabs | API key |
| `speech-to-text` | openai-whisper, openai-whisper-api | Install/API |
| `image-generation` | openai (DALL-E), nano-banana-pro | API key |
| `summarization` | summarize + LLM | API key |

---

## Smart Home & IoT

| Capability | Providers | Setup |
|------------|-----------|-------|
| `smart-lights` | openhue + hue | Bridge auth |
| `smart-audio` | sonoscli, blucli | Network |
| `smart-sleep` | eightctl + eightsleep | Account auth |
| `bluetooth` | blucli (darwin) | None |
| `camera-control` | camsnap (darwin) | Camera config |

---

## Music

| Capability | Providers | Setup |
|------------|-----------|-------|
| `spotify` | spotify-player + spotify | OAuth |
| `apple-music` | (needs provider) | — |
| `youtube-music` | (needs provider) | — |
| `music-detection` | songsee (darwin) | None |

---

## Web

| Capability | Providers | Setup |
|------------|-----------|-------|
| `web-search` | brave-search | API key |
| `web-scraping` | firecrawl, apify | API key |
| `url-fetch` | summarize | LLM API |
| `weather` | weather guide | None |
| `place-search` | goplaces, local-places | API key |

---

## Media & Creative

| Capability | Providers | Setup |
|------------|-----------|-------|
| `video-processing` | video-frames (ffmpeg) | Install |
| `screenshot-annotation` | sag | None |
| `gif-search` | gifgrep | API key (full) |
| `transcription` | openai-whisper | Install/API |
| `document-rendering` | qmd | Install |

---

## Development

| Capability | Providers | Setup |
|------------|-----------|-------|
| `version-control` | github | OAuth/token |
| `vercel` | (needs skill) | API token |
| `cloudflare` | cloudflare | API token |
| `aws` | (needs skill) | Credentials |
| `gcloud` | (needs skill) | Credentials |
| `coding-agents` | coding-agent guide | Codex + API |
| `mcp-tools` | mcporter | Install |
| `git-sync` | upstream-sync | None |
| `terminal-sessions` | tmux | Install |

---

## Cloud & Sync

| Capability | Providers | Setup |
|------------|-----------|-------|
| `cloud-sync` | nexus-cloud | Account |
| `rollback` | nexus-cloud, github | Account |

---

## Security

| Capability | Providers | Setup |
|------------|-----------|-------|
| `credential-management` | 1password, keychain | App/None |
| `oauth-management` | google-oauth, etc. | OAuth flow |

---

## Commerce

| Capability | Providers | Setup |
|------------|-----------|-------|
| `food-ordering` | ordercli, food-order | Account auth |

---

## Platform Notes

- **(darwin)** = macOS only
- **FDA** = Full Disk Access required
- **LLM API** = Requires an LLM API key configured

---

## Adding Capabilities

Capabilities emerge from skills. To add a new capability:

1. Create a skill that provides it
2. Add `provides: [capability-name]` to the skill frontmatter
3. The capability appears in `nexus capabilities`

The predefined list above is the starting taxonomy. New capabilities can emerge as skills are added.

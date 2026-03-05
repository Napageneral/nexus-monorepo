# TTS / Speech: Extraction to Standalone Package

**Status:** TODO — seed spec, detailed design deferred
**Last Updated:** 2026-03-04

---

## Decision

Speech/TTS is **not** an adapter and **not** a core Nexus subsystem. It is a **credential-backed utility** that transforms text into audio. It should be extracted as its own standalone package/tool (like `aix` or `gogcli`) that can be installed and used independently.

Once extracted, Nexus agents access it via a **skill document** that the Manager Agent can reference when voice output is needed.

---

## Current State (What Exists Today)

### Three Integration Points
1. **Agent tool** (`tts`) — One-shot text-to-audio, returns `MEDIA:` file path
2. **RPC operations** — Control surface for status, enable/disable, convert, provider management
3. **Talk mode** — Continuous voice conversation (listen, transcribe, chat, speak)

### Three Providers (Auto-Fallback)
| Provider | Cost | Key Required | Default Voice |
|----------|------|-------------|---------------|
| Edge TTS | Free | No | `en-US-MichelleNeural` |
| OpenAI TTS | Paid | `OPENAI_API_KEY` | `alloy` |
| ElevenLabs | Paid | `ELEVENLABS_API_KEY` | Configurable |

### Current Operations (8)
```
tts.status        — Current state, provider, API key availability
tts.enable        — Enable auto-TTS
tts.disable       — Disable TTS
tts.convert       — One-shot text-to-speech
tts.setProvider   — Change provider
tts.providers     — List available providers with config status
talk.config       — Get talk mode config
talk.mode         — Enable/disable talk mode
```

### Auto Modes
`off` | `always` | `inbound` (reply with audio if user sent audio) | `tagged` (only when model emits `[[tts]]` directive)

---

## Target Architecture

### Standalone Package
- Extracts to its own npm package / CLI tool
- Provider credentials managed by the package itself (or passed in)
- No Nexus runtime dependency
- Can be used by any Node.js application

### Nexus Integration
- **Skill document** tells MA how to use TTS when voice output is requested
- MA invokes the package's tool interface
- Provider API keys stored as Nexus credentials, passed to the package at invocation
- Talk mode remains a client-side feature (macOS app, mobile clients)

### Operations Removed from Core
All `tts.*` and `talk.*` operations are removed from the Nex operation taxonomy. The standalone package has its own CLI/API surface.

---

## Implementation Notes

### Key Source Files (Current)
- TTS service: `nex/src/nex/tts/` directory
- Agent tool definition: registered as `tts` tool in agent tool registry
- Talk mode: client-side coordination (ElevenLabs streaming, speech recognition)

### Extraction Steps (TODO)
1. Create standalone package with TTS core logic
2. Extract provider implementations (Edge, OpenAI, ElevenLabs)
3. Define clean tool interface (input: text + config, output: audio file path)
4. Write skill document for MA integration
5. Remove `tts.*` and `talk.*` from Nex operation taxonomy
6. Update clients (macOS app, mobile) to use package directly for talk mode

---

## Cross-References
- Batch 6 decision: [API_DESIGN_BATCH_6.md](./API_DESIGN_BATCH_6.md)
- Skills system: [API_DESIGN_BATCH_5.md](./API_DESIGN_BATCH_5.md) (skills.list, skills.use)

# Credentials Specs

**Status:** COMPLETE  
**Conflict Risk:** Medium (upstream has different architecture)

**See also:** `specs/UNIFIED_SYSTEM.md` for how credentials integrate with skills and capabilities.

---

## Documents

| Spec | Status | Description |
|------|--------|-------------|
| `CREDENTIAL_SYSTEM.md` | ✅ Complete | Full Nexus credential architecture |
| `UPSTREAM_CREDENTIALS.md` | ✅ Complete | Upstream clawdbot approach for comparison |

---

## Key Differences from Upstream

| Aspect | Upstream | Nexus |
|--------|----------|-------|
| **Storage** | Raw secrets in JSON | Pointers to secure backends |
| **Structure** | Single `auth-profiles.json` | Service → Account → Credentials[] |
| **Access control** | None | Consumer-centric (Gateway/agent level) |
| **Rotation** | All profiles | Opt-in (LLM APIs only) |

---

## Core Concepts

### Service as Linking Key

Service name (`google`, `anthropic`, `discord`) links:
- Skills (`requires.credentials: [service]`)
- Credentials (`service: "service"`)
- Connectors (`enables: [service]`)

### Consumer-Centric Access

Access control is configured at the **consumer level** (Gateway, agents), not credential level:

```json
{
  "gateway": {
    "credentials": {
      "level": 1,
      "blocked": ["google/*"]
    }
  }
}
```

### Storage Providers

| Provider | Platform | Description |
|----------|----------|-------------|
| `keychain` | macOS | Default, uses `security` command |
| `1password` | All | Requires `op` CLI |
| `env` | All | Reads from environment variable |
| `external` | All | Custom command output |
| `gog` | All | GOG credential integration |

---

*See `CREDENTIAL_SYSTEM.md` for full specification.*

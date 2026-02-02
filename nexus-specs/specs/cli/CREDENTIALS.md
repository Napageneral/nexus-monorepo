# Credential Management Specification

**Status:** SUPERSEDED  
**Source:** `nexus-cli/.intent/specs/03_STATE_ARCHITECTURE.md`

---

> **Note:** This document has been superseded by the comprehensive credential system spec.
> 
> **Authoritative reference:** `specs/credentials/CREDENTIAL_SYSTEM.md`
>
> Key topics covered in the authoritative spec:
> - Unified AccountFile schema with `credentials[]` array
> - Consumer-centric access control (Gateway/agent level)
> - Service name as universal linking key
> - OAuth client config at service level
> - Auto-sync from external CLIs
> - Opt-in rotation for LLM APIs
> - Deep environment variable scanning

---

## Summary (Historical)

The **credential system** provides secure storage and retrieval of secrets with multiple backend support.

**Key Principle:** No plaintext secrets in Nexus files. Credentials link to secure storage (Keychain, 1Password, etc.).

---

## Core Concepts

### Hierarchy

```
Service → Account → Auth Type
   │         │         │
   │         │         └─ api-key, oauth, token
   │         └─ Real identifier (email/username)
   └─ Service name (anthropic, google, github)
```

### Storage Providers

| Provider | Platform | Notes |
|----------|----------|-------|
| `keychain` | macOS | Default. Uses `security` command |
| `1password` | All | Requires `op` CLI |
| `env` | All | Reads from environment variable |
| `external` | All | Custom command that outputs secret |

---

## Sections to Write

### File Structure

```
state/credentials/
├── index.json                              # Fast lookup cache
└── {service}/
    ├── config.json                         # Optional: shared config (OAuth client)
    └── accounts/
        └── {account}/
            └── auth/
                └── {type}.json             # Credential pointer
```

### Index File Schema

```json
{
  "version": 1,
  "lastUpdated": "2026-01-14T10:00:00Z",
  "services": {
    "anthropic": {
      "type": "llm-provider",
      "accounts": [
        { "id": "tyler@anthropic.com", "auths": ["api-key"] }
      ]
    }
  }
}
```

### Credential File Schema

```json
{
  "type": "api-key",
  "service": "anthropic",
  "account": "tyler@anthropic.com",
  "created": "2026-01-12T10:00:00Z",
  "lastVerified": "2026-01-14T10:00:00Z",
  
  "storage": {
    "provider": "keychain",
    "command": "security find-generic-password -s nexus.anthropic -a api_key -w"
  }
}
```

### Storage Provider Examples

**Keychain:**
```json
{
  "storage": {
    "provider": "keychain",
    "command": "security find-generic-password -s nexus.anthropic -a api_key -w"
  }
}
```

**1Password:**
```json
{
  "storage": {
    "provider": "1password",
    "command": "op read \"op://Nexus/Anthropic API Key/api_key\""
  }
}
```

**Environment:**
```json
{
  "storage": {
    "provider": "env",
    "var": "ANTHROPIC_API_KEY"
  }
}
```

### CLI Commands

- `nexus credential list` - Show all configured credentials
- `nexus credential add` - Add new credential (interactive or flags)
- `nexus credential get <service/account>` - Retrieve value
- `nexus credential verify <service>` - Test credentials work
- `nexus credential scan [--deep]` - Detect from environment
- `nexus credential remove <service/account>` - Remove credential

### Verification System

- Each credential can have a `lastVerified` timestamp
- `nexus credential verify` tests the credential works
- Broken credentials get `broken` status

---

## Integration Points

| System | How Credentials Integrate |
|--------|--------------------------|
| Skills | Skills declare `requires: { credentials: [...] }` |
| Capabilities | Capability status depends on credential availability |
| CLI | `nexus status` shows credential summary |

---

## Source Reference

Full content available at:
```
~/nexus/home/projects/nexus/nexus-cli/.intent/specs/03_STATE_ARCHITECTURE.md
```

---

*TODO: Expand with full schema definitions, CLI command details, and verification flows.*

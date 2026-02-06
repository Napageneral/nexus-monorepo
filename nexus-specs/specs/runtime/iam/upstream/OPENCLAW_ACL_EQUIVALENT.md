# OpenClaw (Upstream) ACL Equivalent Behavior

**Status:** REFERENCE  
**Last Updated:** 2026-02-04  
**Source:** OpenClaw codebase (`src/channels/`, `src/routing/`, `src/security/`, `src/config/`)

---

## Overview

OpenClaw does NOT have a unified ACL system. Instead, access control and routing are handled through scattered subsystems:

1. **Routing Bindings** — Match channel/account/peer to agentId
2. **Channel Policies** — Per-channel access rules (`allowFrom`, `dmPolicy`, `groupPolicy`)
3. **Agent Tool Restrictions** — Per-agent tool allowlists/denylists
4. **Command Authorization** — Who can execute slash/text commands
5. **Elevated Execution** — Privileged tool access for trusted senders
6. **Security Audit** — Runtime security checks and findings

This document maps OpenClaw's approach to our ACL design.

---

## Related Documents

| Document | Focus |
|----------|-------|
| **[ALLOWLIST_SYSTEM.md](./ALLOWLIST_SYSTEM.md)** | Allowlist matching algorithm in depth |
| **[SENDER_IDENTITY.md](./SENDER_IDENTITY.md)** | Identity resolution per channel |
| **[ROUTING_RESOLUTION.md](./ROUTING_RESOLUTION.md)** | Route resolution priority chain |
| **[ROUTING_HOOKS.md](./ROUTING_HOOKS.md)** | TypeScript routing hooks |

---

## 1. Routing Bindings

**Location:** `config.json` → `routing.bindings[]`

```json
{
  "routing": {
    "bindings": [
      {
        "agentId": "work",
        "match": {
          "channel": "whatsapp",
          "accountId": "business",
          "peer": { "kind": "dm", "id": "+15551234567" }
        }
      },
      {
        "agentId": "personal",
        "match": {
          "channel": "discord",
          "guildId": "123456789"
        }
      }
    ]
  }
}
```

**Matching Priority:**
1. Peer-specific (`binding.peer`)
2. Guild/Team (`binding.guild`, `binding.team`)
3. Account (`binding.account`)
4. Channel (`binding.channel`)
5. Default agent fallback

**Nexus ACL Equivalent:**

```yaml
# Our ACL policy achieves the same routing
- name: work-whatsapp
  match:
    principal:
      person_id: work-contact  # Resolved from ledger
    conditions:
      - channel: whatsapp
        account: business
  session:
    persona: work
    key: "whatsapp:{principal.name}"
```

---

## 2. Channel Policies

**Location:** `config.json` → `channels.{channel}.*`

### allowFrom

```json
{
  "channels": {
    "discord": {
      "allowFrom": {
        "mode": "allowlist",
        "list": ["123456789", "987654321"]
      }
    }
  }
}
```

**Nexus ACL Equivalent:**

```yaml
# Explicit allowlist = match principal
- name: discord-allowed-users
  match:
    principal:
      person_id_in: [user-123, user-456]  # From ledger
    conditions:
      - channel: discord
  effect: allow
```

### dmPolicy / groupPolicy

```json
{
  "channels": {
    "telegram": {
      "dmPolicy": "auto",      // auto, manual, none
      "groupPolicy": "none"    // Don't respond in groups
    }
  }
}
```

**Nexus ACL Equivalent:**

```yaml
# Block Telegram groups
- name: telegram-no-groups
  match:
    conditions:
      - channel: telegram
        peer_kind: group
  effect: deny
  priority: 90
```

---

## 3. Agent Tool Restrictions

**Location:** `config.json` → `agents.list[].tools`, `tools.*`

### Basic Tool Configuration

```json
{
  "agents": {
    "list": [
      {
        "id": "public",
        "tools": {
          "allowlist": ["web_search", "weather"],
          "denylist": ["shell", "send_email"]
        }
      }
    ]
  }
}
```

### Global Tool Configuration

```json
{
  "tools": {
    "profile": "full",           // "minimal" | "coding" | "messaging" | "full"
    "allow": ["read", "write", "exec"],
    "alsoAllow": ["custom_tool"], // Additive to profile
    "deny": ["dangerous_tool"],
    
    "byProvider": {
      "anthropic/claude-opus-4-5": {
        "allow": ["*"],
        "profile": "full"
      }
    }
  }
}
```

### Tool Profiles

| Profile | Includes |
|---------|----------|
| `minimal` | `web_search`, `read_file` |
| `coding` | minimal + `write_file`, `exec`, `git` |
| `messaging` | minimal + `send_email`, `calendar` |
| `full` | All tools |

### Per-Channel/Group Tool Restrictions

```json
{
  "channels": {
    "telegram": {
      "groups": {
        "-1001234567890": {
          "tools": {
            "deny": ["exec", "shell", "send_email"]
          },
          "skills": ["chat", "web_search"]
        }
      }
    }
  }
}
```

### Tool Resolution Order

```
1. Check agent-specific tools.deny → DENY if matched
2. Check agent-specific tools.allow → ALLOW if matched
3. Check channel/group tools.deny → DENY if matched
4. Check global tools.deny → DENY if matched
5. Check global tools.allow → ALLOW if matched
6. Check profile defaults → ALLOW/DENY based on profile
7. Default → DENY
```

**Nexus ACL Equivalent:**

```yaml
# Tools are part of ACL permissions
- name: public-restricted
  match:
    conditions:
      - channel: discord
        account: public-bot
  permissions:
    tools:
      allow: [web_search, weather]
      deny: [shell, send_email, credentials_*]
```

---

## 4. Command Authorization

**Location:** `src/channels/command-gating.ts`

Controls who can execute slash commands and text commands.

### Command Gating Configuration

```json
{
  "commands": {
    "useAccessGroups": true,
    "textCommands": {
      "enabled": true,
      "prefix": "/",
      "authorizedOnly": true
    }
  },
  "channels": {
    "telegram": {
      "commands": {
        "allowFrom": ["123456789", "@admin"]
      }
    }
  }
}
```

### Authorizer Structure

```typescript
type CommandAuthorizer = {
  configured: boolean;  // Is this authorizer set up?
  allowed: boolean;     // Does sender pass this check?
};
```

### Resolution Logic

```typescript
function resolveCommandAuthorizedFromAuthorizers(params: {
  useAccessGroups: boolean;
  authorizers: CommandAuthorizer[];
  modeWhenAccessGroupsOff?: "allow" | "deny" | "configured";
}): boolean {
  const { useAccessGroups, authorizers } = params;
  const mode = params.modeWhenAccessGroupsOff ?? "allow";
  
  if (!useAccessGroups) {
    if (mode === "allow") return true;
    if (mode === "deny") return false;
    // mode === "configured"
    const anyConfigured = authorizers.some(e => e.configured);
    if (!anyConfigured) return true;
    return authorizers.some(e => e.configured && e.allowed);
  }
  
  // Access groups enabled: require at least one configured + allowed
  return authorizers.some(e => e.configured && e.allowed);
}
```

### Control Command Gate

Control commands (like `/reset`, `/config`) have additional gating:

```typescript
function resolveControlCommandGate(params: {
  useAccessGroups: boolean;
  authorizers: CommandAuthorizer[];
  allowTextCommands: boolean;
  hasControlCommand: boolean;
}): { commandAuthorized: boolean; shouldBlock: boolean } {
  const commandAuthorized = resolveCommandAuthorizedFromAuthorizers({...});
  
  // Block if unauthorized user tries control command
  const shouldBlock = params.allowTextCommands && 
                      params.hasControlCommand && 
                      !commandAuthorized;
  
  return { commandAuthorized, shouldBlock };
}
```

**Nexus ACL Equivalent:**

```yaml
- name: command-authorization
  match:
    principal:
      tags: [admin]
    conditions:
      - channel: telegram
  permissions:
    tools:
      allow: [control_commands, exec]
```

---

## 5. Elevated Execution

**Location:** `config.json` → `tools.elevated`

Elevated execution allows trusted senders to run privileged tools (shell, exec).

### Configuration

```json
{
  "tools": {
    "elevated": {
      "enabled": true,
      "allowFrom": {
        "telegram": ["123456789"],
        "discord": ["user-id-abc"],
        "whatsapp": ["+14155551234"]
      }
    },
    "exec": {
      "host": "sandbox",            // "sandbox" | "gateway" | "node"
      "security": "allowlist",      // "deny" | "allowlist" | "full"
      "ask": "on-miss",             // "off" | "on-miss" | "always"
      "backgroundMs": 30000,
      "timeoutSec": 300
    }
  }
}
```

### Elevated Access Resolution

```typescript
function isElevatedSender(params: {
  channel: string;
  senderId: string;
  elevatedConfig: ElevatedConfig;
}): boolean {
  if (!elevatedConfig.enabled) return false;
  
  const allowList = elevatedConfig.allowFrom[params.channel] ?? [];
  
  // Wildcard check
  if (allowList.includes("*")) return true;
  
  // Direct match
  return allowList.some(entry => 
    matchesAllowlistEntry(params.senderId, entry)
  );
}
```

### Exec Security Modes

| Mode | Behavior |
|------|----------|
| `deny` | Block all exec |
| `allowlist` | Only allowed commands |
| `full` | Any command (dangerous) |

### Ask Modes

| Mode | Behavior |
|------|----------|
| `off` | Execute without confirmation |
| `on-miss` | Ask if command not in allowlist |
| `always` | Always ask for confirmation |

**Nexus ACL Equivalent:**

```yaml
- name: owner-elevated-access
  match:
    principal:
      is_user: true
  permissions:
    tools:
      allow: ["*"]
    credentials: ["*"]
    data: full

- name: trusted-elevated-access
  match:
    principal:
      tags: [elevated]
    conditions:
      - channel: telegram
  permissions:
    tools:
      allow: [exec, shell, write_file]
      deny: [credentials_*]
```

---

## 4. Session Keys

**Source:** `src/routing/session-key.ts`, `src/routing/resolve-route.ts`

OpenClaw session key format:
```
agent:{agentId}:{context}
```

Examples:
- `agent:main:main` — Default DM session
- `agent:main:discord:group:123` — Discord group session
- `agent:work:whatsapp:dm:+15551234567` — Work WhatsApp DM

**Key behavior:**
- DMs collapse to main by default (`dmScope: "main"`)
- Groups always isolated per provider + group ID
- Can configure custom scopes

**Nexus ACL Equivalent:**

```yaml
# Session key templating
session:
  persona: atlas
  key: main                           # DM collapse

session:
  persona: atlas  
  key: "{channel}:group:{peer_id}"    # Group isolation
```

---

## 5. Identity Resolution

**OpenClaw approach:** No unified identity system. Sender matched by raw identifiers in bindings.

**Nexus improvement:** Unified `entities` table with identity resolution:
- Query `entity_identities` by `channel:identifier`
- Get `entity_id` with `type`, `relationship`, `is_user`
- ACL policies match on semantic identity, not raw IDs

---

## 6. Persona Handling

**Source:** `src/agents/identity.ts`, `src/agents/workspace.ts`

OpenClaw personas defined in:
- `config.json` → `agents.list[].identity` (name, emoji, avatar)
- Workspace files: `SOUL.md`, `IDENTITY.md`

**Key insight:** One agent = one persona (no multi-persona per agent).

**Nexus approach:**
- Personas tracked in `entities` table with `type: 'persona'`
- Persona workspace files remain in `~/nexus/state/agents/{id}/`
- ACL routes TO personas based on policies

---

## 7. Permission Grants

**OpenClaw:** No equivalent. Permissions are static per agent/channel.

**Nexus addition:** Dynamic grants with approval workflow:
- Temporary permissions with expiration
- Owner approval flow
- Audit logging

---

## 8. Audit Logging

**OpenClaw:** No comprehensive ACL audit. Some logging in gateway.

**Nexus addition:** Full audit log:
- Every access decision logged
- Principal, policies matched, effect, permissions
- Queryable via CLI

---

## 9. Security Audit System

**Location:** `src/security/audit.ts`, `src/security/fix.ts`

OpenClaw has a security auditing system that checks for common misconfigurations.

### Severity Levels

| Severity | Meaning | Action |
|----------|---------|--------|
| `critical` | Immediate action required | Must fix before running |
| `warn` | Should be addressed | Can proceed with caution |
| `info` | Informational finding | Optional improvement |

### Audit Finding Structure

```typescript
type SecurityAuditFinding = {
  checkId: string;        // "channels.telegram.dm.open"
  severity: "critical" | "warn" | "info";
  title: string;          // "Telegram DMs are open"
  detail: string;         // Explanation of the risk
  remediation?: string;   // How to fix
};
```

### Key Security Audit Checks

| Check ID | Severity | Condition | Risk |
|----------|----------|-----------|------|
| `gateway.bind_no_auth` | critical | Non-loopback bind without auth | Exposed control API |
| `gateway.tailscale_funnel` | critical | Public funnel exposure | Internet-accessible |
| `gateway.loopback_no_auth` | critical | Control UI on 0.0.0.0 | Unauthorized access |
| `channels.*.dm.open` | critical | DM policy is "open" | Anyone can message |
| `channels.*.group.open` | warn | Group policy is "open" | Spam risk |
| `tools.elevated.allowFrom.*.wildcard` | critical | Elevated exec allows "*" | Shell access to all |
| `tools.exec.security.full` | warn | Exec in "full" mode | Unrestricted commands |
| `fs.state_dir.perms_world_writable` | critical | State dir is 777 | Data tampering |
| `fs.config.perms_writable` | critical | Config writable by others | Config injection |
| `logging.redact_off` | warn | Sensitive data not redacted | Log exposure |
| `credentials.exposed` | critical | Plaintext credentials in config | Secret leakage |

### Audit Implementation

```typescript
function runSecurityAudit(config: Config): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];
  
  // Check gateway binding
  if (config.gateway?.bind && !isLoopback(config.gateway.bind)) {
    if (!config.gateway.auth?.enabled) {
      findings.push({
        checkId: "gateway.bind_no_auth",
        severity: "critical",
        title: "Gateway exposed without authentication",
        detail: `Gateway bound to ${config.gateway.bind} without auth`,
        remediation: "Enable gateway.auth or bind to 127.0.0.1"
      });
    }
  }
  
  // Check DM policies
  for (const [channel, cfg] of Object.entries(config.channels ?? {})) {
    if (cfg.dmPolicy === "open" || cfg.allowFrom?.includes("*")) {
      findings.push({
        checkId: `channels.${channel}.dm.open`,
        severity: "critical",
        title: `${channel} DMs are open to everyone`,
        detail: "Any sender can message your bot",
        remediation: `Set dmPolicy to "pairing" or "allowlist"`
      });
    }
  }
  
  // Check elevated access
  const elevated = config.tools?.elevated;
  if (elevated?.enabled) {
    for (const [channel, list] of Object.entries(elevated.allowFrom ?? {})) {
      if (list.includes("*")) {
        findings.push({
          checkId: `tools.elevated.allowFrom.${channel}.wildcard`,
          severity: "critical",
          title: `Elevated access open on ${channel}`,
          detail: "Anyone can run shell commands",
          remediation: "Remove '*' from elevated.allowFrom"
        });
      }
    }
  }
  
  return findings;
}
```

### Automated Security Fixes

```typescript
type SecurityFix = {
  issue: string;
  fix: () => void;
};

const AUTO_FIXES: SecurityFix[] = [
  {
    issue: "logging.redactSensitive=off",
    fix: () => setConfig("logging.redactSensitive", "tools")
  },
  {
    issue: "groupPolicy=open",
    fix: () => setConfig("channels.*.groupPolicy", "allowlist")
  },
  {
    issue: "state_dir.perms_world_writable",
    fix: () => chmod(stateDir, 0o700)
  },
  {
    issue: "config.perms_writable",
    fix: () => chmod(configPath, 0o600)
  }
];
```

### External Content Security

**Location:** `src/security/external-content.ts`

Handles untrusted content from emails, webhooks, web fetches.

#### Suspicious Pattern Detection

```typescript
const SUSPICIOUS_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /forget\s+(everything|all|your)\s+(instructions?|rules?|guidelines?)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /new\s+instructions?:/i,
  /system\s*:?\s*(prompt|override|command)/i,
  /elevated\s*=\s*true/i,
  /rm\s+-rf/i,
  /delete\s+all\s+(emails?|files?|data)/i,
];
```

#### Content Wrapping

```typescript
function wrapExternalContent(content: string, options: {
  source: "email" | "webhook" | "api" | "web_search" | "web_fetch" | "unknown";
  sender?: string;
  subject?: string;
  includeWarning?: boolean;
}): string {
  // Sanitize marker injection attempts
  const sanitized = replaceMarkers(content);
  
  // Add security warning header
  const warningBlock = includeWarning ? EXTERNAL_CONTENT_WARNING : "";
  
  return [
    warningBlock,
    "<<<EXTERNAL_UNTRUSTED_CONTENT>>>",
    `Source: ${sourceLabel}`,
    sender ? `From: ${sender}` : "",
    subject ? `Subject: ${subject}` : "",
    "---",
    sanitized,
    "<<<END_EXTERNAL_UNTRUSTED_CONTENT>>>",
  ].join("\n");
}
```

**Nexus ACL Equivalent:**

Nexus should include built-in audit capabilities:

```bash
# Run security audit
nexus acl audit --security

# Show critical findings
nexus acl audit --security --severity critical

# Auto-fix safe issues
nexus acl audit --security --fix
```

---

## 10. Per-Agent Permissions

**Location:** `config.json` → `agents.list[]`

Each agent can have distinct permission sets.

### Agent Permission Configuration

```json
{
  "agents": {
    "list": [
      {
        "id": "main",
        "default": true,
        "tools": {
          "allow": ["*"],
          "deny": []
        },
        "skills": ["*"],
        "memorySearch": { "enabled": true }
      },
      {
        "id": "public",
        "tools": {
          "allow": ["web_search", "weather", "calculator"],
          "deny": ["shell", "exec", "send_email", "read_file", "write_file"]
        },
        "skills": ["chat", "web"],
        "memorySearch": { "enabled": false }
      },
      {
        "id": "work",
        "tools": {
          "allow": ["web_search", "github", "jira", "read_file", "write_file"],
          "deny": ["send_email"]  // Use work email via integration
        },
        "skills": ["coding", "git", "jira"]
      }
    ]
  }
}
```

### Per-Agent Credential Access

```json
{
  "agents": {
    "list": [
      {
        "id": "work",
        "credentials": ["github", "jira", "slack"],
        "sandbox": {
          "mode": "non-main",
          "workspaceAccess": "rw"
        }
      },
      {
        "id": "public",
        "credentials": [],  // No credential access
        "sandbox": {
          "mode": "always",
          "workspaceAccess": "none"
        }
      }
    ]
  }
}
```

### Sub-Agent Permissions

```json
{
  "agents": {
    "defaults": {
      "subagents": {
        "maxConcurrent": 3,
        "archiveAfterMinutes": 60
      }
    },
    "list": [
      {
        "id": "main",
        "subagents": {
          "tools": {
            "allow": ["read_file", "write_file", "web_search"],
            "deny": ["shell", "exec", "send_email"]
          }
        }
      }
    ]
  }
}
```

### Permission Inheritance

```
Principal triggers message
         │
         ▼
   Resolve agent via bindings
         │
         ▼
   Agent permissions = base from config
         │
         ▼
   Apply channel/group overrides
         │
         ▼
   Sub-agent spawned?
         │
    ┌────┴────┐
    │   YES   │
    │         ▼
    │   Sub-agent permissions = 
    │   intersection(parent, subagent config)
    └─────────┘
```

**Nexus ACL Equivalent:**

```yaml
# Per-persona default policies
- name: persona-public-defaults
  match:
    conditions:
      - account: public-bot
  permissions:
    tools:
      allow: [web_search, weather]
      deny: ["*"]
    credentials: []
    data: none
  session:
    persona: public
    key: "public:{principal.id}"
  priority: 50

# Sub-agent permission constraint
- name: subagent-restrictions
  match:
    principal:
      agent: "*"
  permissions:
    tools:
      deny: [shell, exec, send_email, credentials_*]
  priority: 95  # High priority to enforce
```

---

## Mapping Summary

| OpenClaw | Nexus ACL |
|----------|-----------|
| `routing.bindings[]` | ACL policies with `match.conditions` |
| `channels.*.allowFrom` | ACL policies with `match.principal` |
| `channels.*.dmPolicy` | ACL policies with `effect: allow/deny` |
| `channels.*.groupPolicy` | ACL policies with `peer_kind: group` |
| `agents.*.tools.allowlist/denylist` | ACL `permissions.tools.allow/deny` |
| `commands.allowFrom` | ACL `permissions.tools: [control_commands]` |
| `tools.elevated.allowFrom` | ACL `match.principal.tags: [elevated]` |
| `tools.exec.security` | ACL `permissions.tools` with conditions |
| Session key construction | ACL `session.key` templating |
| No identity resolution | Unified `entities` table lookup |
| No permission grants | Dynamic grants with approval |
| Minimal audit logging | Full audit log |
| Security audit (manual) | Integrated `nexus acl audit --security` |

---

## Key Improvements Over Upstream

1. **Unified identity** — Query semantic identity, not raw identifiers
2. **Declarative policies** — YAML instead of scattered config
3. **Dynamic grants** — Temporary permissions with approval
4. **Audit trail** — Full visibility into access decisions
5. **GUI-friendly** — Easy to display "who has access"

---

## Security Audit Findings Reference

Comprehensive list of security checks from OpenClaw's audit system.

### Critical Findings

| Check ID | Condition | Risk | Remediation |
|----------|-----------|------|-------------|
| `gateway.bind_no_auth` | Gateway bound to non-loopback without auth | Remote API access | Enable auth or bind to 127.0.0.1 |
| `gateway.tailscale_funnel` | Funnel enabled for public access | Internet exposure | Disable funnel or require auth |
| `gateway.loopback_no_auth` | Control UI on 0.0.0.0 without auth | LAN access | Bind to localhost |
| `channels.*.dm.open` | DM policy is "open" or allowFrom: ["*"] | Anyone can message | Use "pairing" or "allowlist" |
| `tools.elevated.allowFrom.*.wildcard` | Elevated allows "*" | Shell access to all | Remove wildcard |
| `fs.state_dir.perms_world_writable` | State directory 777 | Data tampering | chmod 700 |
| `fs.config.perms_writable` | Config writable by others | Config injection | chmod 600 |
| `credentials.plaintext` | Plaintext secrets in config | Secret exposure | Use env vars or vault |

### Warning Findings

| Check ID | Condition | Risk | Remediation |
|----------|-----------|------|-------------|
| `channels.*.group.open` | Group policy is "open" | Spam, noise | Use "allowlist" |
| `tools.exec.security.full` | Exec mode is "full" | Unrestricted commands | Use "allowlist" |
| `logging.redact_off` | Sensitive data not redacted | Log exposure | Set redactSensitive: "tools" |
| `session.identityLinks.missing` | No identity links configured | Fragmented sessions | Add identity links |
| `agents.*.sandbox.disabled` | Sandbox disabled for agent | Unsafe execution | Enable sandbox |

### Info Findings

| Check ID | Condition | Suggestion |
|----------|-----------|------------|
| `agents.single` | Only one agent configured | Consider persona separation |
| `channels.*.requireMention.off` | Groups don't require @mention | Enable for busy groups |
| `heartbeat.disabled` | Heartbeat not configured | Enable for proactive checks |

---

## Nexus IAM Architecture Advantages

### 1. Unified Policy Layer

Instead of scattered config sections, Nexus uses a single policy format:

```yaml
# One policy replaces multiple OpenClaw configs
- name: work-context
  match:
    principal:
      relationship: coworker
    conditions:
      - channel: slack
        team: company-workspace
  effect: allow
  permissions:
    tools:
      allow: [web_search, github, jira, read_file]
      deny: [shell, send_email]
    credentials: [github, jira]
  session:
    persona: work
    key: work
  priority: 85
```

### 2. Identity-First Matching

OpenClaw matches raw IDs. Nexus matches semantic identity:

```yaml
# OpenClaw: Match by Telegram ID
"allowFrom": ["123456789"]

# Nexus: Match by relationship
match:
  principal:
    relationship: partner
```

### 3. Composable Permissions

Multiple policies merge predictably:

```
Policy A: allow: [web_search, weather]
Policy B: allow: [calendar_read], deny: [shell]
───────────────────────────────────────────
Result:   allow: [web_search, weather, calendar_read]
          deny: [shell]
```

### 4. Dynamic Grants

Runtime permission escalation with approval:

```yaml
# Grant created after owner approval
id: grant_abc123
principal_query:
  person_id: casey
resources: [calendar_read]
expires_at: 1706832000000  # 24 hours
granted_by: owner
reason: "Casey asked for calendar access"
```

### 5. Full Audit Trail

Every access decision logged:

```sql
acl_audit_log (
  timestamp INTEGER,
  event_id TEXT,
  principal_id TEXT,
  principal_name TEXT,
  channel TEXT,
  effect TEXT,           -- allow/deny
  policies_matched TEXT, -- JSON array
  permissions_result TEXT,
  session_assigned TEXT,
  grants_applied TEXT,
  processing_ms INTEGER
)
```

---

## Migration Path

### Step 1: Extract Allowlists

```bash
# OpenClaw
grep -r "allowFrom" config.json

# Convert to Nexus entities
nexus entity add --name "Casey" --relationship partner \
  --identity telegram:123456789 \
  --identity whatsapp:+14155551234
```

### Step 2: Convert Bindings to Policies

```yaml
# From OpenClaw binding:
# { "agentId": "work", "match": { "channel": "slack", "teamId": "T123" } }

# To Nexus policy:
- name: work-slack-routing
  match:
    conditions:
      - channel: slack
        team: T123
  session:
    persona: work
    key: work
```

### Step 3: Consolidate Tool Restrictions

```yaml
# From scattered configs to unified policy
- name: public-bot-restrictions
  match:
    conditions:
      - account: public-bot
  permissions:
    tools:
      allow: [web_search, weather]
      deny: ["*"]
```

### Step 4: Enable Audit Logging

```bash
nexus config set acl.audit.enabled true
nexus config set acl.audit.retention 30d
```

---

*This document maps OpenClaw's access control to our ACL design for reference.*

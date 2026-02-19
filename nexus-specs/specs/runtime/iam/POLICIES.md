# ACL Policies

**Status:** DESIGN SPEC  
**Last Updated:** 2026-01-29  
**Related:** ACCESS_CONTROL_SYSTEM.md

---

## Overview

Policies are declarative rules that match principals and conditions, then assign effects, permissions, and sessions. This document defines the policy schema and provides comprehensive examples.

---

## Policy Schema

```yaml
- name: string                    # Unique identifier (kebab-case)
  description: string             # Human-readable description
  
  match:
    principal:                    # WHO — identity matching
      is_user: boolean            # The owner
      relationship: string        # family, partner, friend, work
      tags: [string]              # Custom tags from ledger
      person_id: string           # Specific person
      unknown: boolean            # Not in contacts
      system: boolean             # Timer, cron, internal
      webhook: string             # Webhook source name
      agent: string               # Agent ID
    
    conditions:                   # Context conditions (array, any match)
      - platform: string           # imessage, discord, slack, etc.
        container_kind: string    # dm, group
        account: string           # Multi-account identifier
        guild: string             # Discord guild ID
        time: string              # Time range "HH:MM-HH:MM"
        hook_id: string           # Specific hook (for system events)
  
  effect: allow | deny            # The decision
  
  permissions:                    # What they can do (if allow)
    tools:
      allow: [string] | "*"       # Whitelist or all
      deny: [string]              # Blacklist (overrides allow)
    credentials: [string] | "*"   # Credential access
    data: full | restricted | none
  
  session:                        # Where messages route (if allow)
    persona: string               # Target persona
    key: string                   # Session key (supports templates)
  
  modifiers:                      # Optional behavior modifiers
    queue_mode: string            # steer, followup, collect
    delay_response: boolean       # Delay until quiet hours end
  
  priority: integer               # 0-100, higher evaluated first
```

---

## Template Variables

Session keys support templating:

| Variable | Description | Example |
|----------|-------------|---------|
| `{principal.name}` | Person's name from ledger | `casey` |
| `{principal.id}` | Person's ID | `person_abc123` |
| `{principal.relationship}` | Relationship | `partner` |
| `{platform}` | Event platform | `discord` |
| `{container_id}` | Group/container ID | `123456789` |
| `{account}` | Account identifier | `work-slack` |
| `{guild}` | Discord guild | `987654321` |

**Example:** `"family:{principal.name}"` → `"family:casey"`

---

## Evaluation Algorithm

```
1. RESOLVE PRINCIPAL
   Query ledger for sender identity
   Build principal context object

2. COLLECT MATCHING POLICIES
   For each policy:
     a. Check principal match (all specified fields must match)
     b. Check condition match (any condition in array can match)
     c. If both match → add to candidates

3. SORT BY PRIORITY
   Sort candidates by priority descending

4. EVALUATE EFFECTS
   For each candidate (highest priority first):
     - If effect = deny → DENY (short-circuit, done)
   
   If any candidates have effect = allow → ALLOW
   If no candidates → DENY (default deny)

5. MERGE PERMISSIONS (if allow)
   tools.allow = union of all allow lists
   tools.deny = union of all deny lists
   credentials = intersection (most restrictive)
   data = minimum level

6. SELECT SESSION
   Use highest-priority allowing policy's session

7. APPLY MODIFIERS
   Collect all modifiers from matching policies

8. LOG DECISION
   Write to audit log
```

---

## Core Policies

These are the essential policies most users will have:

### Owner Full Access

```yaml
- name: owner-full-access
  description: Owner gets unrestricted access everywhere
  
  match:
    principal:
      is_user: true
  
  effect: allow
  
  permissions:
    tools: "*"
    credentials: "*"
    data: full
  
  session:
    persona: atlas
    key: main
  
  priority: 100
```

### Block Unknown Senders

```yaml
- name: block-unknown
  description: Reject messages from unknown senders
  
  match:
    principal:
      unknown: true
  
  effect: deny
  
  priority: 10
```

### Group Chat Restrictions

```yaml
- name: group-chat-restrictions
  description: Everyone gets restricted in group chats
  
  match:
    conditions:
      - container_kind: group
  
  effect: allow
  
  permissions:
    tools:
      allow: [web_search, weather, read_file]
      deny: [shell, send_email, read_messages, credentials_*]
    credentials: []
    data: none
  
  session:
    persona: atlas
    key: "{platform}:group:{container_id}"
  
  priority: 90
```

---

## Relationship-Based Policies

### Partner Access

```yaml
- name: partner-access
  description: Partner gets trusted but scoped access
  
  match:
    principal:
      relationship: partner
  
  effect: allow
  
  permissions:
    tools:
      allow: [web_search, weather, calendar_read, read_file, smart_home]
      deny: [shell, send_email, read_messages, credentials_*]
    credentials: []
    data: restricted
  
  session:
    persona: atlas
    key: "partner:{principal.name}"
  
  priority: 80
```

### Family Access

```yaml
- name: family-access
  description: Family members get limited access
  
  match:
    principal:
      relationship: family
  
  effect: allow
  
  permissions:
    tools:
      allow: [web_search, weather]
      deny: ["*"]
    credentials: []
    data: none
  
  session:
    persona: atlas
    key: "family:{principal.name}"
  
  priority: 70
```

### Friends Access

```yaml
- name: friends-access
  description: Friends get basic access
  
  match:
    principal:
      relationship: friend
  
  effect: allow
  
  permissions:
    tools:
      allow: [web_search, weather]
    credentials: []
    data: none
  
  session:
    persona: atlas
    key: "friend:{principal.name}"
  
  priority: 60
```

---

## Context-Based Policies

### Work Context

```yaml
- name: work-context
  description: Work channels get work-scoped access
  
  match:
    conditions:
      - platform: slack
        account: company-workspace
      - platform: discord
        guild: "987654321"
  
  effect: allow
  
  permissions:
    tools:
      allow: [web_search, github, jira, read_file, write_file]
    credentials: [github, jira, slack]
    data: work
  
  session:
    persona: atlas
    key: work
  
  priority: 85
```

### Quiet Hours

```yaml
- name: quiet-hours
  description: Non-urgent messages queued during quiet hours
  
  match:
    principal:
      is_user: false
    conditions:
      - time: "23:00-08:00"
  
  effect: allow
  
  modifiers:
    queue_mode: collect
    delay_response: true
  
  priority: 95
```

### Weekend Mode

```yaml
- name: weekend-work-filter
  description: Filter work messages on weekends
  
  match:
    conditions:
      - platform: slack
        time: weekends
  
  effect: allow
  
  modifiers:
    queue_mode: collect
  
  priority: 75
```

---

## System Policies

### Timer Events

```yaml
- name: system-timer-events
  description: Timer ticks for scheduled hooks
  
  match:
    principal:
      system: true
    conditions:
      - event_type: timer
  
  effect: allow
  
  permissions:
    tools: "*"
    credentials: "*"
    data: full
  
  priority: 50
```

### Trusted Hook Policy

```yaml
- name: trusted-backup-hook
  description: Backup hook gets scoped file access
  
  match:
    principal:
      system: true
    conditions:
      - hook_id: daily-backup
  
  effect: allow
  
  permissions:
    tools:
      allow: [read_file, write_file]
    credentials: [google-drive]
    data: full
  
  priority: 55
```

### Untrusted Hook Policy

```yaml
- name: untrusted-web-hook
  description: Web scraper hook gets minimal access
  
  match:
    principal:
      system: true
    conditions:
      - hook_id: web-scraper
  
  effect: allow
  
  permissions:
    tools:
      allow: [web_search]
      deny: ["*"]
    credentials: []
    data: none
  
  priority: 55
```

---

## Webhook Policies

### Stripe Webhooks

```yaml
- name: stripe-webhooks
  description: Stripe notifications
  
  match:
    principal:
      webhook: stripe
  
  effect: allow
  
  permissions:
    tools:
      allow: [notify]
    credentials: []
    data: none
  
  session:
    persona: atlas
    key: "webhook:stripe"
  
  priority: 60
```

### GitHub Webhooks

```yaml
- name: github-webhooks
  description: GitHub PR/issue notifications
  
  match:
    principal:
      webhook: github
  
  effect: allow
  
  permissions:
    tools:
      allow: [notify, github]
    credentials: [github]
    data: none
  
  session:
    persona: atlas
    key: "webhook:github"
  
  priority: 60
```

---

## Agent Policies

### Agent-to-Agent Communication

```yaml
- name: agent-to-agent
  description: Agents can communicate with inherited permissions
  
  match:
    principal:
      agent: "*"
  
  effect: allow
  
  # Permissions inherited from triggering context
  # This policy just allows the communication
  
  priority: 40
```

---

## Specific Person Overrides

### Block Specific Person

```yaml
- name: block-ex
  description: Block specific person
  
  match:
    principal:
      person_id: "person_xyz"
  
  effect: deny
  
  priority: 99
```

### Elevated Access for Specific Person

```yaml
- name: trusted-assistant
  description: Trusted assistant gets elevated access
  
  match:
    principal:
      person_id: "person_assistant"
  
  effect: allow
  
  permissions:
    tools:
      allow: [web_search, calendar_read, calendar_write, send_email]
    credentials: [google]
    data: restricted
  
  session:
    persona: atlas
    key: "assistant"
  
  priority: 75
```

---

## Persona-Specific Policies

### Persona's Own Accounts

```yaml
- name: atlas-discord-owner-access
  description: Owner messaging Atlas's Discord account
  
  match:
    principal:
      is_user: true
    conditions:
      - platform: discord
        account: atlas-bot
  
  effect: allow
  
  permissions:
    tools: "*"
    credentials: "*"
    data: full
  
  session:
    persona: atlas
    key: main
  
  priority: 100
```

### Public Persona Access

```yaml
- name: atlas-public-access
  description: Anyone can message Atlas's public account
  
  match:
    conditions:
      - platform: discord
        account: atlas-public-bot
  
  effect: allow
  
  permissions:
    tools:
      allow: [web_search]
    credentials: []
    data: none
  
  session:
    persona: atlas
    key: "public:{principal.id}"
  
  priority: 20
```

---

## Policy Precedence Examples

### Example 1: Casey in a Group Chat

**Event:** Casey sends message in Discord group

**Matching policies:**
- `partner-access` (priority 80) — Casey is partner
- `group-chat-restrictions` (priority 90) — It's a group

**Resolution:**
- Priority 90 > 80
- Session: `discord:group:{container_id}` (from group policy)
- Permissions: group restrictions (more restrictive)

### Example 2: Mom in Work Slack

**Event:** Mom (external) sends in work Slack

**Matching policies:**
- `family-access` (priority 70) — Mom is family
- `work-context` (priority 85) — Work channel

**Resolution:**
- Priority 85 > 70
- Session: `work` (from work policy)
- Permissions: merge — family restrictions apply (more restrictive)

### Example 3: Unknown Sender

**Event:** Random email sender

**Matching policies:**
- `block-unknown` (priority 10) — effect: deny

**Resolution:**
- DENY — message rejected

---

## Storage Options

### Option A: YAML Files

```
~/nexus/state/acl/
├── policies.yaml      # All policies in one file
└── policies/          # Or split into files
    ├── core.yaml
    ├── relationships.yaml
    ├── context.yaml
    └── webhooks.yaml
```

### Option B: Database

```sql
CREATE TABLE policies (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  match_json TEXT NOT NULL,
  effect TEXT NOT NULL,
  permissions_json TEXT,
  session_json TEXT,
  modifiers_json TEXT,
  priority INTEGER NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER,
  updated_at INTEGER
);
```

### Recommendation

**Both:** YAML for human editing, synced to DB for fast evaluation.

---

## CLI Commands

```bash
# List policies
nexus acl policies list
nexus acl policies list --priority

# View policy
nexus acl policies show partner-access

# Add/update policy (from YAML)
nexus acl policies apply ./my-policy.yaml

# Enable/disable
nexus acl policies enable partner-access
nexus acl policies disable partner-access

# Test evaluation
nexus acl test --principal casey --platform discord --container-kind dm

# Validate policies
nexus acl policies validate
```

---

## Best Practices

1. **Start with defaults** — Use core policies, customize as needed

2. **Higher priority for restrictions** — Group chat, quiet hours should override personal

3. **Explicit deny sparingly** — Use for blocking specific people/sources

4. **Test before deploying** — Use `nexus acl test` to verify behavior

5. **Keep policies focused** — One purpose per policy, easier to understand

6. **Document with descriptions** — Future you will thank you

---

*This document defines the ACL policy schema and examples. See ACCESS_CONTROL_SYSTEM.md for the unified overview.*

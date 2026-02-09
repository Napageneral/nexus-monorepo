# Access Control System Specs

**Status:** DESIGN SPEC  
**Last Updated:** 2026-01-29

---

## Overview

The Access Control Layer (ACL) is a declarative system that determines WHO can interact with your agents, WHAT they can do, and WHERE their messages route.

**Key insight:** ACL is separate from hooks. Hooks are programmatic (TypeScript scripts that analyze content). ACL is declarative (YAML policies that match identity and context). ACL runs FIRST — if denied, no hooks run.

---

## Documents

| Document | Description |
|----------|-------------|
| **[ACCESS_CONTROL_SYSTEM.md](./ACCESS_CONTROL_SYSTEM.md)** | Unified overview — start here |
| **[POLICIES.md](./POLICIES.md)** | Policy schema, examples, evaluation algorithm |
| **[GRANTS.md](./GRANTS.md)** | Dynamic permissions and approval workflows |
| **[AUDIT.md](./AUDIT.md)** | Audit logging and queries |

---

## Quick Reference

### The Three Layers

| Layer | Question | Mechanism | When |
|-------|----------|-----------|------|
| **ACL** | WHO? What permissions? | Declarative policies | First |
| **Hooks** | WHAT patterns? | TypeScript scripts | If allowed |
| **Broker** | HOW to execute? | Agent invocation | After hooks |

### Principals (WHO)

| Type | Example | Default Treatment |
|------|---------|-------------------|
| Owner | Tyler | Full access |
| Known (by relationship) | Partner, Family | Per-relationship policies |
| Unknown | Random sender | Block or minimal |
| System | Timer, cron | Scoped per-hook |
| Webhook | Stripe, GitHub | Scoped per-source |
| Agent | Worker agents | Inherit from parent |

### Resources (WHAT)

| Category | Examples |
|----------|----------|
| Tools | `web_search`, `shell`, `send_email` |
| Credentials | `google`, `github`, `stripe` |
| Data | `full`, `restricted`, `none` |

### Conditions (CONTEXT)

| Condition | Examples |
|-----------|----------|
| Channel | `imessage`, `discord`, `slack` |
| Peer kind | `dm`, `group` |
| Account | `work-slack`, `personal-discord` |
| Time | `23:00-08:00`, `weekends` |

---

## Example Policy

```yaml
- name: partner-access
  description: Partner gets trusted but scoped access
  
  match:
    principal:
      relationship: partner
  
  effect: allow
  
  permissions:
    tools:
      allow: [web_search, weather, calendar_read, smart_home]
      deny: [shell, send_email, read_messages]
    credentials: []
    data: restricted
  
  session:
    persona: atlas
    key: "partner:{principal.name}"
  
  priority: 80
```

---

## CLI Quick Reference

```bash
# Policies
nexus acl policies list
nexus acl policies show <name>
nexus acl policies apply ./policy.yaml
nexus acl policies validate

# Grants
nexus acl grants list
nexus acl grants create --principal <id> --resources <tools>
nexus acl grants revoke <id>

# Requests
nexus acl requests list --pending
nexus acl requests approve <id>
nexus acl requests deny <id>

# Audit
nexus acl audit list --denied
nexus acl audit list --principal <id>
nexus acl audit stats
```

---

## Relationship to Other Specs

| Spec | Relationship |
|------|--------------|
| **../broker/OVERVIEW.md** | ACL dispatches to Broker with permissions |
| **../nex/EVENT_SYSTEM_DESIGN.md** | Events flow through ACL before hooks |
| **../nex/automations/AUTOMATION_SYSTEM.md** | Automations run after ACL allows |
| **../../README.md** | ACL is a core component |

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| ACL vs Hooks | Separate layers | Clarity, efficiency, GUI-friendly |
| Policy format | YAML (synced to DB) | Human-editable, fast evaluation |
| Deny behavior | Explicit deny wins | Security-first |
| Session assignment | Highest priority wins | Clear precedence |
| Permission merge | Allow union, deny union | Most restrictive wins |
| Grants | Separate from policies | Dynamic vs static |
| Audit logging | Every decision | Full visibility |

---

## Open Questions

1. **Policy editing in GUI** — Design needed for visual policy management

2. **Persona accounts** — How persona-owned accounts integrate with identity resolution

3. **Default policies** — Ship with sensible defaults? Let user define all?

4. **Agent-created hooks** — Should agents be able to create hooks? With what policy?

---

*Start with ACCESS_CONTROL_SYSTEM.md for the full overview.*

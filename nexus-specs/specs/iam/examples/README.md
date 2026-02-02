# ACL Policy Examples

Reference examples for ACL policies. These demonstrate the patterns covered in `POLICIES.md`.

---

## Files

| File | Description |
|------|-------------|
| **core-policies.yaml** | Essential policies: owner access, block unknown, group restrictions |
| **relationship-policies.yaml** | Relationship-based: partner, family, work, friends |
| **context-policies.yaml** | Context-based: work channels, quiet hours, weekends |
| **system-policies.yaml** | System events: timers, hooks, webhooks |

---

## How Policies Work With Hooks

```
Event arrives
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ACL EVALUATION                                │
│                                                                  │
│  1. Resolve principal (query entities table)                    │
│  2. Match policies (principal + conditions)                     │
│  3. Check for denies (any deny → reject)                        │
│  4. Merge permissions from allows                               │
│  5. Assign session from highest priority                        │
│                                                                  │
│  Output: { principal, permissions, session } or DENY            │
└─────────────────────────────────────────────────────────────────┘
     │
     │ (if allowed)
     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    HOOK TRIGGER MATCHING                         │
│                                                                  │
│  Each hook has declarative TRIGGERS:                            │
│                                                                  │
│    triggers: {                                                  │
│      principal: { name: 'Mom' },                                │
│      event: { channels: ['imessage'] }                          │
│    }                                                            │
│                                                                  │
│  Hook system checks triggers against ACL-resolved context.      │
│  Only hooks with matching triggers have their handler invoked.  │
│                                                                  │
│  This means:                                                    │
│    - mom-2fa-helper only runs for Mom                           │
│    - stripe-webhook only runs for Stripe events                 │
│    - heartbeat only runs for system timer ticks                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
     │
     │ (for each matching hook)
     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    HOOK HANDLER EXECUTION                        │
│                                                                  │
│  Handler receives pre-resolved context:                         │
│    ctx.principal   — Who sent this (from ACL)                   │
│    ctx.permissions — What they can do (from ACL)                │
│    ctx.session     — Where it routes (from ACL)                 │
│                                                                  │
│  Handler focuses on WHAT content and HOW to respond:            │
│    - LLM classification (is this a 2FA request?)                │
│    - Database queries (has this been handled?)                  │
│    - Context enrichment (extract service name)                  │
│                                                                  │
│  Output: { fire: boolean, agent?, context? }                    │
└─────────────────────────────────────────────────────────────────┘
     │
     ▼
   Broker
```

**Key insight:** Hooks don't re-check WHO. The ACL resolved identity, and the hook system filters by triggers. Handlers only do content analysis.

---

## Example Walkthrough

### Scenario: Mom sends "What's the Amazon code?"

**Step 1: ACL evaluates**

```yaml
# Match: family-access policy
- name: family-access
  match:
    principal:
      relationship: family
  permissions:
    tools: [web_search, weather]
  session:
    persona: atlas
    key: "family:mom"
```

**Result:** ALLOW with restricted permissions, session `family:mom`

**Step 2: Hook system checks triggers**

The mom-2fa-helper hook has these triggers:

```typescript
// mom-2fa-helper.ts
triggers: {
  principal: { name: 'Mom' },
  event: { channels: ['imessage', 'sms'], direction: 'received' }
}
```

Hook system checks:
- `ctx.principal.name === 'Mom'` → ✓
- `ctx.event.channel in ['imessage', 'sms']` → ✓
- `ctx.event.direction === 'received'` → ✓

**Result:** Triggers match! Handler will be invoked.

(Other hooks like `casey-safety-check` have `principal: { type: 'system' }` triggers, so they DON'T match and their handlers aren't invoked.)

**Step 3: Handler receives context**

```typescript
// mom-2fa-helper handler receives:
ctx = {
  event: { content: "What's the Amazon code?", ... },
  principal: { name: "Mom", relationship: "family" },  // From ACL
  permissions: { tools: ["web_search", "weather"], ... },  // From ACL
  session: { persona: "atlas", key: "family:mom" },  // From ACL
  // ... plus dbPath, search, llm, etc.
}
```

**Step 4: Handler evaluates content**

```typescript
// Handler ONLY checks content (identity already verified by triggers)
const is2FA = await llm("Is this a 2FA request?...");
if (is2FA) {
  return {
    fire: true,
    agent: 'browser-agent',
    context: {
      extracted: { service: "Amazon" },
      prompt: `${principal.name} needs the Amazon 2FA code...`
    }
  };
}
```

**Step 5: Dispatch to broker**

Broker receives:
- Event content
- Session: `atlas:family:mom`
- Permissions: `[web_search, weather]` ← Agent is restricted!
- Agent: `browser-agent`
- Context: `{ extracted: { service: "Amazon" }, prompt: "..." }`

---

## Common Patterns

### Pattern: Restrict by Relationship

```yaml
- name: family-access
  match:
    principal:
      relationship: family
  permissions:
    tools:
      allow: [web_search, weather]
      deny: ["*"]
```

### Pattern: Restrict by Context

```yaml
- name: group-restrictions
  match:
    conditions:
      - peer_kind: group
  permissions:
    tools:
      deny: [send_email, read_messages]
```

### Pattern: Override by Priority

```yaml
# Lower priority (60)
- name: friend-access
  priority: 60
  session:
    key: "friend:{principal.name}"

# Higher priority (90) overrides session
- name: group-restrictions
  priority: 90
  session:
    key: "{channel}:group:{peer_id}"
```

### Pattern: Scoped System Hooks

```yaml
# Untrusted hook gets minimal permissions
- name: hook-web-scraper
  match:
    conditions:
      - hook_id: web-scraper
  permissions:
    tools:
      allow: [web_search]
      deny: ["*"]
```

---

## Tips

1. **Start restrictive** — Owner-only by default, add access as needed
2. **Use relationships** — Query semantic identity, not raw IDs
3. **Higher priority for restrictions** — Groups, quiet hours override personal
4. **Scope system hooks** — Each hook can have minimal necessary permissions
5. **Test with CLI** — `nexus acl test --principal mom --channel imessage`

---

*See POLICIES.md for full schema and evaluation algorithm.*

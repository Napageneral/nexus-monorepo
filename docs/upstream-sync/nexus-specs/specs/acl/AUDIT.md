# ACL Audit Logging

**Status:** DESIGN SPEC  
**Last Updated:** 2026-01-29  
**Related:** ACCESS_CONTROL_SYSTEM.md, POLICIES.md, GRANTS.md

---

## Overview

Every access decision is logged for debugging, security analysis, and compliance. The audit log provides complete visibility into:

1. **Who** tried to access the system
2. **What** they were allowed/denied
3. **Why** (which policies matched)
4. **When** it happened

---

## Access Decision Log

### Schema

```sql
CREATE TABLE acl_access_log (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  
  -- Event context
  event_id TEXT,                  -- FK to events ledger
  channel TEXT NOT NULL,
  sender_identifier TEXT NOT NULL,
  peer_kind TEXT,                 -- dm, group
  account TEXT,
  
  -- Resolved principal
  principal_id TEXT,              -- Person ID if resolved
  principal_type TEXT NOT NULL,   -- owner, known, unknown, system, webhook, agent
  principal_name TEXT,
  principal_relationship TEXT,
  
  -- Policy evaluation
  policies_evaluated TEXT,        -- JSON array of all checked
  policies_matched TEXT,          -- JSON array of matching policy names
  policies_denied TEXT,           -- JSON array of denying policies
  
  -- Decision
  effect TEXT NOT NULL,           -- allow, deny
  deny_reason TEXT,               -- If denied, why
  
  -- Resulting permissions (if allowed)
  tools_allowed TEXT,             -- JSON array
  tools_denied TEXT,              -- JSON array
  credentials_allowed TEXT,       -- JSON array
  data_access TEXT,               -- full, restricted, none
  
  -- Resulting session (if allowed)
  persona TEXT,
  session_key TEXT,
  
  -- Grants
  grants_applied TEXT,            -- JSON array of grant IDs
  
  -- Performance
  processing_time_ms INTEGER,
  
  -- Indexes
  FOREIGN KEY (event_id) REFERENCES events(id)
);

-- Indexes for common queries
CREATE INDEX idx_access_log_time ON acl_access_log(timestamp);
CREATE INDEX idx_access_log_principal ON acl_access_log(principal_id);
CREATE INDEX idx_access_log_effect ON acl_access_log(effect);
CREATE INDEX idx_access_log_channel ON acl_access_log(channel);
CREATE INDEX idx_access_log_type ON acl_access_log(principal_type);
```

### Record Structure

```typescript
interface AccessLogEntry {
  id: string;
  timestamp: number;
  
  // Event context
  event_id?: string;
  channel: string;
  sender_identifier: string;
  peer_kind?: 'dm' | 'group';
  account?: string;
  
  // Resolved principal
  principal_id?: string;
  principal_type: 'owner' | 'known' | 'unknown' | 'system' | 'webhook' | 'agent';
  principal_name?: string;
  principal_relationship?: string;
  
  // Policy evaluation
  policies_evaluated: string[];
  policies_matched: string[];
  policies_denied: string[];
  
  // Decision
  effect: 'allow' | 'deny';
  deny_reason?: string;
  
  // Resulting permissions
  tools_allowed?: string[];
  tools_denied?: string[];
  credentials_allowed?: string[];
  data_access?: 'full' | 'restricted' | 'none';
  
  // Resulting session
  persona?: string;
  session_key?: string;
  
  // Grants
  grants_applied?: string[];
  
  // Performance
  processing_time_ms: number;
}
```

---

## Grant Activity Log

### Schema

```sql
CREATE TABLE acl_grant_log (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  
  -- Grant reference
  grant_id TEXT NOT NULL,
  
  -- Activity type
  activity TEXT NOT NULL,         -- created, used, expired, revoked
  
  -- Context
  actor TEXT,                     -- Who performed the action
  reason TEXT,
  
  -- For 'used' activities
  access_log_id TEXT,             -- FK to acl_access_log
  
  FOREIGN KEY (grant_id) REFERENCES acl_grants(id),
  FOREIGN KEY (access_log_id) REFERENCES acl_access_log(id)
);

CREATE INDEX idx_grant_log_grant ON acl_grant_log(grant_id);
CREATE INDEX idx_grant_log_time ON acl_grant_log(timestamp);
CREATE INDEX idx_grant_log_activity ON acl_grant_log(activity);
```

### Activity Types

| Activity | Description | Actor |
|----------|-------------|-------|
| `created` | Grant was created | Owner or system |
| `used` | Grant was applied in access decision | System |
| `expired` | Grant reached expiration | System |
| `revoked` | Grant was manually revoked | Owner |

---

## Request Log

Permission requests are already logged in `acl_permission_requests` table (see GRANTS.md). This serves as the audit trail for the approval workflow.

---

## Logging Implementation

### On Access Decision

```typescript
async function logAccessDecision(
  decision: AccessDecision,
  context: EvaluationContext
): Promise<void> {
  await db.insert('acl_access_log', {
    id: generateId(),
    timestamp: Date.now(),
    
    // Event context
    event_id: context.event?.id,
    channel: context.channel,
    sender_identifier: context.sender,
    peer_kind: context.peer_kind,
    account: context.account,
    
    // Principal
    principal_id: context.principal.id,
    principal_type: context.principal.type,
    principal_name: context.principal.name,
    principal_relationship: context.principal.relationship,
    
    // Evaluation
    policies_evaluated: JSON.stringify(context.policies_evaluated),
    policies_matched: JSON.stringify(decision.policies_matched),
    policies_denied: JSON.stringify(decision.policies_denied),
    
    // Decision
    effect: decision.effect,
    deny_reason: decision.deny_reason,
    
    // Permissions
    tools_allowed: JSON.stringify(decision.permissions?.tools?.allow),
    tools_denied: JSON.stringify(decision.permissions?.tools?.deny),
    credentials_allowed: JSON.stringify(decision.permissions?.credentials),
    data_access: decision.permissions?.data,
    
    // Session
    persona: decision.session?.persona,
    session_key: decision.session?.key,
    
    // Grants
    grants_applied: JSON.stringify(decision.grants_applied),
    
    // Performance
    processing_time_ms: context.processing_time_ms,
  });
}
```

### On Grant Usage

```typescript
async function logGrantUsage(
  grant: Grant,
  accessLogId: string
): Promise<void> {
  await db.insert('acl_grant_log', {
    id: generateId(),
    timestamp: Date.now(),
    grant_id: grant.id,
    activity: 'used',
    access_log_id: accessLogId,
  });
}
```

---

## Query Examples

### Recent Denials

```sql
SELECT 
  timestamp,
  channel,
  sender_identifier,
  principal_name,
  deny_reason,
  policies_denied
FROM acl_access_log
WHERE effect = 'deny'
  AND timestamp > datetime('now', '-24 hours')
ORDER BY timestamp DESC
LIMIT 100;
```

### Access History for Person

```sql
SELECT 
  timestamp,
  channel,
  effect,
  tools_allowed,
  session_key
FROM acl_access_log
WHERE principal_id = 'person_casey'
ORDER BY timestamp DESC
LIMIT 50;
```

### Unknown Sender Attempts

```sql
SELECT 
  sender_identifier,
  channel,
  COUNT(*) as attempts,
  MAX(timestamp) as last_attempt
FROM acl_access_log
WHERE principal_type = 'unknown'
GROUP BY sender_identifier, channel
ORDER BY attempts DESC;
```

### Policy Usage Statistics

```sql
SELECT 
  policy_name,
  COUNT(*) as times_matched
FROM acl_access_log,
     json_each(policies_matched) as policy_name
GROUP BY policy_name
ORDER BY times_matched DESC;
```

### Grant Activity

```sql
SELECT 
  g.id,
  g.principal_query,
  g.resources,
  gl.activity,
  gl.timestamp,
  gl.actor
FROM acl_grants g
JOIN acl_grant_log gl ON g.id = gl.grant_id
WHERE g.id = 'grant_abc123'
ORDER BY gl.timestamp DESC;
```

### Active Grants Usage

```sql
SELECT 
  g.id,
  g.principal_query,
  g.resources,
  COUNT(gl.id) as times_used,
  MAX(gl.timestamp) as last_used
FROM acl_grants g
LEFT JOIN acl_grant_log gl ON g.id = gl.grant_id AND gl.activity = 'used'
WHERE g.revoked_at IS NULL
  AND (g.expires_at IS NULL OR g.expires_at > unixepoch() * 1000)
GROUP BY g.id
ORDER BY times_used DESC;
```

---

## CLI Commands

```bash
# View recent access log
nexus acl audit list
nexus acl audit list --last 100
nexus acl audit list --since yesterday

# Filter by outcome
nexus acl audit list --denied
nexus acl audit list --allowed

# Filter by principal
nexus acl audit list --principal casey
nexus acl audit list --principal-type unknown
nexus acl audit list --relationship family

# Filter by channel
nexus acl audit list --channel discord
nexus acl audit list --channel slack --account work

# Filter by policy
nexus acl audit list --policy group-chat-restrictions
nexus acl audit list --policy-matched  # Any policy matched
nexus acl audit list --policy-denied   # Had denying policies

# View specific entry
nexus acl audit show log_abc123

# Export for analysis
nexus acl audit export --since "2026-01-01" --format csv > audit.csv
nexus acl audit export --format json > audit.json

# Statistics
nexus acl audit stats
nexus acl audit stats --by principal
nexus acl audit stats --by channel
nexus acl audit stats --by policy

# Grant audit
nexus acl grants audit grant_abc123
nexus acl grants audit --all --since yesterday
```

---

## CLI Output Examples

### `nexus acl audit list --denied --last 10`

```
Denied Access Attempts (last 10)
────────────────────────────────────────────────────────────────────────
TIME                 CHANNEL    SENDER              REASON
────────────────────────────────────────────────────────────────────────
2026-01-29 14:32:01  email      spam@example.com    block-unknown
2026-01-29 12:15:43  discord    user#9999           block-unknown
2026-01-29 10:02:18  imessage   +15559999999        block-unknown
...
```

### `nexus acl audit list --principal casey --last 5`

```
Access Log for Casey (last 5)
────────────────────────────────────────────────────────────────────────
TIME                 CHANNEL    EFFECT   SESSION           TOOLS
────────────────────────────────────────────────────────────────────────
2026-01-29 15:00:12  imessage   allow    partner:casey     web_search, weather
2026-01-29 14:45:33  discord    allow    discord:group:123 web_search (group)
2026-01-29 14:30:01  imessage   allow    partner:casey     web_search, weather
...
```

### `nexus acl audit stats`

```
Access Control Statistics (last 7 days)
────────────────────────────────────────────────────────────────────────
Total decisions:      1,247
  Allowed:            1,189 (95.3%)
  Denied:                58 (4.7%)

By principal type:
  Owner:                892 (71.5%)
  Known contacts:       289 (23.2%)
  Unknown:               47 (3.8%)
  System:                19 (1.5%)

By channel:
  iMessage:             567 (45.5%)
  Discord:              412 (33.0%)
  Slack:                198 (15.9%)
  Email:                 70 (5.6%)

Top matched policies:
  owner-full-access:    892
  partner-access:       156
  group-chat-restrict:  133
  family-access:         89
  block-unknown:         47
```

---

## Retention and Cleanup

### Retention Policy

```yaml
audit:
  retention:
    access_log: 90 days     # Keep access decisions for 90 days
    grant_log: 365 days     # Keep grant activity for 1 year
    requests: 365 days      # Keep permission requests for 1 year
```

### Cleanup Job

```sql
-- Run periodically (e.g., daily)
DELETE FROM acl_access_log 
WHERE timestamp < unixepoch() * 1000 - (90 * 24 * 60 * 60 * 1000);

DELETE FROM acl_grant_log
WHERE timestamp < unixepoch() * 1000 - (365 * 24 * 60 * 60 * 1000);

DELETE FROM acl_permission_requests
WHERE created_at < unixepoch() * 1000 - (365 * 24 * 60 * 60 * 1000);
```

---

## Alerting (Future)

Potential alert conditions:

| Condition | Alert |
|-----------|-------|
| Many denials from same sender | Possible attack |
| Unknown senders spike | Possible spam wave |
| Grant created | Notify owner (already done) |
| Policy never matches | Dead policy |
| Unusual access pattern | Anomaly detection |

---

## Privacy Considerations

The audit log contains:
- Sender identities
- Message context (channel, peer)
- Access patterns

This data should be:
- Stored securely
- Retained only as needed
- Accessible only to owner
- Excluded from backups if requested

---

*This document defines ACL audit logging. See ACCESS_CONTROL_SYSTEM.md for the unified overview.*

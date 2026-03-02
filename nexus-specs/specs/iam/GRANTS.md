# ACL Grants — Dynamic Permissions

**Status:** DESIGN SPEC  
**Last Updated:** 2026-01-29  
**Related:** ACCESS_CONTROL_SYSTEM.md, POLICIES.md

---

## Overview

Grants are dynamic, temporary permissions that supplement static policies. They enable:

1. **Privilege escalation** — Someone requests access, owner approves
2. **Temporary access** — Time-limited permissions
3. **Approval workflows** — Draft → approve → execute patterns

Unlike policies (which are declarative and stable), grants are created at runtime through approval flows.

---

## Use Cases

### 1. Privilege Escalation Request

Casey wants to check Tyler's calendar but doesn't have access.

```
Casey: "Can you check when Tyler is free?"
         │
         ▼
   ACL: Casey can't use calendar_read
         │
         ▼
   Atlas → Tyler (DM): "Casey wants to see your calendar. Approve?"
                       [Yes, for today] [Yes, always] [No]
         │
         ▼
   Tyler: "Yes, for today"
         │
         ▼
   Grant created:
     sender: casey
     resources: [calendar_read]
     expires: 24h
         │
         ▼
   Atlas → Casey: "Tyler is free at 3pm tomorrow"
```

### 2. Action Approval

Mom wants to send an email through Atlas.

```
Mom: "Can you send an email to [person] for me?"
         │
         ▼
   ACL: Mom can't use send_email
         │
         ▼
   Atlas drafts email, sends to Tyler for approval
         │
         ▼
   Atlas → Tyler: "Mom wants to send this email:
                   [preview]
                   Approve and send?"
         │
         ▼
   Tyler: "Yes"
         │
         ▼
   Atlas sends email on Mom's behalf
   (No grant created — one-time approval)
```

### 3. Standing Grant

Tyler pre-approves Casey for certain access.

```
Tyler: "Give Casey access to my calendar permanently"
         │
         ▼
   Grant created:
     sender: casey
     resources: [calendar_read]
     expires: null  # Permanent
     granted_by: tyler
```

---

## Grant Schema

```typescript
interface Grant {
  id: string;                    // Unique grant ID
  
  // Who gets the grant
  sender_query: {                // Query to match senders
    person_id?: string;          // Specific person
    tags?: string[];             // People with tags
  };
  
  // What they get
  resources: string[];           // Tools, credentials, data access
  
  // Lifecycle
  created_at: number;            // Unix timestamp
  expires_at?: number;           // Null = permanent
  revoked_at?: number;           // Null = active
  
  // Audit
  granted_by: string;            // Who approved (owner ID)
  reason?: string;               // Why it was granted
  request_context?: string;      // Original request message
  
  // Scope (optional)
  conditions?: {
    platform?: string;            // Only on this platform
    session?: string;            // Only in this session
  };
}
```

### Database Schema

```sql
CREATE TABLE grants (
  id TEXT PRIMARY KEY,

  -- Sender matching
  sender_query TEXT NOT NULL,     -- JSON query

  -- Resources
  resources TEXT NOT NULL,        -- JSON array

  -- Lifecycle
  created_at INTEGER NOT NULL,
  expires_at INTEGER,             -- NULL = permanent
  revoked_at INTEGER,             -- NULL = active

  -- Audit
  granted_by TEXT NOT NULL,
  reason TEXT,
  request_context TEXT,

  -- Scope
  conditions TEXT                 -- JSON conditions
);

CREATE INDEX idx_grants_active ON grants(expires_at, revoked_at);
CREATE INDEX idx_grants_sender ON grants(sender_query);

-- Note: Table lives in identity.db. The acl_ prefix is dropped per DATABASE_ARCHITECTURE.md.
```

---

## Permission Request Flow

### Request Schema

```typescript
interface PermissionRequest {
  id: string;
  
  // Who's asking
  requester: SenderContext;
  requester_platform: string;     // Where they asked
  
  // What they want
  resources: string[];
  
  // Context
  reason: string;                 // Why they need it
  original_message: string;       // The message that triggered this
  
  // Lifecycle
  created_at: number;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  expires_at: number;             // Request expires if not responded to
  
  // Response
  responder?: string;             // Who responded (owner)
  response_at?: number;
  response_platform?: string;
  grant_id?: string;              // If approved, the created grant
}
```

### Database Schema

```sql
CREATE TABLE permission_requests (
  id TEXT PRIMARY KEY,

  -- Requester
  requester_id TEXT,
  requester_platform TEXT,

  -- Request
  resources TEXT NOT NULL,        -- JSON array
  reason TEXT,
  original_message TEXT,

  -- Lifecycle
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at INTEGER NOT NULL,

  -- Response
  responder TEXT,
  response_at INTEGER,
  response_platform TEXT,
  grant_id TEXT REFERENCES grants(id)
);

CREATE INDEX idx_requests_pending ON permission_requests(status)
  WHERE status = 'pending';

-- Note: Table lives in identity.db. The acl_ prefix is dropped per DATABASE_ARCHITECTURE.md.
```

---

## Agent Workflow

### Detecting Need for Elevation

```typescript
async function handleRequest(ctx: AgentContext) {
  const { event, permissions } = ctx;
  
  // Agent determines it needs calendar access
  const needsCalendar = analyzeNeedsCalendar(event.content);
  
  if (needsCalendar && !permissions.tools.includes('calendar_read')) {
    // Can't access calendar — request elevation
    await requestElevation({
      requester: ctx.sender,
      resources: ['calendar_read'],
      reason: "User asked about schedule availability",
      original_message: event.content,
    });
    
    // Respond to user
    return "I don't have access to the calendar for you. I've asked Tyler to approve.";
  }
  
  // Has access, proceed normally
  const calendar = await tools.calendar_read();
  // ...
}
```

### Creating Permission Request

```typescript
async function requestElevation(req: ElevationRequest): Promise<void> {
  // 1. Create request record
  const request = await db.insert('permission_requests', {
    id: generateId(),
    requester_id: req.requester.id,
    requester_platform: req.platform,
    resources: JSON.stringify(req.resources),
    reason: req.reason,
    original_message: req.original_message,
    created_at: Date.now(),
    status: 'pending',
    expires_at: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  });
  
  // 2. Notify owner
  await notifyOwner({
    type: 'permission_request',
    request_id: request.id,
    requester_name: req.requester.name,
    resources: req.resources,
    reason: req.reason,
    actions: [
      { id: 'approve_once', label: 'Approve (this time)' },
      { id: 'approve_day', label: 'Approve (24 hours)' },
      { id: 'approve_always', label: 'Approve (always)' },
      { id: 'deny', label: 'Deny' },
    ],
  });
}
```

### Owner Response Handling

```typescript
async function handleOwnerResponse(
  requestId: string, 
  action: string
): Promise<void> {
  const request = await db.get('permission_requests', requestId);
  
  if (request.status !== 'pending') {
    throw new Error('Request already processed');
  }
  
  switch (action) {
    case 'approve_once':
      // No grant, just approve this one request
      await db.update('permission_requests', requestId, {
        status: 'approved',
        responder: 'owner',
        response_at: Date.now(),
      });
      // Re-run the original request with elevated permissions
      await rerunWithPermissions(request, request.resources);
      break;
      
    case 'approve_day':
      // Create 24-hour grant
      const dayGrant = await createGrant({
        sender_query: { person_id: request.requester_id },
        resources: JSON.parse(request.resources),
        expires_at: Date.now() + 24 * 60 * 60 * 1000,
        granted_by: 'owner',
        reason: request.reason,
        request_context: request.original_message,
      });
      await db.update('permission_requests', requestId, {
        status: 'approved',
        responder: 'owner',
        response_at: Date.now(),
        grant_id: dayGrant.id,
      });
      // Re-run original request
      await rerunWithPermissions(request, JSON.parse(request.resources));
      break;
      
    case 'approve_always':
      // Create permanent grant
      const permGrant = await createGrant({
        sender_query: { person_id: request.requester_id },
        resources: JSON.parse(request.resources),
        expires_at: null, // Permanent
        granted_by: 'owner',
        reason: request.reason,
        request_context: request.original_message,
      });
      await db.update('permission_requests', requestId, {
        status: 'approved',
        responder: 'owner',
        response_at: Date.now(),
        grant_id: permGrant.id,
      });
      await rerunWithPermissions(request, JSON.parse(request.resources));
      break;
      
    case 'deny':
      await db.update('permission_requests', requestId, {
        status: 'denied',
        responder: 'owner',
        response_at: Date.now(),
      });
      // Notify requester
      await notifyRequester(request, 'Your request was denied.');
      break;
  }
}
```

---

## Grant Evaluation

Grants are checked during ACL evaluation:

```typescript
function evaluateAccess(sender: SenderContext, event: Event): AccessDecision {
  // 1. Evaluate static policies
  const policyResult = evaluatePolicies(sender, event);

  if (policyResult.effect === 'deny') {
    return policyResult; // Deny short-circuit
  }

  // 2. Load active grants for this sender
  const grants = loadActiveGrants(sender);
  
  // 3. Merge grant permissions with policy permissions
  const permissions = mergePermissions(
    policyResult.permissions,
    grantsToPermissions(grants)
  );
  
  return {
    effect: 'allow',
    permissions,
    session: policyResult.session,
    grants_applied: grants.map(g => g.id),
  };
}

function loadActiveGrants(sender: SenderContext): Grant[] {
  const now = Date.now();

  return db.query(`
    SELECT * FROM grants
    WHERE revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > ?)
      AND sender_matches(sender_query, ?)
  `, [now, JSON.stringify(sender)]);
}
```

---

## CLI Commands

```bash
# List active grants
nexus acl grants list
nexus acl grants list --sender casey
nexus acl grants list --expired

# View grant details
nexus acl grants show grant_abc123

# Create grant manually
nexus acl grants create \
  --sender casey \
  --resources calendar_read \
  --expires 24h \
  --reason "Approved via CLI"

# Revoke grant
nexus acl grants revoke grant_abc123 --reason "No longer needed"

# List pending requests
nexus acl requests list --pending

# Respond to request
nexus acl requests approve req_xyz --duration 24h
nexus acl requests deny req_xyz --reason "Not appropriate"
```

---

## Owner Notification Interface

When a permission request is created, the owner is notified via their preferred channel:

```
┌─────────────────────────────────────────────────────────┐
│ 🔐 Permission Request                                    │
│                                                          │
│ Casey wants to access your calendar.                     │
│                                                          │
│ Reason: "Asking when you're free for dinner"            │
│ Original message: "Can you check when Tyler is free?"   │
│                                                          │
│ [Approve once] [Approve 24h] [Approve always] [Deny]    │
└─────────────────────────────────────────────────────────┘
```

Response handling:
- Owner taps button → response sent to broker
- Broker calls `handleOwnerResponse()`
- Result sent back to requester

---

## Action Approval (No Grant)

Some actions need approval but don't create standing grants:

### Send Email Approval

```typescript
async function handleSendEmailRequest(
  ctx: AgentContext, 
  draft: EmailDraft
): Promise<void> {
  // Check if sender can send email
  if (!ctx.permissions.tools.includes('send_email')) {
    // Create approval request for this specific action
    const approval = await createActionApproval({
      requester: ctx.sender,
      action: 'send_email',
      details: {
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
      },
      expires_at: Date.now() + 60 * 60 * 1000, // 1 hour
    });
    
    await notifyOwner({
      type: 'action_approval',
      approval_id: approval.id,
      requester_name: ctx.sender.name,
      action: 'Send email',
      preview: formatEmailPreview(draft),
      actions: [
        { id: 'approve', label: 'Approve & Send' },
        { id: 'edit', label: 'Edit first' },
        { id: 'deny', label: 'Deny' },
      ],
    });
    
    return ctx.reply("I've drafted the email and sent it to Tyler for approval.");
  }
  
  // Has permission, send directly
  await tools.send_email(draft);
}
```

---

## Security Considerations

### Request Expiration

Pending requests auto-expire:
- Default: 24 hours
- Configurable per-request
- Expired requests are marked, not deleted (audit trail)

### Grant Expiration

- Temporary grants auto-expire
- Permanent grants can be revoked
- Expired grants ignored in evaluation

### Audit Trail

All grant activity is logged:
- Grant created (who, when, why)
- Grant used (each time in access decision)
- Grant revoked (who, when, why)
- Request created/approved/denied

### Rate Limiting

Prevent spam:
- Max N pending requests per sender
- Cooldown between requests
- Block if too many denials

---

## Examples

### Standing Grant for Partner

```yaml
# Created via CLI or agent
id: grant_partner_calendar
sender_query:
  tags: [partner]
resources:
  - calendar_read
expires_at: null  # Permanent
granted_by: owner
reason: "Partner should always see my calendar"
```

### Temporary Work Access

```yaml
# Created via approval flow
id: grant_work_access_abc
sender_query:
  person_id: person_contractor
resources:
  - github
  - read_file
  - write_file
expires_at: 1706745600000  # 2 weeks from now
granted_by: owner
reason: "Contractor needs project access"
```

### Scoped Grant

```yaml
# Only applies in specific context
id: grant_scoped_assistant
sender_query:
  person_id: person_assistant
resources:
  - send_email
conditions:
  platform: slack
  session: work
expires_at: null
granted_by: owner
reason: "Assistant can send work emails only"
```

---

*This document defines dynamic permission grants. See ACCESS_CONTROL_SYSTEM.md for the unified overview.*

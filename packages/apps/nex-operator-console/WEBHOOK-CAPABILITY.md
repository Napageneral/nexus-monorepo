# Webhook Capability Implementation Plan

## Context

The v2 operator console includes a Webhooks section (reference images 37-40) for managing HTTP webhook subscriptions. The nex runtime already has an internal event system (`events.publish`, `events.subscribe`, durable `event_subscriptions`) but no external HTTP webhook delivery.

Webhooks are a core SaaS platform feature for nex — they allow customers and their applications to receive real-time notifications via HTTP when events occur in their nex environment.

## Use Cases

### GlowBot (clinic SaaS)
- **Pipeline completion** — notify clinic dashboards when fresh metrics are computed
- **Connection health** — alert clinic admins when an adapter (Google, Meta, EMR) disconnects or fails auth
- **Anomaly detection** — push alerts when funnel metrics show significant drop-offs
- **Backfill completion** — signal that historical data import is done

### Spike (code intelligence)
- **Snapshot ready** — notify CI/CD pipelines when a new code snapshot is indexed and queryable
- **PR replay complete** — trigger downstream review workflows
- **Mirror refresh** — signal dependent tooling that fresh code is available
- **Index failures** — alert on broken repos or credential issues

### Git Adapter
- **New PR/commit ingested** — notify project management tools, Slack channels
- **Backfill completion** — signal readiness for dependent workflows
- **Connection changes** — alert on auth failures, rate limiting

### Platform-level (Frontdoor)
- **`connection.created` / `connection.updated`** — track integration lifecycle
- **`passthrough.executed`** — audit API proxy calls
- **`invoice.updated`** — billing system notifications
- **`agent.created` / `agent.deleted`** — workspace lifecycle events

## Architecture

### Option A: Runtime-native webhooks (Recommended)

Extend the nex runtime's existing event system with an HTTP delivery adapter:

```
┌──────────────┐   event    ┌──────────────┐   HTTP POST   ┌──────────────┐
│  Event Bus   │ ──────────►│  Webhook     │ ─────────────►│  Customer    │
│  (existing)  │            │  Dispatcher  │               │  Endpoint    │
└──────────────┘            └──────────────┘               └──────────────┘
                                  │
                            ┌─────┴──────┐
                            │  Webhook   │
                            │  Store     │
                            │  (SQLite)  │
                            └────────────┘
```

New runtime capability: `webhooks`

| Method | Description |
|--------|------------|
| `webhooks.list` | List webhook subscriptions |
| `webhooks.create` | Create subscription (URL, event types, secret, description) |
| `webhooks.get` | Get subscription details |
| `webhooks.update` | Update subscription (URL, events, enabled) |
| `webhooks.delete` | Delete subscription |
| `webhooks.events.list` | List event delivery history |
| `webhooks.events.get` | Get single event delivery detail |
| `webhooks.test` | Send a test event to the endpoint |

### Webhook Subscription Schema

```typescript
interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];        // e.g. ["connection.created", "agent.run.completed"]
  secret?: string;         // HMAC signing secret
  description?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastDeliveryAt?: string;
  lastDeliveryStatus?: number;
}
```

### Event Delivery

```typescript
interface WebhookDelivery {
  id: string;
  subscriptionId: string;
  event: string;
  payload: unknown;
  url: string;
  status: number;          // HTTP response status
  responseBody?: string;   // First 1KB of response
  attemptCount: number;
  nextRetryAt?: string;
  createdAt: string;
  deliveredAt?: string;
}
```

### Delivery guarantees
- **At-least-once** with exponential backoff retry (1min, 5min, 30min, 2hr, 12hr)
- **HMAC-SHA256 signature** in `X-Webhook-Signature` header using subscription secret
- **Timeout**: 30 seconds per delivery attempt
- **Max retries**: 5 attempts before marking as failed
- **Idempotency key** in `X-Webhook-Id` header for deduplication

### Option B: Frontdoor-managed webhooks

If webhooks should be a platform feature (not per-runtime), the frontdoor could manage subscriptions and fan out events from all customer runtimes. This is more complex but enables cross-runtime event aggregation.

**Recommendation**: Start with Option A (runtime-native). Migrate to Option B later if multi-runtime webhook management is needed.

## Implementation Steps

### Phase 1: Webhook store (SQLite table)
- `webhook_subscriptions` table in the runtime's SQLite database
- CRUD operations via new `webhooks` capability

### Phase 2: Event bus integration
- Subscribe to the runtime's internal event bus
- Match events against subscription filters
- Queue deliveries

### Phase 3: HTTP dispatcher
- Background worker that processes the delivery queue
- HMAC signing, retry logic, status tracking
- Event history persistence

### Phase 4: Console wiring
- Wire `webhooks.*` methods into the v2 UI
- The UI is already built (pages/webhooks.ts + modals/createWebhookModal)
- Just need to replace mock data with real controller calls

## Console UI Status

The v2 UI already has:
- Webhook subscriptions list page with search/filter
- Create webhook modal (URL, event types, secret, description, active toggle)
- Event history page (empty state)
- Use-case promotional cards

Only needs: a controller that calls `webhooks.*` RPC methods.

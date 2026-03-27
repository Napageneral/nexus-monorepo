# Frontdoor API Integration Plan

## Context

The operator console Settings pages (Profile, Billing, Usage, Invoices, API Keys, Auth) need to talk to the **frontdoor** — the public-facing SaaS control plane — not the nex runtime directly. The frontdoor manages customer accounts, billing (Stripe), authentication, and routes to individual nex runtime instances.

## Architecture

```
                                  ┌─────────────────┐
                                  │   Frontdoor API  │
                                  │  (account, billing, │
                                  │   API keys, auth)   │
                                  └────────┬────────┘
                                           │ REST/HTTP
┌──────────────┐   WebSocket    ┌──────────┴────────┐
│  Operator    │ ──────────────►│   Nex Runtime     │
│  Console v2  │                │  (agents, chat,   │
│              │   REST/HTTP    │   schedules, etc.) │
│              │ ──────────────►│                    │
└──────────────┘   (frontdoor)  └───────────────────┘
```

The console needs **two API clients**:
1. **RuntimeBrowserClient** (existing) — WebSocket connection to the nex runtime for real-time operations
2. **FrontdoorClient** (new) — HTTP client for account/billing operations via the frontdoor API

## Settings Page → API Mapping

| Settings Page | Frontdoor Endpoint | Notes |
|--------------|-------------------|-------|
| **Profile** | `GET/PUT /api/v1/account/profile` | Username, email, name |
| **Billing** | `GET /api/v1/account/billing` | Current plan, agent seats |
| | `GET /api/v1/account/billing/plans` | Available plans |
| | `POST /api/v1/account/billing/subscribe` | Upgrade/downgrade |
| | `GET /api/v1/account/billing/portal` | Stripe billing portal URL |
| **Usage** | `GET /api/v1/account/usage/connections` | Connection count timeseries |
| | `GET /api/v1/account/usage/api-calls` | API call count timeseries |
| **Invoices** | `GET /api/v1/account/invoices` | Invoice list from Stripe |
| **API Keys** | `GET /api/v1/account/api-keys` | List API keys |
| | `POST /api/v1/account/api-keys` | Create new key |
| | `DELETE /api/v1/account/api-keys/:id` | Revoke key |
| **Auth** | `GET /api/v1/account/integrations` | Integration visibility/config |
| | `PUT /api/v1/account/integrations/:id` | Toggle integration enabled |

## Implementation Plan

### Phase 1: FrontdoorClient

Create `v2/frontdoor-client.ts`:
- Simple HTTP fetch wrapper
- Base URL derived from runtime URL or configured separately
- Auth via the same token/session used for the runtime connection
- Methods: `get<T>(path)`, `post<T>(path, body)`, `put<T>(path, body)`, `delete(path)`

### Phase 2: Settings Controllers

Create `v2/controllers/` with:
- `profile.ts` — load/save profile via frontdoor
- `billing.ts` — load plans, current subscription, agent seats
- `usage.ts` — load connection/API-call timeseries for charts
- `invoices.ts` — load invoice list
- `api-keys.ts` — CRUD for API keys
- `auth-integrations.ts` — load/toggle integration visibility

### Phase 3: Wire into Settings Pages

Update each Settings sub-page in `app-render-v2.ts` to:
- Call the appropriate controller on page load
- Pass real data to the render functions instead of hardcoded values
- Handle loading/error states

## Dependencies

- Frontdoor API must exist and be deployed
- Authentication must work cross-origin (same auth token or session cookie)
- CORS must allow the console's origin

## Open Questions

1. Is the frontdoor API already implemented? What endpoints exist?
2. How does the console authenticate with the frontdoor? Same token as runtime? OAuth session?
3. Are agent seats managed by the frontdoor or the runtime? (The reference design shows "Buy a seat" in the Agents page)
4. Should usage data come from the frontdoor (aggregated) or the runtime (`usage.cost`, `agents.sessions.usage`)?

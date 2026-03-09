# gog CLI — Google Ads + Places API Extension

> Spec for extending the `gogcli` tool with Google Ads reporting and Google Places data commands. Intended for upstream PR to `github.com/steipete/gogcli`.
>
> **Note:** This doc covers the **gog CLI tool itself** (upstream contribution). For GlowBot's adapter architecture wrapping gog, see `ADAPTERS.md` (sections 1 and 5). Adapters are Go binaries using `adapter-sdk-go`, emit NexusEvents as JSONL, and store data as elements in memory.db via the nex SDK.

---

## Overview

gog currently supports 12 Google services (Gmail, Calendar, Drive, Contacts, Sheets, Docs, Chat, Classroom, Tasks, People, Groups, Keep). This extension adds two new services:

1. **`gog ads`** — Google Ads API (read-only campaign reporting via GAQL)
2. **`gog places`** — Google Places API (New) (business details, reviews, ratings)

Both share the existing Google Cloud project and OAuth infrastructure. For GlowBot, the nex adapter wraps these gog commands the same way `nexus-adapter-gog` wraps Gmail.

---

## Architecture

### How gog Services Work (current pattern)

1. **Service registration** (`internal/googleauth/service.go`):
   - Add `Service` constant (e.g., `ServiceAds`)
   - Add to `serviceOrder` slice
   - Register in `serviceInfoByService` map with OAuth scopes and API names

2. **Command group** (`internal/cmd/root.go`):
   - Add field to `CLI` struct (e.g., `Ads AdsCmd`)
   - Kong auto-discovers subcommands

3. **Command implementation** (`internal/cmd/ads.go`):
   - Define command structs with `kong` tags
   - Implement `Run(ctx context.Context) error` methods
   - Use `googleapi` package for HTTP client with auth

4. **Auth flow**:
   - User runs `gog auth add user@gmail.com --services gmail,ads,places`
   - gog requests OAuth consent with combined scopes
   - Token stored in keyring, refreshed automatically

### What We Add

```
internal/googleauth/service.go   # Add ServiceAds, ServicePlaces
internal/cmd/root.go             # Add Ads, Places to CLI struct
internal/cmd/ads.go              # Google Ads commands
internal/cmd/ads_gaql.go         # GAQL query builder/parser
internal/cmd/places.go           # Google Places commands
internal/googleapi/ads.go        # Google Ads API client
internal/googleapi/places.go     # Google Places API client
```

---

## Service Registration

### Google Ads Service

```go
// internal/googleauth/service.go

ServiceAds Service = "ads"

// In serviceInfoByService:
ServiceAds: {
    scopes: []string{
        "https://www.googleapis.com/auth/adwords.readonly",
    },
    user: true,
    apis: []string{"Google Ads API"},
    note: "Read-only; requires developer token + MCC",
},
```

**Google Cloud APIs to enable**: `Google Ads API`

### Google Places Service

```go
ServicePlaces Service = "places"

// In serviceInfoByService:
ServicePlaces: {
    scopes: []string{}, // Places API (New) uses API key, not OAuth
    user: true,
    apis: []string{"Places API (New)"},
    note: "API key auth; no OAuth scopes needed",
},
```

**Google Cloud APIs to enable**: `Places API (New)`

**Note**: Places API (New) uses API key authentication, not OAuth. The service registration is mainly for discoverability (`gog auth services` lists it). The actual auth uses a project-level API key.

---

## Google Ads Commands (`gog ads`)

### Prerequisites

The user must configure:
1. **Developer token**: `gog config set ads.developer-token YOUR_TOKEN`
2. **Manager account (MCC) ID**: `gog config set ads.login-customer-id 1234567890`
3. **Customer ID** (the ad account): passed per-command via `--customer-id` or `gog config set ads.customer-id`

### Command Tree

```
gog ads
  accounts       List accessible Google Ads customer accounts
  campaigns      List campaigns with key metrics
  report         Run a GAQL query and output results
  metrics        Pull daily metrics for a date range (convenience wrapper)
```

### `gog ads accounts`

List all Google Ads accounts accessible via the MCC.

```bash
gog ads accounts
# Output: customer_id, descriptive_name, currency_code, time_zone
```

Implementation: `GAQL: SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer`

### `gog ads campaigns`

List campaigns with summary metrics.

```bash
gog ads campaigns --customer-id 1234567890 --from 2026-02-01 --to 2026-02-25
# Output: campaign_name, status, cost, impressions, clicks, conversions, ctr, cpc
```

```bash
gog ads campaigns --customer-id 1234567890 --days 30
# Same but last 30 days
```

### `gog ads report`

Run arbitrary GAQL queries. Power-user command.

```bash
gog ads report --customer-id 1234567890 \
  "SELECT campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, segments.date FROM campaign WHERE segments.date BETWEEN '2026-02-01' AND '2026-02-25'"
```

Output: JSON rows (with `--json`) or formatted table.

### `gog ads metrics`

Convenience command for daily metric export. This is what the GlowBot adapter primarily calls.

```bash
gog ads metrics --customer-id 1234567890 --from 2026-02-01 --to 2026-02-25 --level campaign
# Output: date, campaign_name, campaign_id, cost, impressions, clicks, conversions
```

```bash
gog ads metrics --customer-id 1234567890 --days 7 --level ad_group
# Output: date, campaign_name, ad_group_name, ad_group_id, cost, impressions, clicks, conversions
```

Levels: `campaign` (default), `ad_group`, `ad` (individual ads), `account` (totals only).

**Cost normalization**: The command automatically divides `cost_micros` by 1,000,000 and outputs human-readable dollar amounts. Raw micros available with `--raw-costs`.

### HTTP Headers

Every Google Ads API request requires these headers:
```
Authorization: Bearer {oauth_token}
developer-token: {developer_token}
login-customer-id: {mcc_id}   (optional, for MCC access)
```

### API Client

```go
// internal/googleapi/ads.go

type AdsClient struct {
    httpClient     *http.Client  // from OAuth
    developerToken string
    loginCustomerID string
}

func (c *AdsClient) Query(ctx context.Context, customerID string, gaql string) ([]map[string]interface{}, error) {
    // POST https://googleads.googleapis.com/v18/customers/{customerID}/googleAds:searchStream
    // Body: {"query": gaql}
    // Headers: developer-token, login-customer-id
}
```

---

## Google Places Commands (`gog places`)

### Prerequisites

API key configured: `gog config set places.api-key YOUR_API_KEY`

Or passed per-command: `--api-key KEY`

### Command Tree

```
gog places
  search         Search for places by text query
  details        Get full details for a place by Place ID
  reviews        Get reviews for a place
  nearby         Search nearby places by location + radius
```

### `gog places search`

```bash
gog places search "Skin Laundry Los Angeles"
# Output: place_id, name, address, rating, user_rating_count, types
```

### `gog places details`

```bash
gog places details ChIJN1t_tDeuEmsRUsoyG83frY4
# Output: full place details including all available fields
```

### `gog places reviews`

```bash
gog places reviews ChIJN1t_tDeuEmsRUsoyG83frY4
# Output: review text, rating, author, time, author_url
# Note: Places API (New) returns up to 5 most relevant reviews
```

### `gog places nearby`

```bash
gog places nearby --lat 34.0522 --lng -118.2437 --radius 5000 --type "beauty_salon"
# Output: nearby places matching criteria
```

### API Client

```go
// internal/googleapi/places.go

type PlacesClient struct {
    apiKey string
}

func (c *PlacesClient) SearchText(ctx context.Context, query string) ([]Place, error) {
    // POST https://places.googleapis.com/v1/places:searchText
    // Headers: X-Goog-Api-Key, X-Goog-FieldMask
}

func (c *PlacesClient) GetDetails(ctx context.Context, placeID string, fields []string) (*Place, error) {
    // GET https://places.googleapis.com/v1/places/{placeID}
    // Headers: X-Goog-Api-Key, X-Goog-FieldMask
}
```

**Field mask** is required for Places API (New). The client builds it from requested fields to minimize response size and cost.

---

## Configuration

New config keys in `~/.config/gogcli/config.json`:

```json
{
  "ads": {
    "developer_token": "...",
    "login_customer_id": "1234567890",
    "customer_id": "9876543210"
  },
  "places": {
    "api_key": "AIza..."
  }
}
```

---

## GlowBot nex Adapter Integration

> **Canonical reference:** `ADAPTERS.md` defines the full adapter architecture — manifests, auth, sync strategies, multi-location via metadata.

The GlowBot Google adapter wraps gog CLI commands and emits NexusEvents as JSONL. The nex runtime receives these events, and the GlowBot `metric_extract` job converts them to metric elements in memory.db via the SDK.

```go
// In the Google adapter's backfill handler:
// Call gog ads metrics → parse JSON → emit NexusEvents with metric metadata
// Each event carries adapter_id, metric_name, metric_value, date, clinic_id
// The downstream pipeline (see DATA_PIPELINE.md) handles element creation
```

See `ADAPTERS.md` §1 (Google Ads) and §5 (Google Business Profile) for full API details, manifests, and sync strategies.

---

## Implementation Plan

### Phase 1: Google Ads (Week 1)
1. Add `ServiceAds` to `internal/googleauth/service.go`
2. Add `AdsCmd` to CLI struct in `root.go`
3. Implement `internal/googleapi/ads.go` (GAQL query client)
4. Implement `internal/cmd/ads.go` (accounts, campaigns, report, metrics commands)
5. Tests: unit tests for GAQL parsing, integration test with test developer token
6. PR to `steipete/gogcli`

### Phase 2: Google Places (Week 1-2)
1. Add `ServicePlaces` to service registry
2. Add `PlacesCmd` to CLI struct
3. Implement `internal/googleapi/places.go` (Places API New client)
4. Implement `internal/cmd/places.go` (search, details, reviews, nearby)
5. Tests
6. PR to `steipete/gogcli`

### Phase 3: nex Adapter (Week 2)
1. Create `nexus-adapter-gog-ads` following `nexus-adapter-gog` pattern
2. Implement sync (backfill + live) using `gog ads metrics`
3. Implement health check using `gog ads accounts`
4. Create `nexus-adapter-gog-places` for GBP data
5. Wire to GlowBot pipeline

---

## Upstream Considerations

For the PR to `steipete/gogcli`:

- **Read-only by default**: All ads commands are read-only (reporting only). No campaign creation/modification.
- **Developer token not included**: Users bring their own. gog just stores and passes it.
- **Places API billing**: Places API (New) has per-request costs. gog should warn on first use and respect `--no-input` flag.
- **Scope isolation**: `ads` scope is separate from Workspace scopes. Users can `gog auth add user@email.com --services ads` without granting Gmail/Calendar access.
- **Existing pattern**: Follow the same code style, testing patterns, and output formatting as existing services.

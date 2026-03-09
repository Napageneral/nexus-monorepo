# GlowBot — Data Adapter Specifications

> Per-adapter auth methods, API details, sync strategies, and quick-start paths.

---

## Design Principles

1. **Every adapter has a fast path** — something testable within a week using credentials the clinic already has or can get immediately
2. **Every adapter has a CSV fallback** — manual upload always works, no API needed
3. **Adapters are nex adapter binaries** — JSONL over stdin/stdout, using the `nexadapter` SDK
4. **Adapters are shared installable packages** — GlowBot declares adapter dependencies under `requires.adapters`, and the app manifest exposes customer-facing integration metadata under `adapters[]`
5. **Raw data first** — adapters emit metric data as NexusEvents; the pipeline extracts and stores as elements in memory.db
6. **Name metrics what they are** — don't over-generalize names; use `calls_total`, `calls_first_time` not "page_actions". Collapse later if needed, never prematurely.
7. **One credential per platform** — Google services share one OAuth flow; clinic connects once, all Google services activate
8. **Hard cutover** — no backwards compatibility with legacy app-local pipeline storage. All data flows through nex primitives (elements, sets, jobs, DAGs).
9. **One adapter per platform, multi-location via metadata** — each platform gets one adapter connection. The adapter discovers all locations/centers automatically and tags every metric element with `clinic_id` in metadata. Multi-location practices connect once per platform, not once per location.
10. **GlowBot UI is curated** — the GlowBot app surfaces only GlowBot-owned connection choices. Generic shared-adapter BYO flows live in the main Nex console, not in the GlowBot integrations page.

---

## Package Model

GlowBot uses shared adapter packages rather than app-local adapter binaries.

- each adapter is a separate installable adapter package
- the GlowBot app declares dependencies under `requires.adapters`
- the GlowBot app exposes app-visible integration metadata under `adapters[]`
- app-facing connection choices are declared under `adapters[].connectionProfiles`
- adapter connection flows run through the hosted adapter connection platform
- provider scopes, secret fields, and token mechanics live in the shared adapter auth methods, not in the GlowBot app manifest
- generic shared-adapter BYO connection options are managed in the main Nex console rather than mirrored inside the GlowBot app

Canonical manifest shape:

```json
{
  "id": "glowbot",
  "requires": {
    "adapters": [
      { "id": "google", "version": "^1.0.0" },
      { "id": "meta-ads", "version": "^1.0.0" },
      { "id": "patient-now-emr", "version": "^1.0.0" },
      { "id": "zenoti-emr", "version": "^1.0.0" },
      { "id": "callrail", "version": "^1.0.0" },
      { "id": "twilio", "version": "^1.0.0" },
      { "id": "apple-maps", "version": "^1.0.0" }
    ]
  },
  "adapters": [
    {
      "id": "google",
      "packageId": "google",
      "displayName": "Google",
      "description": "Google Ads and Google Business Profile in one connection",
      "connectionProfiles": [
        {
          "id": "glowbot-managed-google",
          "displayName": "Connect with GlowBot Google",
          "authMethodId": "google_oauth_managed",
          "scope": "app",
          "managedProfileId": "glowbot-google-oauth"
        },
        {
          "id": "google-csv-upload",
          "displayName": "Upload CSV / Manual Entry",
          "authMethodId": "csv_upload",
          "scope": "app"
        }
      ]
    }
  ]
}
```

---

## Adapter Summary

| Adapter | Fast Path (testable next week) | Full Path (production) | CSV Fallback |
|---------|-------------------------------|----------------------|--------------|
| Google (unified) | gog CLI + test dev token (Ads) + Places API key (GBP) | gog CLI + standard dev token + GBP partner approval | Google Ads / GBP CSV export |
| Meta Ads | Personal Access Token via Graph API Explorer | App Review + Business Verification | Meta Ads Manager CSV export |
| Patient Now | Clinic's own API key (they have one) | Partner program (NDA, 4-12 weeks) | PatientNow report CSV export |
| Zenoti | Clinic's own API key (they have one) | Partner program (2-6 weeks) | Zenoti report CSV export |
| CallRail | API token from account settings | OAuth 2.0 + webhooks | CallRail CSV export |
| Twilio | Account SID + Auth Token | API keys + StatusCallback webhooks | Twilio console CSV export |
| Apple Maps | CSV upload / manual entry | N/A (no API exists) | CSV upload / manual entry |

> **Note on Google unification:** Google Ads and Google Business Profile are served by a single unified Google adapter backed by the gog CLI. One "Connect Google" OAuth flow requests all needed scopes (`adwords.readonly`, `business.manage`) via `include_granted_scopes=true`. Under the hood, the adapter wraps different gog CLI command groups (`gog ads`, `gog places`) but to the clinic it's one connection. See sections 1 and 5 for per-service API details.

---

## 1. Google Adapter — Ads Service

### 1.1 Fast Path: gog CLI + Test Developer Token

**What you need** (all obtainable this week):
1. ✅ Google Cloud project (already exists from gog)
2. ✅ OAuth 2.0 credentials (already exists from gog)
3. 🔧 Enable Google Ads API on existing Cloud project
4. 🆕 Create Google Ads Manager Account (MCC) at `ads.google.com/home/tools/manager-accounts/` — free, instant
5. 🆕 Get test developer token — found in MCC → Admin → API Center, **issued immediately**
6. 🆕 Clinic links their Google Ads account to your MCC (they invite you as manager, or you send an invite)

**Test developer token limitations**: Can only access accounts directly linked to your MCC. Fine for development and first clinics.

**Implementation**: Extend gog CLI with `gog ads` command group (see [`../proposals/GOG_ADS_EXTENSION.md`](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/proposals/GOG_ADS_EXTENSION.md)). The shared `google` adapter package wraps gog CLI commands for the Ads service.

### 1.2 Full Path: Standard Developer Token

Apply via MCC → Admin → API Center. Describe use case ("SaaS dashboard pulling read-only campaign metrics for clinic customers"). 1-4 week review. Allows access to any Google Ads account that OAuths with you.

### 1.3 CSV Fallback

Google Ads UI → Reports → predefined or custom report → Download CSV.

Required CSV columns for import:
- `date`, `campaign_name`, `cost`, `impressions`, `clicks`, `conversions`

The adapter parses CSV input into canonical metric events, which the pipeline converts into metric elements.

### 1.4 API Details

**API**: Google Ads API v18+ (REST + GAQL query language)

**Authentication (3-layer)**:
- **OAuth 2.0** — scope `https://www.googleapis.com/auth/adwords.readonly`
- **Developer Token** — passed as `developer-token` HTTP header on every request
- **Manager Account (MCC)** — `login-customer-id` header for managing client accounts

**Key GAQL queries**:
```sql
-- Daily campaign metrics
SELECT campaign.name, campaign.id,
       metrics.cost_micros, metrics.impressions,
       metrics.clicks, metrics.conversions,
       metrics.cost_per_conversion,
       segments.date
FROM campaign
WHERE segments.date BETWEEN '{start}' AND '{end}'

-- Ad group level breakdown
SELECT ad_group.name, ad_group.id, campaign.name,
       metrics.cost_micros, metrics.impressions,
       metrics.clicks, metrics.conversions,
       segments.date
FROM ad_group
WHERE segments.date BETWEEN '{start}' AND '{end}'
```

**Note**: Costs returned in micro-units (divide by 1,000,000 for dollars).

**Rate limits**: ~15,000 requests/day per developer token. Standard access tier is plenty.

**Backfill**: Full account lifetime. No lookback limit.

### 1.5 Metrics Produced

`ad_spend`, `ad_impressions`, `ad_clicks`, `ad_conversions`, `ad_cost_per_click`, `ad_cost_per_conversion` — all per campaign, per ad group, per day.

### 1.6 GlowBot Integration Metadata

```json
{
  "id": "google",
  "packageId": "google",
  "displayName": "Google",
  "description": "Google Ads and Google Business Profile in one connection",
  "connectionProfiles": [
    {
      "id": "glowbot-managed-google",
      "displayName": "Connect with GlowBot Google",
      "authMethodId": "google_oauth_managed",
      "scope": "app",
      "managedProfileId": "glowbot-google-oauth"
    },
    {
      "id": "google-csv-upload",
      "displayName": "Upload CSV / Manual Entry",
      "authMethodId": "csv_upload",
      "scope": "app"
    }
  ],
  "syncSchedule": {
    "backfillDefault": "90d",
    "liveInterval": "6h/24h"
  },
  "metricsProduced": [
    "ad_spend", "ad_impressions", "ad_clicks",
    "ad_conversions", "ad_cost_per_click", "ad_cost_per_conversion",
    "listing_views_search", "listing_views_maps",
    "listing_clicks_website", "listing_clicks_directions", "listing_clicks_phone",
    "reviews_count", "reviews_rating_avg", "reviews_new",
    "search_keyword_impressions"
  ]
}
```

---

## 2. Meta Ads Adapter

### 2.1 Fast Path: Personal Access Token

**What you need** (obtainable in minutes):
1. Go to `developers.facebook.com/tools/explorer`
2. Select your app (or create one)
3. Generate a User Access Token with `ads_read` permission
4. Extend to long-lived token (60-day expiry) via the token debug tool or API call:
   ```
   GET /oauth/access_token?grant_type=fb_exchange_token
     &client_id={app-id}&client_secret={app-secret}
     &fb_exchange_token={short-lived-token}
   ```
5. Use this token directly in the adapter config

**Limitations**: Token expires after 60 days (must manually refresh). No App Review needed. Works immediately for development and first clinics.

### 2.2 Full Path: App Review + Business Verification

1. Create Meta Developer App at `developers.facebook.com`
2. Add "Marketing API" product
3. Submit for App Review (required for `ads_read` scope) — 1-2 weeks
4. Complete Business Verification — 1 week
5. Get approved for Standard Access tier

### 2.3 CSV Fallback

Meta Ads Manager → Reporting → Export CSV.

Required CSV columns:
- `date`, `campaign_name`, `spend`, `impressions`, `clicks`, `results`

### 2.4 API Details

**API**: Meta Marketing API v21+ (REST)

**Key endpoints**:
```
GET /{ad_account_id}/insights
  ?date_preset=last_30d
  &level=campaign
  &fields=campaign_name,spend,impressions,clicks,actions,
          cost_per_action_type,reach
  &time_increment=1  (daily breakdown)
```

**Gotchas**:
- Spend returned as decimal strings (not integers) — parse carefully
- Conversions are nested in an `actions` array — filter by `action_type`
- Rate limiting is score-based: check `x-business-use-case-usage` response header
- Implement backoff when usage score approaches 100%

**Rate limits**: Score-based system. At normal GlowBot usage (one query per clinic every 6 hours), not a concern.

**Backfill**: 37 months maximum lookback.

### 2.5 Metrics Produced

`ad_spend`, `ad_impressions`, `ad_clicks`, `ad_conversions`, `ad_cost_per_result`, `ad_reach` — per campaign, per ad set, per day.

### 2.6 GlowBot Integration Metadata

```json
{
  "id": "meta-ads",
  "packageId": "meta-ads",
  "displayName": "Meta Ads",
  "connectionProfiles": [
    {
      "id": "glowbot-managed-meta",
      "displayName": "Connect with GlowBot Meta",
      "authMethodId": "meta_oauth_managed",
      "scope": "app",
      "managedProfileId": "glowbot-meta-oauth"
    },
    {
      "id": "meta-csv-upload",
      "displayName": "Upload CSV Export",
      "authMethodId": "csv_upload",
      "scope": "app"
    }
  ],
  "syncSchedule": {
    "backfillDefault": "90d",
    "liveInterval": "6h"
  },
  "metricsProduced": [
    "ad_spend", "ad_impressions", "ad_clicks",
    "ad_conversions", "ad_cost_per_result", "ad_reach"
  ]
}
```

---

## 3. Patient Now (EMR) Adapter

### 3.1 Fast Path: Clinic's Own API Key

**One of our clinics already has a Patient Now API key.** This is the fastest path.

**What you need**:
1. Clinic provides their API key + practice ID
2. Enter directly in GlowBot Integrations UI
3. Start pulling data immediately

If other clinics need API access, they contact PatientNow support directly: "I want API access to my own practice data." This is often faster than the formal partner route (days vs months) since the clinic already has a relationship.

### 3.2 Full Path: Partner Program

1. Contact PatientNow partnerships team
2. Sign NDA to receive API documentation
3. Execute BAA (HIPAA Business Associate Agreement)
4. 4-12 week timeline
5. Each clinic individually enabled by PatientNow

**If a clinic customer advocates**, this speeds up dramatically. Run this process in parallel — don't block on it.

### 3.3 CSV Fallback

PatientNow has reporting/export functionality. Clinic exports:
- Patient list (with created dates for new patient detection)
- Appointment report (booked, completed, no-show, cancelled)
- Treatment summary
- Revenue report (if accessible)

Required CSV columns:
- Appointments: `date`, `status` (booked/completed/no-show/cancelled), `patient_id`, `is_new_patient`
- Revenue: `date`, `amount`, `service_type`

### 3.4 API Details

**API**: REST API (private, documentation under NDA)

**Authentication**: API key in request headers, provisioned per-practice.

**Available data** (from partner integration reports):
- **Patients**: demographics, contact info, `created_date`
- **Appointments**: booked/confirmed/completed/no-show/cancelled, date
- **Treatments**: types and codes
- **Revenue**: invoice/payment data (availability varies by tier)
- **Leads**: inquiry data (may be available)

**Sync strategy**: **Polling only** — PatientNow has NO webhooks.
- Poll with `modified_since` parameter
- Poll interval: 5-15 minutes
- Track `last_sync_timestamp` per entity type

**Rate limits**: ~60-120 requests/minute (estimated)

**Backfill**: Date-range pagination. Plan for multi-hour backfill on large practices.

**HIPAA**: Encrypted transport (TLS), encrypted storage, BAA required. See `HIPAA_COMPLIANCE.md`.

### 3.5 Metrics Produced

`patients_new`, `patients_returning`, `appointments_booked`, `appointments_completed`, `appointments_noshow`, `appointments_cancelled`, `treatments_completed`, `revenue`

### 3.6 GlowBot Integration Metadata

```json
{
  "id": "patient-now-emr",
  "packageId": "patient-now-emr",
  "displayName": "Patient Now",
  "connectionProfiles": [
    {
      "id": "patient-now-csv-upload",
      "displayName": "Upload CSV Export",
      "authMethodId": "csv_upload",
      "scope": "app"
    }
  ],
  "syncSchedule": {
    "backfillDefault": "365d",
    "liveInterval": "15m"
  },
  "metricsProduced": [
    "patients_new", "patients_returning",
    "appointments_booked", "appointments_completed",
    "appointments_noshow", "appointments_cancelled",
    "treatments_completed", "revenue"
  ]
}
```

---

## 4. Zenoti (EMR) Adapter

### 4.1 Fast Path: Clinic's Own API Key

**We also have an API key from the clinics for Zenoti.**

**What you need**:
1. Clinic provides their Zenoti API key
2. Enter directly in GlowBot Integrations UI
3. Start pulling data immediately

### 4.2 Full Path: Partner Program

1. Apply at `zenoti.com/partners`
2. Technical review + NDA + partner agreement
3. Sandbox environment provisioned (2-6 weeks)
4. BAA required for PHI access

### 4.3 CSV Fallback

Zenoti has rich reporting. Export appointments, guests, invoices as CSV.

Required CSV columns:
- Appointments: `date`, `status`, `guest_id`, `is_new_guest`, `center_id`
- Revenue: `date`, `amount`, `service_category`, `center_id`

### 4.4 API Details

**API**: REST API (well-documented at `docs.zenoti.com`)

**Authentication**: OAuth 2.0 (Client Credentials) or API key.

**Key endpoints**:
- `GET /v1/appointments` — list with status filtering, date range
- `GET /v1/guests/search` — search by criteria, creation date
- `GET /v1/invoices` — invoices with line items, date range
- `GET /v1/services` — treatment catalog with categories
- `GET /v1/centers/{id}/appointments` — per-location filtering

**Appointment statuses**: Booked, Checked-In, Started, Closed (completed), No-Show, Cancelled.

**New patient detection**: `guest.creation_date`, `guest.first_visit_date`, `guest.visits_count`, `appointment.is_new` flag.

**Revenue data**: Full access — invoices, payments, line items, refunds.

**Sync strategy**: **Webhooks + Polling (hybrid)**
- Webhooks for: appointment created/updated/cancelled, guest created/updated, invoice closed
- Polling as reconciliation fallback (daily)
- Multi-location: adapter discovers all centers via `GET /v1/centers`, iterates each center's endpoints
- Each metric element tagged with `clinic_id` = Zenoti center ID for per-location breakdown

**Rate limits**: 100-300 requests/minute per organization. Rate limit headers returned.

**Backfill**: Efficient date-range pagination. 1-year backfill feasible in hours.

**Gotchas**: Multi-center data model (scope by `center_id`), guest deduplication/merging can change IDs, timezone handling varies by endpoint.

### 4.5 Metrics Produced

`patients_new`, `patients_returning`, `appointments_booked`, `appointments_completed`, `appointments_noshow`, `appointments_cancelled`, `treatments_completed`, `revenue`, `revenue_per_service_category`

### 4.6 GlowBot Integration Metadata

```json
{
  "id": "zenoti-emr",
  "packageId": "zenoti-emr",
  "displayName": "Zenoti",
  "connectionProfiles": [
    {
      "id": "glowbot-managed-zenoti",
      "displayName": "Connect with GlowBot Zenoti",
      "authMethodId": "zenoti_oauth_managed",
      "scope": "app",
      "managedProfileId": "glowbot-zenoti-oauth"
    },
    {
      "id": "zenoti-csv-upload",
      "displayName": "Upload CSV Export",
      "authMethodId": "csv_upload",
      "scope": "app"
    }
  ],
  "syncSchedule": {
    "backfillDefault": "365d",
    "liveInterval": "1h"
  },
  "metricsProduced": [
    "patients_new", "patients_returning",
    "appointments_booked", "appointments_completed",
    "appointments_noshow", "appointments_cancelled",
    "treatments_completed", "revenue", "revenue_per_service_category"
  ]
}
```

---

## 5. Google Adapter — Business Profile Service

### 5.1 Fast Path: Google Places API (New) + API Key

**No partner approval needed.** Enable Places API (New) on your existing Google Cloud project.

**What you get immediately**:
- Business name, address, phone, hours
- Average rating + total review count
- Up to 5 most relevant reviews (text + rating + timestamp)
- Photo references
- Place types/categories

**What you DON'T get** (requires partner approval):
- Performance metrics (impressions, clicks, calls, directions)
- All reviews (full history)
- Search keyword impressions

**Implementation**: Add `gog places` command group to gog CLI (see [`../proposals/GOG_ADS_EXTENSION.md`](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/proposals/GOG_ADS_EXTENSION.md)). The same shared `google` adapter package exposes this capability under the existing Google connection.

### 5.2 Full Path: Partner Approval + OAuth

1. Submit partner application for Google Business Profile APIs (**longest lead time — weeks to months**)
2. Once approved: OAuth with scope `https://www.googleapis.com/auth/business.manage`
3. Full access to: all reviews, daily performance metrics (18 months), search keyword impressions (6 months)

**Apply immediately** — this is the longest-lead item across all adapters.

### 5.3 CSV/Manual Fallback

- Google Business Profile dashboard → Performance → Export (if available)
- Google Takeout for review data export
- Manual entry form in GlowBot for key metrics (rating, review count, monthly views)

### 5.4 API Details

**Places API (New)** — the fast path:
```
GET https://places.googleapis.com/v1/places/{place_id}
  ?fields=displayName,rating,userRatingCount,reviews,
          formattedAddress,types,photos
  &key={API_KEY}
```

**Business Profile APIs** — the full path:
- `accounts/{id}/locations/{id}/reviews` — all reviews with pagination
- `locations/{id}:fetchMultiDailyMetricsTimeSeries` — daily performance metrics
- `locations/{id}:fetchSearchKeywordImpressions` — keyword data

**Available performance metrics** (partner-gated):
- `BUSINESS_IMPRESSIONS_DESKTOP_MAPS`, `BUSINESS_IMPRESSIONS_MOBILE_MAPS`
- `BUSINESS_IMPRESSIONS_DESKTOP_SEARCH`, `BUSINESS_IMPRESSIONS_MOBILE_SEARCH`
- `WEBSITE_CLICKS`, `CALL_CLICKS`, `BUSINESS_DIRECTION_REQUESTS`
- `BUSINESS_BOOKINGS` (if Reserve with Google configured)

**Rate limits**: 60 QPM general, 10-20 QPM for Performance API.

**Historical data**: 18 months metrics, all reviews, 6 months keyword data.

### 5.5 Metrics Produced

Fast path (Places API): `reviews_count`, `reviews_rating_avg`, `reviews_sample` (up to 5)

Full path (Partner API): `listing_views_search`, `listing_views_maps`, `listing_clicks_website`, `listing_clicks_directions`, `listing_clicks_phone`, `reviews_count`, `reviews_rating_avg`, `reviews_new`, `search_keyword_impressions`

### 5.6 Connection Surface

Google Business Profile does not create a second adapter identity in GlowBot.

- OAuth path: same `google` adapter connection as section 1.6
- quick-start path: same `google` connection with `place_id` fast-path fields
- CSV/manual fallback remains specific to Business Profile data, but still lands under the same Google integration

---

## 6. Apple Maps Adapter

### 6.1 Only Path: CSV Upload / Manual Entry

**No API exists for reviews or business analytics.** Apple Business Connect is dashboard-only.

Apple Maps does not have its own review system — it surfaces Yelp/TripAdvisor reviews. Apple introduced star ratings in 2024 but provides no API access.

### 6.2 Implementation

Simple manual data entry form + CSV upload:
- Apple Maps rating
- Review count
- Monthly listing views (if clinic can see in Apple Business Connect dashboard)

### 6.3 Priority

P2. Google covers 85-90%+ of local search in the US market. Revisit when Apple opens APIs.

**Future option**: If scale warrants, explore partnership with Yext/Uberall as a bridge for Apple Maps data.

### 6.4 GlowBot Integration Metadata

```json
{
  "id": "apple-maps",
  "packageId": "apple-maps",
  "displayName": "Apple Maps",
  "connectionProfiles": [
    {
      "id": "apple-maps-csv-upload",
      "displayName": "Upload CSV / Manual Entry",
      "authMethodId": "csv_upload",
      "scope": "app"
    }
  ],
  "syncSchedule": {
    "backfillDefault": "none",
    "liveInterval": "manual"
  },
  "metricsProduced": [
    "reviews_count", "reviews_rating_avg", "reviews_new"
  ]
}
```

---

## 7. CallRail Adapter (Call Tracking)

### Why CallRail

Phone calls are a major lead source for aesthetic clinics. Many patients call instead of booking online — especially older demographics and high-value treatment inquiries (full facelifts, body contouring). Without call tracking, you have a blind spot between ad click and booking.

CallRail is purpose-built for marketing call attribution. It tells you which ad, keyword, or campaign drove each phone call. This is critical data that no other adapter provides.

### 7.1 Fast Path: API Token

**What you need** (obtainable in 15 minutes):
1. CallRail account (Pro plan or higher for API access)
2. Go to Settings → API Access → Generate API key
3. Note your Account ID
4. Enter both in GlowBot Integrations UI
5. Start pulling call data immediately

### 7.2 Full Path: OAuth 2.0 + Webhooks

1. Register app with CallRail
2. OAuth 2.0 flow: `https://app.callrail.com/oauth/authorize`
3. Scopes: `read_call_data`, `read_companies`, `read_text_messages`
4. Configure webhooks for real-time call events: `call_created`, `call_complete`, `call_modified`

### 7.3 CSV Fallback

CallRail dashboard → Reports → Export CSV.

Required CSV columns:
- `started_at`, `duration`, `source`, `campaign`, `keywords`, `first_call`, `lead_status`

### 7.4 API Details

**API**: CallRail REST API v3

**Authentication**:
- API Token: `Authorization: Token token="YOUR_API_TOKEN"`
- OAuth 2.0: `Authorization: Bearer YOUR_OAUTH_TOKEN`

**Key endpoints**:
```
GET /v3/a/{account_id}/calls.json
  ?start_date=2026-01-01&end_date=2026-02-28
  &per_page=250
  &fields=id,start_time,duration,source,campaign,keywords,
          first_call,lead_status,value,customer_name,
          customer_phone_number,tracking_phone_number,
          tags,google_analytics_data
```

**Response includes**:
- `source`, `campaign`, `keywords` — full marketing attribution
- `first_call` (boolean) — new vs returning caller
- `lead_status` — lead qualification
- `value` — revenue attribution (if tagged)
- `tags` — e.g., `["new-patient", "booked"]`
- `google_analytics_data.gclid` — direct Google Ads click attribution
- `duration` — call quality indicator
- `transcription` — call content (if enabled)

**Webhooks**:
```
POST /v3/a/{account_id}/webhooks.json
{
  "webhook": {
    "url": "https://glowbot.app/webhooks/callrail",
    "events": ["call_created", "call_complete", "call_modified"],
    "format": "json"
  }
}
```

**Rate limits**: 10,000 requests/hour, 100/minute burst. Headers: `X-Rate-Limit-Remaining`, `X-Rate-Limit-Reset`.

**Backfill**: Full account history via date-range pagination.

### 7.5 Metrics Produced

`calls_total`, `calls_answered`, `calls_missed`, `calls_first_time`, `calls_duration_avg`, `calls_by_source`, `calls_by_campaign`, `leads_qualified`, `leads_converted`

### 7.6 GlowBot Integration Metadata

```json
{
  "id": "callrail",
  "packageId": "callrail",
  "displayName": "CallRail",
  "connectionProfiles": [
    {
      "id": "callrail-csv-upload",
      "displayName": "Upload CSV Export",
      "authMethodId": "csv_upload",
      "scope": "app"
    }
  ],
  "syncSchedule": {
    "backfillDefault": "365d",
    "liveInterval": "6h"
  },
  "metricsProduced": [
    "calls_total", "calls_answered", "calls_missed",
    "calls_first_time", "calls_duration_avg",
    "calls_by_source", "calls_by_campaign",
    "leads_qualified", "leads_converted"
  ]
}
```

---

## 8. Twilio Adapter (Communications Platform)

### Why Twilio

Some clinics already use Twilio for phone, SMS, or IVR. Twilio is a broader platform than CallRail — less marketing-attribution-native, but more flexible. Provides call logs, recordings, SMS history, and programmable voice insights. Essential for clinics already on the platform.

### 8.1 Fast Path: Account SID + Auth Token

**What you need** (obtainable in 10 minutes):
1. Log into Twilio Console → Account → API Keys & Tokens
2. Copy Account SID and Auth Token
3. Enter in GlowBot Integrations UI
4. Start pulling call logs immediately

### 8.2 Full Path: API Keys + StatusCallback Webhooks

1. Create API key in Twilio Console → API Keys (more secure, revocable)
2. Configure StatusCallback on phone numbers for real-time call events
3. Subaccounts for multi-location isolation

### 8.3 CSV Fallback

Twilio Console → Monitor → Logs → Calls → Export CSV.

Required CSV columns:
- `date_created`, `duration`, `from`, `to`, `direction`, `status`, `price`

### 8.4 API Details

**API**: Twilio REST API (2010-04-01)

**Authentication**:
- Basic Auth: `Authorization: Basic {base64(AccountSID:AuthToken)}`
- API Key Auth: `Authorization: Basic {base64(APIKeySID:APIKeySecret)}`

**Key endpoints**:
```
GET /2010-04-01/Accounts/{AccountSid}/Calls.json
  ?StartTime>=2026-01-01&EndTime<=2026-02-28
  &Status=completed
  &PageSize=1000
```

**Response includes**:
- `duration`, `status` (completed, busy, failed, no-answer)
- `direction` (inbound/outbound)
- `answered_by` (human/machine)
- `price`, `price_unit` — per-call cost
- `caller_name` — caller ID (if available)
- Subresource URIs for recordings and transcriptions

**Voice Insights** (advanced analytics):
```
GET /v1/Voice/{CallSid}/Summary
```
Provides call quality metrics, connection details, carrier information.

**Webhooks** via StatusCallback on phone numbers:
```xml
<Response>
  <Dial statusCallback="https://glowbot.app/webhooks/twilio"
        statusCallbackEvent="initiated ringing answered completed">
    <Number>+14155551212</Number>
  </Dial>
</Response>
```

**Rate limits**: 100 requests/second per account. Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`.

**Backfill**: 90 days via date-range pagination. Older data available via Bulk Export API.

### 8.5 Metrics Produced

`calls_total`, `calls_inbound`, `calls_outbound`, `calls_completed`, `calls_failed`, `calls_duration_avg`, `calls_cost_total`

### 8.6 GlowBot Integration Metadata

```json
{
  "id": "twilio",
  "packageId": "twilio",
  "displayName": "Twilio",
  "connectionProfiles": [
    {
      "id": "twilio-csv-upload",
      "displayName": "Upload CSV Export",
      "authMethodId": "csv_upload",
      "scope": "app"
    }
  ],
  "syncSchedule": {
    "backfillDefault": "90d",
    "liveInterval": "1h"
  },
  "metricsProduced": [
    "calls_total", "calls_inbound", "calls_outbound",
    "calls_completed", "calls_failed",
    "calls_duration_avg", "calls_cost_total"
  ]
}
```

---

## Adapter File Structure

Every adapter follows the same pattern:

```
adapters/{adapter-id}/
  manifest.json       # Auth types, sync config, metrics produced
  sync.ts             # Backfill + live sync implementation
  transform.ts        # Source data → NexusEvent with metric metadata
  validate.ts         # Connection test logic
  csv-import.ts       # CSV parsing + normalization (shared module)
```

The nex runtime provides:
- Connection and credential orchestration (from shared adapter auth methods plus GlowBot `connectionProfiles`)
- Sync scheduling (from manifest syncSchedule)
- UI rendering in Integrations page (from GlowBot `connectionProfiles`)
- Health monitoring and error reporting
- Supervision with exponential backoff restart (base 1s, 2x, max 5min)

An adapter author only writes the data-fetching and transformation logic. The adapter emits NexusEvents via stdout JSONL with metric data in `metadata` fields. A downstream `metric_extract` job (see DATA_PIPELINE.md) extracts these into metric elements in memory.db.

---

## Shared CSV Import Module

Since every adapter supports CSV fallback, build a shared module:

```typescript
// adapters/shared/csv-import.ts
interface CSVImportConfig {
  adapterId: string
  requiredColumns: string[]
  optionalColumns: string[]
  dateColumn: string
  transforms: Record<string, (value: string) => MetricRow[]>
}

function importCSV(config: CSVImportConfig, file: Buffer): MetricRow[] {
  // Parse CSV, validate columns, apply transforms, return metric rows
}
```

Each adapter provides its own `CSVImportConfig` mapping CSV columns to NexusEvents (which the metric_extract job then converts to elements).

---

# Life And Operator Adapter Expansion

**Status:** PROPOSAL
**Last Updated:** 2026-03-14
**Related:**
- [/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)
- [/Users/tyler/nexus/home/projects/nexus/docs/spec-standards.md](/Users/tyler/nexus/home/projects/nexus/docs/spec-standards.md)
- [/Users/tyler/nexus/home/projects/nexus/packages/adapters/git/docs/specs/ADAPTER_SPEC_GIT.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/git/docs/specs/ADAPTER_SPEC_GIT.md)
- [/Users/tyler/nexus/home/projects/nexus/packages/adapters/linkedin/docs/specs/ADAPTER_SPEC_LINKEDIN.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/linkedin/docs/specs/ADAPTER_SPEC_LINKEDIN.md)
- [/Users/tyler/nexus/home/projects/nexus/packages/adapters/apple-maps/docs/specs/ADAPTER_SPEC_APPLE_MAPS.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/apple-maps/docs/specs/ADAPTER_SPEC_APPLE_MAPS.md)

---

## Purpose

Define how Nexus should expand from work-facing adapters into personal finance,
infrastructure, commerce, and creator surfaces without inventing one-off
integration patterns.

The goal is not "connect everything" in the abstract.

The goal is:

1. give Nex durable access to the parts of life and operations that matter
2. make those integrations feel structurally consistent with existing adapters
3. avoid pretending every provider supports the same live API model
4. choose full adapters only where the provider surface justifies them

## Customer Experience

The target experience for Tyler is:

1. connect an account once through Nex
2. give the connection a stable runtime-owned `connection_id`
3. backfill useful historical state where the provider supports it
4. keep the connection fresh with monitor polling or webhooks where available
5. ask Nex questions across money, infra, stores, and creator surfaces without
   remembering vendor-specific APIs
6. optionally trigger safe writes where the provider supports them

The operator should not need to think about:

- token plumbing
- provider-specific pagination and endpoint shapes
- whether a given system is poll-based, webhook-based, or import-based
- ad hoc local scripts for each account

## Core Decision Rule

Each requested integration falls into one of two categories.

### Full adapter

Use a full adapter when the provider has:

1. an official or otherwise durable machine interface
2. stable credentials or OAuth suitable for Nex connections
3. repeatable read surfaces that justify typed methods or canonical records
4. enough surface area that setup, health, and runtime lifecycle matter

Full adapters usually expose:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `records.backfill` when history matters
- `adapter.monitor.start` when freshness matters
- typed methods for provider-native reads and writes

### Manual-first or aggregator-backed adapter

Use a manual-first adapter when the provider does not have a realistic direct
API for a self-serve Nex integration, but the data is still valuable.

This shape is still a real adapter, but it should be honest about the source:

- CSV import
- statement import
- exported activity files
- approved aggregator lane

These adapters should not fake live monitor or write support.

## Existing Adapter Pattern Summary

The current adapter corpus already shows three valid product shapes.

### Ingest-first shared adapters

Examples:

- Google
- Meta Ads
- Apple Maps

These exist to emit canonical records and normalize provider credentials into
runtime-owned `connection_id`.

### Delivery plus typed methods adapters

Examples:

- Git
- LinkedIn
- Qase

These combine stable connection setup with provider-native typed methods and,
when appropriate, a communication-shaped delivery surface.

### Manual-first adapters

Apple Maps is the clearest existing precedent that Nex does not need to fake a
live API where the provider surface is constrained.

That precedent is important for banking and brokerage systems that do not
provide a self-serve public API.

## Cross-Adapter Taxonomy Need

Before writing multiple finance and cloud adapters, Nexus should define shared
taxonomy docs for the overlapping nouns.

### Finance taxonomy

This should define the canonical meaning of:

- account
- balance snapshot
- transaction
- transfer
- statement
- holding
- position
- order
- activity event

Without this, `mercury`, `patelco`, and `fidelity` will drift into
provider-specific names that become hard to reconcile later.

### Cloud operator taxonomy

This should define the canonical meaning of:

- account
- project
- deployment
- domain
- zone
- resource
- service
- incident
- alarm
- cost event

Without this, `vercel`, `cloudflare`, `hetzner`, and `aws` will each create a
different routing and record vocabulary.

## Provider Recommendations

### Mercury

Recommendation: full adapter.

Reasoning:

1. Mercury exposes an official API surface.
2. The integration is valuable for balances, transactions, accounts, and money
   movement state.
3. The surface looks like an ingest plus typed-method adapter, not a messaging
   adapter.

Suggested v1 operations:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `records.backfill`
- `adapter.monitor.start`
- `mercury.accounts.list`
- `mercury.transactions.list`
- `mercury.balances.list`
- `mercury.recipients.list`

Suggested v1 non-goals:

- initiating money movement
- card controls
- approval workflows

### Patelco

Recommendation: manual-first adapter unless and until a real direct provider
integration path is available.

Reasoning:

1. The value is real.
2. The direct self-serve machine interface appears weak or absent.
3. Pretending this is a live API adapter would produce a brittle design.

Suggested v1 operations:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `records.backfill`
- `patelco.import.statement`
- `patelco.import.transactions`

Suggested v1 non-goals:

- live polling
- balance transfer
- bill pay

### Fidelity

Recommendation: manual-first adapter for retail brokerage data unless there is
an approved direct access lane that is actually available for a Nexus-owned
integration.

Reasoning:

1. Portfolio and activity data are valuable.
2. Retail brokerage access is usually constrained behind approved aggregator
   programs rather than an ordinary self-serve API.
3. A truthful manual-first design is better than a fake live adapter.

Suggested v1 operations:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `records.backfill`
- `fidelity.import.positions`
- `fidelity.import.activity`
- `fidelity.import.statements`

Suggested v1 non-goals:

- trade placement
- live streaming quotes
- options workflow support

### Shopify

Recommendation: full adapter.

Reasoning:

1. Shopify has a clear app and API model.
2. Orders, products, customers, and fulfillment state are all strong Nex data
   sources.
3. This is both a read and write candidate, but not a `channels.send` adapter.

Suggested v1 operations:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `records.backfill`
- `adapter.monitor.start`
- `shopify.orders.list`
- `shopify.orders.get`
- `shopify.products.list`
- `shopify.products.get`
- `shopify.customers.list`
- `shopify.fulfillments.list`

Suggested v1 non-goals:

- theme editing
- checkout customization
- marketing automation

### Vercel

Recommendation: full adapter.

Reasoning:

1. Vercel has a clean operator-facing API surface.
2. Projects, deployments, domains, and environment variables are all useful
   Nex operator surfaces.
3. This should be a typed-method adapter with optional event ingest.

Suggested v1 operations:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `records.backfill`
- `adapter.monitor.start`
- `vercel.projects.list`
- `vercel.deployments.list`
- `vercel.deployments.get`
- `vercel.domains.list`
- `vercel.env.list`

Suggested v1 non-goals:

- full log retention mirror
- every Vercel edge/runtime feature

### Cloudflare

Recommendation: full adapter.

Reasoning:

1. Cloudflare has a broad API surface that maps well onto Nex typed methods.
2. DNS, zones, Pages, Workers, and account-level operations are valuable.
3. This is a strong operator adapter with high day-to-day utility.

Suggested v1 operations:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `records.backfill`
- `adapter.monitor.start`
- `cloudflare.zones.list`
- `cloudflare.dns.list`
- `cloudflare.pages.projects.list`
- `cloudflare.workers.list`
- `cloudflare.audit.list`

Suggested v1 non-goals:

- full CDN analytics warehousing
- every security product in the Cloudflare catalog

### Hetzner

Recommendation: full adapter.

Reasoning:

1. Hetzner Cloud has a straightforward infrastructure API.
2. Servers, volumes, networks, firewalls, and actions are all good typed
   operator methods.
3. This should feel like a narrower and cleaner infrastructure adapter than
   AWS.

Suggested v1 operations:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `records.backfill`
- `adapter.monitor.start`
- `hetzner.servers.list`
- `hetzner.servers.get`
- `hetzner.actions.list`
- `hetzner.networks.list`
- `hetzner.firewalls.list`

Suggested v1 non-goals:

- Kubernetes orchestration
- every product outside the core cloud surface

### AWS

Recommendation: full adapter, but only with a narrow v1.

Reasoning:

1. AWS is too broad for a vague "connect AWS" spec.
2. The right first customer experience is operator awareness, not total AWS
   coverage.
3. A tight v1 can still be extremely useful.

Suggested v1 scope:

- account identity
- resource inventory
- CloudWatch alarms
- cost visibility
- tag-based search

Suggested v1 operations:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `records.backfill`
- `adapter.monitor.start`
- `aws.accounts.list`
- `aws.resources.list`
- `aws.alarms.list`
- `aws.costs.get`
- `aws.tags.search`

Suggested v1 non-goals:

- generic execution over every AWS API
- provisioning arbitrary infrastructure
- IAM mutation flows

### YouTube

Recommendation: full adapter, read-first.

Reasoning:

1. YouTube has strong official data and analytics surfaces.
2. The most useful first experience is channel, video, comment, and analytics
   visibility.
3. Publishing and upload flows can come later.

Suggested v1 operations:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `records.backfill`
- `adapter.monitor.start`
- `youtube.channels.list`
- `youtube.videos.list`
- `youtube.playlists.list`
- `youtube.comments.list`
- `youtube.analytics.get`

Suggested v1 non-goals:

- video upload
- livestream management
- Studio workflow parity

## Recommended Order

Recommended sequence for spec and implementation:

1. finance taxonomy proposal
2. cloud operator taxonomy proposal
3. `mercury`
4. `shopify`
5. `vercel`
6. `cloudflare`
7. `aws`
8. `hetzner`
9. `youtube`
10. `patelco`
11. `fidelity`

Reasoning:

1. Mercury is the best finance candidate for a real adapter.
2. Shopify, Vercel, and Cloudflare are high-value and have clear provider
   surfaces.
3. AWS needs a tight scope but is worth doing once the cloud taxonomy is
   explicit.
4. Patelco and Fidelity should not be forced into fake live-adapter designs.

## Spec Writing Plan

After this proposal, the next spec pass should be:

1. write one finance taxonomy proposal
2. write one cloud operator taxonomy proposal
3. write canonical adapter specs for `mercury`, `shopify`, `vercel`, and
   `cloudflare`
4. write a narrower canonical adapter spec for `aws`
5. write canonical manual-first specs for `patelco` and `fidelity`

Each adapter spec should explicitly answer:

1. customer experience
2. adapter identity
3. auth model
4. connection model
5. operations
6. record model
7. typed methods
8. setup and health expectations
9. non-goals
10. done definition

## Validation Direction

Validation should prove four things for each new adapter:

1. setup produces a durable runtime-owned `connection_id`
2. `adapter.health` is truthful about real provider reachability
3. backfill and monitor produce the same canonical model
4. typed methods return stable provider-native identifiers without leaking
   transport-specific hacks into callers

For manual-first adapters, validation should instead prove:

1. import succeeds from supported files
2. imported records are canonical and restart-safe
3. the adapter does not claim unsupported live behavior

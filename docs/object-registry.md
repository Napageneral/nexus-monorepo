# Nex and MoonSleep canonical object registry

Status: **proposed_canonical**
Schema version: **1.0.0**
Registry ID: `nex.moonsleep.object-registry`

> This document is generated from `contracts/object-registry/v1/registry.json`.
> Edit the registry, then run `node contracts/object-registry/v1/registry-tools.mjs --write`.

## Scope and decision rule

Canonical reuse and ownership index for Nex evidence, identity, communication, orchestration, and MoonSleep operational objects used by the reviewed-interpretation tracks. It points to owning schemas and read contracts; it does not copy their data or create a parallel business model.

Lookup order: `exact object` → `alias` → `more general object` → `owning-domain extension` → `new object`.

A proposal may conclude only `reuse`, `generalize`, or `create`. A new object is valid only after the registry search, owner and identity distinction, relationship review, and alias or migration plan are recorded.

## Reading the catalog

- **Canonical owner** says who controls identity and business truth.
- **Canonical storage** names the real owning table or runtime surface; a projection or reference never becomes a second owner.
- **Observation target** says whether reviewed Observations may address the object directly, through an owner adapter, or not at all.
- **Action authority** is separate from evidence and semantic acceptance. It is explicit per object and never inherited merely because an Observation or projection was accepted.

## MoonSleep claims

| Object | Class | Status | Canonical owner | Stable identity | Observation target |
| --- | --- | --- | --- | --- | --- |
| [Carrier Case](#moonsleepcarrier_case) | business_resource | deployed | Claims and carrier/provider | carrier_case_id; natural uniqueness provider_name plus provider_account_ref plus external_case_number when present | through_owner_adapter |
| [Carrier Case Event](#moonsleepcarrier_case_event) | typed_supporting_object | deployed | Claims | carrier_case_event_id; unique carrier_case_id plus idempotency_fingerprint_sha256 | through_owner_adapter |
| [Carrier Incident](#moonsleepcarrier_incident) | business_resource | deployed | Claims | incident_id | through_owner_adapter |
| [Carrier Recovery Receipt](#moonsleepcarrier_recovery_receipt) | business_resource | deployed | Claims for case linkage; Finance for cash/accounting meaning | carrier_recovery_receipt_id; unique source_system plus source_reference | through_owner_adapter |

<a id="moonsleepcarrier_case"></a>

### Carrier Case

`moonsleep.carrier_case` · business_resource · deployed

Provider-native claim, trace, or recovery case associated with an operational Carrier Incident.

**Stable identity:** carrier_case_id; natural uniqueness provider_name plus provider_account_ref plus external_case_number when present

**Revision identity:** Carrier Case Events

**Canonical storage/read custody:**

- MoonSleep Ops: `public.carrier_cases` (canonical; identity `carrier_case_id`)

**Key fields:** `carrier_case_id`, `incident_id`, `provider_name`, `provider_account_ref`, `external_case_number`, `case_type`, `status`, `filed_at`, `requested_amount`, `approved_amount`, `next_action`.

**Relationships:**

- `concerns_incident` → `moonsleep.carrier_incident` (one; owner: Claims)
- `has_event` → `moonsleep.carrier_case_event` (many; owner: Claims)
- `has_recovery` → `moonsleep.carrier_recovery_receipt` (optional_many; owner: Claims and Finance)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `provider claim`, `carrier trace`.

**Do not recreate:** provider acknowledgment as approval or recovery.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/carrier_incidents_postgres.sql`
- `moonsleep-v1:infra/ops-analytics/sql/carrier_claims_provenance_postgres.sql`
- `moonsleep-v1:infra/ops-analytics/sql/claims_reviewed_projection_v1_postgres.sql`

<a id="moonsleepcarrier_case_event"></a>

### Carrier Case Event

`moonsleep.carrier_case_event` · typed_supporting_object · deployed

Immutable event in one Carrier Case, with exact source and idempotency custody.

**Stable identity:** carrier_case_event_id; unique carrier_case_id plus idempotency_fingerprint_sha256

**Revision identity:** Immutable append-only event

**Canonical storage/read custody:**

- MoonSleep Ops: `public.carrier_case_events` (canonical; identity `carrier_case_event_id`)

**Key fields:** `carrier_case_event_id`, `carrier_case_id`, `event_type`, `event_at`, `summary`, `payload`, `actor`, `source_revision_refs`, `idempotency_fingerprint_sha256`.

**Relationships:**

- `event_for` → `moonsleep.carrier_case` (one; owner: Claims)
- `sourced_from` → `nex.record_revision` (optional_many; owner: Nex Records)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `claim event`.

**Do not recreate:** event as business Resource when it only changes a Case.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/carrier_incidents_postgres.sql`
- `moonsleep-v1:infra/ops-analytics/sql/carrier_claims_provenance_postgres.sql`
- `moonsleep-v1:infra/ops-analytics/sql/claims_reviewed_projection_v1_postgres.sql`

<a id="moonsleepcarrier_incident"></a>

### Carrier Incident

`moonsleep.carrier_incident` · business_resource · deployed

MoonSleep operational incident affecting an Order or fulfillment package, independent from a provider claim case.

**Stable identity:** incident_id

**Revision identity:** Incident events and reviewed attribute/relationship Observations

**Canonical storage/read custody:**

- MoonSleep Ops: `public.carrier_incidents` (canonical; identity `incident_id`)

**Key fields:** `incident_id`, `order_ref`, `helpdesk_ref`, `reason`, `summary`, `discovered_at`, `operational_state`, `next_action`, `due_at`, `closure`, `outcome`, `cost`, `confidence`.

**Relationships:**

- `for_order` → `moonsleep.commerce_order` (optional_one; owner: Claims)
- `affects_package` → `moonsleep.fulfillment_package` (optional_many; owner: Claims and Dispatch)
- `has_case` → `moonsleep.carrier_case` (optional_many; owner: Claims)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `Claim incident`, `shipping claim`.

**Do not recreate:** customer issue copied as carrier incident; delivery status as customer possession.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/carrier_incidents_postgres.sql`
- `moonsleep-v1:docs/specs/moonsleep-ops-object-workspace.md`

<a id="moonsleepcarrier_recovery_receipt"></a>

### Carrier Recovery Receipt

`moonsleep.carrier_recovery_receipt` · business_resource · deployed

Exact provider credit, remittance, or recovery receipt tied to a Carrier Case. Provider status alone is not recovery.

**Stable identity:** carrier_recovery_receipt_id; unique source_system plus source_reference

**Revision identity:** Immutable provider receipt and reconciliation history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.carrier_recovery_receipts` (canonical; identity `carrier_recovery_receipt_id`)

**Key fields:** `carrier_recovery_receipt_id`, `carrier_case_id`, `source_system`, `source_reference`, `amount`, `currency`, `received_at`, `reconciliation_state`.

**Relationships:**

- `recovers_case` → `moonsleep.carrier_case` (one; owner: Claims)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `claim recovery`.

**Do not recreate:** claim closure as financial recovery.

**Open questions:** Provider credit and remittance links to Finance need a shared typed contract.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/carrier_incidents_postgres.sql`
- `moonsleep-v1:infra/ops-analytics/sql/carrier_claims_provenance_postgres.sql`
- `moonsleep-v1:infra/ops-analytics/sql/claims_reviewed_projection_v1_postgres.sql`

## MoonSleep commerce

| Object | Class | Status | Canonical owner | Stable identity | Observation target |
| --- | --- | --- | --- | --- | --- |
| [Commerce Order](#moonsleepcommerce_order) | business_resource | deployed | Commerce provider with Nex canonical commerce reference | provider platform plus provider order ID, represented by commerce_order ID/order_key | through_owner_adapter |
| [Commerce Order Line](#moonsleepcommerce_order_line) | business_resource | deployed | Commerce provider | provider line ID represented by line_key | through_owner_adapter |
| [Refund](#moonsleeprefund) | business_resource | deployed | Commerce provider and Finance readback | provider refund ID/refund_key | through_owner_adapter |
| [Return Case](#moonsleepreturn_case) | business_resource | deployed | Returns domain | return_case_id | through_owner_adapter |

<a id="moonsleepcommerce_order"></a>

### Commerce Order

`moonsleep.commerce_order` · business_resource · deployed

Provider-native commerce order with stable Nex identity and MoonSleep operational projection. Shopify, Amazon, and TikTok retain provider truth.

**Stable identity:** provider platform plus provider order ID, represented by commerce_order ID/order_key

**Revision identity:** commerce_order_revisions and provider events

**Canonical storage/read custody:**

- Nex PostgreSQL: `nex_runtime.commerce_orders` (canonical; identity `id`)
- Nex PostgreSQL: `nex_runtime.commerce_order_revisions` (canonical)
- MoonSleep Ops: `public.fact_order` (projection; identity `order_key`)

**Key fields:** `order_id`, `provider_order_id`, `order_number`, `customer_entity_id`, `customer_contact_id`, `created_at`, `currency`, `financial_status`, `fulfillment_status`, `shipping_address`, `billing_address`.

**Relationships:**

- `placed_by` → `moonsleep.customer` (optional_one; owner: Commerce and Identity)
- `has_line` → `moonsleep.commerce_order_line` (many; owner: Commerce)
- `has_refund` → `moonsleep.refund` (optional_many; owner: Commerce)
- `has_obligation` → `moonsleep.fulfillment_obligation` (optional_many; owner: Dispatch)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `Order`, `Shopify Order`, `fact_order`.

**Do not recreate:** Customer-service-local Order; order number alone as cross-provider identity; current projection backdated as historical truth.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-ops-object-workspace.md`
- `moonsleep-v1:docs/specs/moonsleep-order-journey.md`

<a id="moonsleepcommerce_order_line"></a>

### Commerce Order Line

`moonsleep.commerce_order_line` · business_resource · deployed

Provider-native order line carrying purchased product/variant, quantity, and price identity.

**Stable identity:** provider line ID represented by line_key

**Revision identity:** commerce line observations and provider revisions

**Canonical storage/read custody:**

- Nex PostgreSQL: `nex_runtime.commerce_line_items` (canonical; identity `id`)
- MoonSleep Ops: `public.fact_order_line` (projection; identity `line_key`)

**Key fields:** `line_key`, `order_key`, `provider_line_id`, `sku`, `variant_id`, `quantity`, `unit_price`, `currency`.

**Relationships:**

- `belongs_to_order` → `moonsleep.commerce_order` (one; owner: Commerce)
- `requires_fulfillment` → `moonsleep.fulfillment_obligation` (optional_many; owner: Dispatch)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `Order Item`, `fact_order_line`.

**Do not recreate:** product description as line identity.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-ops-object-workspace.md`

<a id="moonsleeprefund"></a>

### Refund

`moonsleep.refund` · business_resource · deployed

Provider-native refund or adjustment with exact amount, currency, timing, and owning Order. A refund statement in email is not a Refund receipt.

**Stable identity:** provider refund ID/refund_key

**Revision identity:** Provider refund events and immutable readback

**Canonical storage/read custody:**

- MoonSleep Ops: `public.fact_refund` (canonical; identity `refund_key`)

**Key fields:** `refund_key`, `order_key`, `refund_created_at`, `amount`, `currency`, `provider_status`, `source_reference`.

**Relationships:**

- `refunds_order` → `moonsleep.commerce_order` (one; owner: Commerce)
- `may_satisfy_commitment` → `moonsleep.commitment` (optional_many; owner: Commitment owner)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `refund event`, `price adjustment`.

**Do not recreate:** zero-dollar edit treated as monetary refund; email promise treated as refund completion.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-customer-operations.md`
- `moonsleep-v1:docs/specs/moonsleep-ops-object-workspace.md`

<a id="moonsleepreturn_case"></a>

### Return Case

`moonsleep.return_case` · business_resource · deployed

Canonical return request and lifecycle with provider readback, policy decision, affected lines, physical return path, and refund relationship.

**Stable identity:** return_case_id

**Revision identity:** Return lifecycle events and policy decisions

**Canonical storage/read custody:**

- MoonSleep Ops: `public.fulfillment_return_cases` (canonical; identity `return_case_id`)
- MoonSleep Ops: `public.fulfillment_return_policy_decisions` (canonical)

**Key fields:** `return_case_id`, `order_key`, `customer_ref`, `request_state`, `reason`, `policy_decision`, `received_state`, `refund_ref`.

**Relationships:**

- `for_order` → `moonsleep.commerce_order` (one; owner: Returns)
- `results_in_refund` → `moonsleep.refund` (optional_many; owner: Returns and Commerce)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `Return`.

**Do not recreate:** return question as executed Return; policy answer as Return receipt.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/fulfillment_returns_policy_v2_postgres.sql`
- `moonsleep-v1:docs/specs/moonsleep-ops-object-workspace.md`

## MoonSleep finance

| Object | Class | Status | Canonical owner | Stable identity | Observation target |
| --- | --- | --- | --- | --- | --- |
| [Accounting Period](#moonsleepaccounting_period) | typed_supporting_object | implemented | Finance ledger | period_id | through_owner_adapter |
| [Cash or Card Source Account](#moonsleepcash_card_account) | typed_supporting_object | deployed | Provider for native identity; Finance for governed registration | cash_card_account_id derived from source_system plus source_environment plus source_account_ref_sha256 | through_owner_adapter |
| [Finance AP Party](#moonsleepfinance_ap_party) | typed_supporting_object | implemented | Finance Accounts Payable subledger | ap_party_id derived and guarded from identity_material_sha256 | through_owner_adapter |
| [Finance Evidence Object](#moonsleepfinance_evidence_object) | evidence_custody | deployed | Finance evidence registry | evidence_object_id derived from content_sha256 | not_applicable |
| [Finance Local Observation Compatibility](#moonsleepfinance_observation_compat) | compatibility_alias | compatibility | Finance compatibility; Nex owns semantic Observations | ap_observation_id; fact-link identity ap_observation_fact_link_id | compatibility_only |
| [Finance Source Manifest](#moonsleepfinance_source_manifest) | evidence_custody | deployed | Finance evidence registry | source_manifest_id; unique source_stream_id plus manifest_sequence | not_applicable |
| [Finance Source Record Bridge](#moonsleepfinance_source_record_bridge) | compatibility_alias | compatibility | Finance evidence bridge; Nex owns general Record and Record Revision evidence | source_record_id; unique source_system plus external_reference plus content_sha256 | compatibility_only |
| [Finance Source Stream](#moonsleepfinance_source_stream) | evidence_custody | deployed | Finance evidence registry | source_stream_id with natural uniqueness source_system plus source_environment plus source_account_ref plus stream_name | not_applicable |
| [Financial Account](#moonsleepfinancial_account) | business_resource | implemented | Finance ledger | account_id | through_owner_adapter |
| [Financial Transaction](#moonsleepfinancial_transaction) | business_resource | deployed | Provider for native truth; Finance for owned history and classification | cash_card_account_id plus external_transaction_ref_sha256, represented by transaction_id | through_owner_adapter |
| [Invoice](#moonsleepinvoice) | business_resource | deployed | Finance Accounts Payable | ap_invoice_id derived from stable_invoice_identity_sha256 and ap_party_id | through_owner_adapter |
| [Invoice Line](#moonsleepinvoice_line) | typed_supporting_object | implemented | Finance Accounts Payable | ap_invoice_line_id within Invoice Revision | through_owner_adapter |
| [Invoice Revision](#moonsleepinvoice_revision) | typed_supporting_object | implemented | Finance Accounts Payable | ap_invoice_revision_id | through_owner_adapter |
| [Journal Entry](#moonsleepjournal_entry) | business_resource | implemented | Finance ledger | entry_id; document_reference and idempotency_key are separately unique while payload_sha256 is content custody | through_owner_adapter |
| [Journal Line](#moonsleepjournal_line) | typed_supporting_object | implemented | Finance ledger | journal_line_id within entry | through_owner_adapter |
| [Payment](#moonsleeppayment) | business_resource | deployed | Provider for execution; Finance for governed identity and matching | provider_name plus provider_object_identity_sha256 represented by ap_payment_order_id | through_owner_adapter |
| [Payment Application](#moonsleeppayment_application) | typed_supporting_object | implemented | Finance | ap_invoice_payment_allocation_id | through_owner_adapter |

<a id="moonsleepaccounting_period"></a>

### Accounting Period

`moonsleep.accounting_period` · typed_supporting_object · implemented

Bounded accounting period whose only allowed state chain is open to review_only to locked. Locked periods are immutable; cross-layer freshness remains separate report data.

**Stable identity:** period_id

**Revision identity:** Append-only finance.audit_events with subject_area accounting_period and event_action period_state_changed; no reopen path

**Canonical storage/read custody:**

- MoonSleep Finance: `finance.accounting_periods` (canonical; identity `period_id`)
- MoonSleep Finance: `finance.audit_events` (canonical)

**Key fields:** `period_id`, `period_start`, `period_end`, `period_state`, `locked_at`, `locked_by`.

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `close period`.

**Do not recreate:** one freshness timestamp for all Finance layers; locked period reopened in place.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/finance_ledger_postgres.sql`
- `moonsleep-v1:docs/specs/moonsleep-finance-cockpit-and-bookkeeping.md`

<a id="moonsleepcash_card_account"></a>

### Cash or Card Source Account

`moonsleep.cash_card_account` · typed_supporting_object · deployed

Registered provider-native cash, credit-card, or charge-card account. It has its own identity and optionally links to an exact Financial Account revision.

**Stable identity:** cash_card_account_id derived from source_system plus source_environment plus source_account_ref_sha256

**Revision identity:** cash_card_account_revision_id, revision_number, and effective_on

**Canonical storage/read custody:**

- MoonSleep Finance: `finance.cash_card_accounts and finance.cash_card_account_revisions` (canonical; identity `cash_card_account_id`)

**Key fields:** `cash_card_account_id`, `account_category`, `source_system`, `source_environment`, `source_account_ref_sha256`, `cash_card_account_revision_id`, `revision_number`, `effective_on`, `sanitized_label`, `account_status`, `ledger_account_revision_id`.

**Relationships:**

- `maps_to_account` → `moonsleep.financial_account` (optional_one; owner: Finance)
- `has_transaction` → `moonsleep.financial_transaction` (optional_many; owner: Finance)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `bank source account`, `card source account`.

**Do not recreate:** provider account mapping as a ledger account.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/finance_cash_card_postgres.sql`

<a id="moonsleepfinance_ap_party"></a>

### Finance AP Party

`moonsleep.finance_ap_party` · typed_supporting_object · implemented

Stable AP subledger party identity referenced by Invoices. It is not another Organization and must crosswalk to a canonical Partner or Nex Organization Entity before claiming shared identity.

**Stable identity:** ap_party_id derived and guarded from identity_material_sha256

**Revision identity:** party_status and source evidence; shared Organization equivalence remains reviewed

**Canonical storage/read custody:**

- MoonSleep Finance: `finance.ap_parties` (canonical; identity `ap_party_id`)

**Key fields:** `ap_party_id`, `sanitized_name`, `party_status`, `first_source_record_id`, `identity_material_sha256`, `idempotency_key_sha256`.

**Relationships:**

- `first_evidenced_by` → `moonsleep.finance_source_record_bridge` (one; owner: Finance)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `AP supplier party`.

**Do not recreate:** AP Party as canonical Organization; provider recipient as durable Partner identity.

**Open questions:** Mandatory crosswalk to Partner or Nex Entity is unresolved.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/finance_accounts_payable_postgres.sql`

<a id="moonsleepfinance_evidence_object"></a>

### Finance Evidence Object

`moonsleep.finance_evidence_object` · evidence_custody · deployed

Content-addressed encrypted Finance evidence object with separate envelope, key-wrapper, and storage-location custody. It is source material, never an Invoice, Payment, Transaction, or semantic Observation by itself.

**Stable identity:** evidence_object_id derived from content_sha256

**Revision identity:** Immutable content object; new bytes create a new identity

**Canonical storage/read custody:**

- MoonSleep Finance: `finance.evidence_objects, finance.evidence_encryption_envelopes, finance.evidence_key_wrappers, finance.evidence_locations` (canonical; identity `evidence_object_id`)

**Key fields:** `evidence_object_id`, `content_sha256`, `content_bytes`, `media_type`, `original_filename`, `sensitivity_class`, `encryption_envelope_id`, `evidence_location_id`.

**Projection/action boundary:** Observation target `not_applicable`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `Finance evidence blob`.

**Do not recreate:** one evidence object as one Invoice; encrypted envelope as business Resource.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/finance_evidence_postgres.sql`

<a id="moonsleepfinance_observation_compat"></a>

### Finance Local Observation Compatibility

`moonsleep.finance_observation_compat` · compatibility_alias · compatibility

Existing Finance-local observation and fact-link tables retained for compatibility. They may reference or project canonical Nex semantics but must not create an independent Observation history.

**Stable identity:** ap_observation_id; fact-link identity ap_observation_fact_link_id

**Revision identity:** Compatibility only; superseded_observation_id mirrors local linkage while canonical predecessor chain is nex.observation

**Canonical storage/read custody:**

- MoonSleep Finance: `finance.ap_observations and finance.ap_observation_fact_links` (compatibility; identity `ap_observation_id`)

**Key fields:** `ap_observation_id`, `nex_observation_id`, `resolution_state`, `superseded_observation_id`, `source_record_id`, `ap_observation_fact_link_id`, `nex_fact_id`, `fact_relationship`.

**Relationships:**

- `references_observation` → `nex.observation` (one; owner: Nex Memory evidence)
- `references_fact` → `nex.fact` (optional_many; owner: Nex Memory evidence)

**Projection/action boundary:** Observation target `compatibility_only`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `finance.ap_observations`.

**Do not recreate:** second Finance Fact/Observation authority.

**Open questions:** Define retirement or regeneration from canonical Nex Observations.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/finance_accounts_payable_postgres.sql`

<a id="moonsleepfinance_source_manifest"></a>

### Finance Source Manifest

`moonsleep.finance_source_manifest` · evidence_custody · deployed

Immutable finalized or quarantined coverage manifest tying a source-stream revision to evidence objects and control results.

**Stable identity:** source_manifest_id; unique source_stream_id plus manifest_sequence

**Revision identity:** A new capture creates a new manifest sequence; finalized manifests are immutable

**Canonical storage/read custody:**

- MoonSleep Finance: `finance.source_manifests, finance.source_manifest_objects, finance.source_control_results` (canonical; identity `source_manifest_id`)

**Key fields:** `source_manifest_id`, `source_stream_id`, `stream_revision_id`, `manifest_sequence`, `coverage_start_at`, `coverage_end_at`, `capture_method`, `adapter_revision`, `manifest_state`, `prior_manifest_sha256`, `manifest_sha256`, `acquired_at`.

**Relationships:**

- `manifest_for_stream` → `moonsleep.finance_source_stream` (one; owner: Finance evidence registry)
- `contains_evidence_object` → `moonsleep.finance_evidence_object` (many; owner: Finance evidence registry)

**Projection/action boundary:** Observation target `not_applicable`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `Finance capture manifest`.

**Do not recreate:** manifest as Invoice, Payment, or Transaction.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/finance_evidence_postgres.sql`

<a id="moonsleepfinance_source_record_bridge"></a>

### Finance Source Record Bridge

`moonsleep.finance_source_record_bridge` · compatibility_alias · compatibility

Finance-owned immutable source reference used by ledger and AP foreign keys. It is a custody bridge, not a second semantic Record system.

**Stable identity:** source_record_id; unique source_system plus external_reference plus content_sha256

**Revision identity:** Content-addressed immutable capture

**Canonical storage/read custody:**

- MoonSleep Finance: `finance.source_records` (compatibility; identity `source_record_id`)

**Key fields:** `source_record_id`, `source_system`, `external_reference`, `document_type`, `storage_uri`, `content_sha256`, `content_bytes`, `coverage_start`, `coverage_end`, `captured_at`, `metadata_json`.

**Relationships:**

- `may_reference_record` → `nex.record` (optional_one; owner: Nex Records)
- `may_reference_revision` → `nex.record_revision` (optional_one; owner: Nex Records)

**Projection/action boundary:** Observation target `compatibility_only`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `finance.source_records`.

**Do not recreate:** Finance-local semantic Record history.

**Open questions:** Exact mandatory Nex Record Revision crosswalk is not universal.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/finance_ledger_postgres.sql`

<a id="moonsleepfinance_source_stream"></a>

### Finance Source Stream

`moonsleep.finance_source_stream` · evidence_custody · deployed

Registered Finance source lane, revisioned extraction contract, and required control set. It governs coverage and capture; it is not a Financial Account or business Resource.

**Stable identity:** source_stream_id with natural uniqueness source_system plus source_environment plus source_account_ref plus stream_name

**Revision identity:** stream_revision_id and revision_number

**Canonical storage/read custody:**

- MoonSleep Finance: `finance.source_streams, finance.source_stream_revisions, finance.source_stream_required_controls` (canonical; identity `source_stream_id`)

**Key fields:** `source_stream_id`, `source_system`, `source_environment`, `source_account_ref`, `stream_name`, `stream_revision_id`, `revision_number`, `effective_on`, `stream_status`, `expected_cadence`, `coverage_boundary_semantics`, `extraction_method`, `source_owner`, `reconciliation_target`.

**Relationships:**

- `has_manifest` → `moonsleep.finance_source_manifest` (many; owner: Finance evidence registry)

**Projection/action boundary:** Observation target `not_applicable`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `Finance source lane`.

**Do not recreate:** source stream as Financial Account.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/finance_evidence_postgres.sql`

<a id="moonsleepfinancial_account"></a>

### Financial Account

`moonsleep.financial_account` · business_resource · implemented

Stable general-ledger account identity. Provider-native cash and card registrations are separate supporting objects and may optionally bind an exact Account Revision.

**Stable identity:** account_id

**Revision identity:** account_revision_id and revision_number effective_on

**Canonical storage/read custody:**

- MoonSleep Finance: `finance.ledger_accounts` (canonical; identity `account_id`)
- MoonSleep Finance: `finance.account_revisions` (canonical; identity `account_revision_id`)
- MoonSleep Finance: `finance.external_account_refs` (reference)

**Key fields:** `account_id`, `account_code`, `account_revision_id`, `revision_number`, `effective_on`, `account_name`, `account_classification`, `account_type`, `account_subtype`, `normal_balance`, `parent_account_id`, `account_status`, `posting_allowed`.

**Relationships:**

- `has_provider_registration` → `moonsleep.cash_card_account` (optional_many; owner: Finance)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `ledger account`, `GL account`.

**Do not recreate:** supplier-specific GL account for AP detail; provider mapping as another ledger account.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/finance_ledger_postgres.sql`

<a id="moonsleepfinancial_transaction"></a>

### Financial Transaction

`moonsleep.financial_transaction` · business_resource · deployed

Provider-native cash or card transaction with append-only revisions and an explicitly selected logical current head.

**Stable identity:** cash_card_account_id plus external_transaction_ref_sha256, represented by transaction_id

**Revision identity:** transaction_revision_id and revision_number; selected logical head is a read contract

**Canonical storage/read custody:**

- MoonSleep Finance: `finance.cash_card_transactions` (canonical; identity `transaction_id`)
- MoonSleep Finance: `finance.cash_card_transaction_revisions` (canonical; identity `transaction_revision_id`)

**Key fields:** `transaction_id`, `transaction_revision_id`, `cash_card_account_id`, `transaction_state`, `transaction_date`, `posted_date`, `signed_amount_minor_units`, `currency_code`, `source_row_sha256`, `revision_sha256`.

**Relationships:**

- `in_account` → `moonsleep.cash_card_account` (one; owner: Finance)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `cash transaction`, `card transaction`.

**Do not recreate:** raw, compact, or projected view as another transaction system; amount match as identity.

**Open questions:** Typed reconciliation to Payment, Refund, Invoice, and Journal requires a registered join object.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/finance_cash_card_postgres.sql`
- `moonsleep-v1:infra/ops-analytics/sql/finance_source_compact_projection_postgres.sql`

<a id="moonsleepinvoice"></a>

### Invoice

`moonsleep.invoice` · business_resource · deployed

Stable payable document identity for one supplier obligation. An email, attachment, candidate, queue row, or payment notice is not an Invoice.

**Stable identity:** ap_invoice_id derived from stable_invoice_identity_sha256 and ap_party_id

**Revision identity:** ap_invoice_revision_id with monotonic sequence and superseded_revision_id

**Canonical storage/read custody:**

- MoonSleep Finance: `finance.ap_invoices` (canonical; identity `ap_invoice_id`)
- MoonSleep Finance: `finance.ap_invoice_revisions` (canonical; identity `ap_invoice_revision_id`)

**Key fields:** `ap_invoice_id`, `ap_party_id`, `stable_invoice_identity_sha256`, `invoice_number`, `invoice_date`, `due_date`, `currency`, `subtotal_minor_units`, `tax_minor_units`, `credits_minor_units`, `amount_due_minor_units`, `invoice_state`, `review_state`.

**Relationships:**

- `issued_by_ap_party` → `moonsleep.finance_ap_party` (one; owner: Finance)
- `has_revision` → `moonsleep.invoice_revision` (many; owner: Finance)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `AP invoice`, `credit memo profile`.

**Do not recreate:** Luna candidate or intake as Invoice; one PDF as one Invoice; carrier-specific Invoice schema.

**Open questions:** Credit document profile field needs standardization; Direct Partner or Nex Entity relationship waits for the AP Party crosswalk.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/finance_accounts_payable_postgres.sql`
- `moonsleep-v1:docs/specs/moonsleep-finance-cockpit-and-bookkeeping.md`

<a id="moonsleepinvoice_line"></a>

### Invoice Line

`moonsleep.invoice_line` · typed_supporting_object · implemented

One priced and classified line within an exact Invoice Revision. Cross-domain PO or Claim references require a separate governed typed relationship; source evidence locator text is not that relationship.

**Stable identity:** ap_invoice_line_id within Invoice Revision

**Revision identity:** Owned by exact Invoice Revision

**Canonical storage/read custody:**

- MoonSleep Finance: `finance.ap_invoice_lines` (canonical; identity `ap_invoice_line_id`)

**Key fields:** `ap_invoice_line_id`, `ap_invoice_revision_id`, `sanitized_description`, `quantity`, `unit_label`, `unit_price_minor_units`, `line_amount_minor_units`, `accounting_classification`, `ledger_account_revision_id`, `source_evidence_locator`, `review_state`.

**Relationships:**

- `belongs_to_revision` → `moonsleep.invoice_revision` (one; owner: Finance)
- `posts_to_account` → `moonsleep.financial_account` (optional_one; owner: Finance)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `AP line`.

**Do not recreate:** copied Supply or Claims state inside invoice line.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/finance_accounts_payable_postgres.sql`

<a id="moonsleepinvoice_revision"></a>

### Invoice Revision

`moonsleep.invoice_revision` · typed_supporting_object · implemented

Effective immutable version of an Invoice's financial and review fields.

**Stable identity:** ap_invoice_revision_id

**Revision identity:** revision_sequence and superseded_revision_id

**Canonical storage/read custody:**

- MoonSleep Finance: `finance.ap_invoice_revisions` (canonical; identity `ap_invoice_revision_id`)

**Key fields:** `ap_invoice_revision_id`, `ap_invoice_id`, `revision_sequence`, `superseded_revision_id`, `invoice_number`, `invoice_date`, `due_date`, `currency`, `subtotal_minor_units`, `tax_minor_units`, `credits_minor_units`, `amount_due_minor_units`, `source_manifest_id`, `source_record_id`, `payload_sha256`.

**Relationships:**

- `revision_of` → `moonsleep.invoice` (one; owner: Finance)
- `has_line` → `moonsleep.invoice_line` (many; owner: Finance)
- `has_payment_application` → `moonsleep.payment_application` (optional_many; owner: Finance)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `AP revision`.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/finance_accounts_payable_postgres.sql`

<a id="moonsleepjournal_entry"></a>

### Journal Entry

`moonsleep.journal_entry` · business_resource · implemented

Balanced accounting entry with explicit idempotency, document reference, source links, and reversal relationship.

**Stable identity:** entry_id; document_reference and idempotency_key are separately unique while payload_sha256 is content custody

**Revision identity:** Explicit reversal_of_entry_id references the original Entry

**Canonical storage/read custody:**

- MoonSleep Finance: `finance.journal_entries` (canonical; identity `entry_id`)
- MoonSleep Finance: `finance.journal_source_links` (canonical)

**Key fields:** `entry_id`, `document_reference`, `idempotency_key`, `payload_sha256`, `period_id`, `posting_date`, `entry_purpose`, `posting_state`, `reversal_of_entry_id`.

**Relationships:**

- `has_line` → `moonsleep.journal_line` (many; owner: Finance)
- `reverses` → `moonsleep.journal_entry` (optional_one; owner: Finance)
- `in_period` → `moonsleep.accounting_period` (one; owner: Finance)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `JE`.

**Do not recreate:** accepted Observation as posted Journal Entry; QBO as current owner without adoption.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/finance_ledger_postgres.sql`
- `moonsleep-v1:docs/specs/moonsleep-finance-cockpit-and-bookkeeping.md`

<a id="moonsleepjournal_line"></a>

### Journal Line

`moonsleep.journal_line` · typed_supporting_object · implemented

One debit or credit line in a balanced Journal Entry, bound to an exact Financial Account revision.

**Stable identity:** journal_line_id within entry

**Revision identity:** Owned by immutable posted Entry or explicit reversal

**Canonical storage/read custody:**

- MoonSleep Finance: `finance.journal_lines` (canonical; identity `journal_line_id`)

**Key fields:** `journal_line_id`, `entry_id`, `line_number`, `account_revision_id`, `posting_side`, `amount_minor_units`, `currency_code`, `source_line_reference`, `memo`.

**Relationships:**

- `belongs_to_entry` → `moonsleep.journal_entry` (one; owner: Finance)
- `posts_to_account` → `moonsleep.financial_account` (one; owner: Finance)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `ledger line`.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/finance_ledger_postgres.sql`

<a id="moonsleeppayment"></a>

### Payment

`moonsleep.payment` · business_resource · deployed

Provider-native AP payment order and lifecycle evidence, deployed today for Mercury only. It is distinct from cash/card transactions and supplier-reported payment statements.

**Stable identity:** provider_name plus provider_object_identity_sha256 represented by ap_payment_order_id

**Revision identity:** ap_payment_order_revision_id

**Canonical storage/read custody:**

- MoonSleep Finance: `finance.ap_payment_orders` (canonical; identity `ap_payment_order_id`)
- MoonSleep Finance: `finance.ap_payment_order_revisions` (canonical; identity `ap_payment_order_revision_id`)

**Key fields:** `ap_payment_order_id`, `provider_name`, `provider_object_identity_sha256`, `source_account_identity_sha256`, `recipient_binding_sha256`, `requested_amount_minor_units`, `currency`, `provider_lifecycle_state`, `payment_rail`, `requested_at`, `approved_at`, `scheduled_at`, `sent_at`, `settled_at`, `failed_at`, `cancelled_at`, `reversed_at`.

**Relationships:**

- `has_application` → `moonsleep.payment_application` (optional_many; owner: Finance)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `payment order`, `Mercury payment`.

**Do not recreate:** amount match as Payment identity; PayPal overloaded as Mercury Payment.

**Open questions:** PayPal and other provider registration remains a gap.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/finance_accounts_payable_postgres.sql`

<a id="moonsleeppayment_application"></a>

### Payment Application

`moonsleep.payment_application` · typed_supporting_object · implemented

Governed allocation or reversal effect between one exact Payment Revision and one exact Invoice Revision.

**Stable identity:** ap_invoice_payment_allocation_id

**Revision identity:** Append-only allocation effect and state

**Canonical storage/read custody:**

- MoonSleep Finance: `finance.ap_invoice_payment_allocations` (canonical; identity `ap_invoice_payment_allocation_id`)

**Key fields:** `ap_invoice_payment_allocation_id`, `ap_invoice_revision_id`, `ap_payment_order_revision_id`, `allocation_minor_units`, `allocation_effect`, `allocation_state`, `source_record_id`, `payload_sha256`, `idempotency_key_sha256`.

**Relationships:**

- `applies_payment` → `moonsleep.payment` (one; owner: Finance)
- `to_invoice_revision` → `moonsleep.invoice_revision` (one; owner: Finance)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `payment allocation`.

**Do not recreate:** amount-only automatic application.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/finance_accounts_payable_postgres.sql`

## MoonSleep fulfillment

| Object | Class | Status | Canonical owner | Stable identity | Observation target |
| --- | --- | --- | --- | --- | --- |
| [Dispatch Wave](#moonsleepdispatch_wave) | business_resource | deployed | Dispatch | wave_id | through_owner_adapter |
| [Fulfillment Component Obligation](#moonsleepfulfillment_obligation) | business_resource | deployed | Dispatch | obligation_id | through_owner_adapter |
| [Fulfillment Delivery Plan](#moonsleepfulfillment_delivery_plan) | business_resource | deployed | Dispatch | delivery_plan_id | through_owner_adapter |
| [Fulfillment Node](#moonsleepfulfillment_node) | business_resource | deployed | Dispatch | node_id | through_owner_adapter |
| [Fulfillment Package](#moonsleepfulfillment_package) | business_resource | deployed | Dispatch | dispatch wave_row_id/package attempt ID | through_owner_adapter |

<a id="moonsleepdispatch_wave"></a>

### Dispatch Wave

`moonsleep.dispatch_wave` · business_resource · deployed

Executable or planned node-scoped grouping of fulfillment packages. A wave does not prove carrier possession.

**Stable identity:** wave_id

**Revision identity:** Wave lifecycle and packet publication history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.dispatch_waves` (canonical; identity `wave_id`)

**Key fields:** `wave_id`, `node_id`, `wave_state`, `created_at`, `released_at`, `closed_at`.

**Relationships:**

- `contains_package` → `moonsleep.fulfillment_package` (many; owner: Dispatch)
- `operated_by` → `moonsleep.fulfillment_node` (one; owner: Dispatch)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `fulfillment wave`.

**Do not recreate:** fulfillment packet Resource.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-ops-object-workspace.md`

<a id="moonsleepfulfillment_obligation"></a>

### Fulfillment Component Obligation

`moonsleep.fulfillment_obligation` · business_resource · deployed

Stable component-level obligation created by an Order line and satisfied only through authoritative allocation/package/shipment evidence.

**Stable identity:** obligation_id

**Revision identity:** Dispatch obligation state history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.fulfillment_component_obligations` (canonical; identity `obligation_id`)

**Key fields:** `obligation_id`, `order_key`, `line_key`, `component_code`, `required_units`, `state`, `node_id`, `allocation_ref`.

**Relationships:**

- `for_order_line` → `moonsleep.commerce_order_line` (one; owner: Dispatch)
- `planned_by` → `moonsleep.fulfillment_delivery_plan` (optional_many; owner: Dispatch)
- `fulfilled_by` → `moonsleep.fulfillment_package` (optional_many; owner: Dispatch)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `component obligation`.

**Do not recreate:** order status as fulfillment obligation state.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-ops-object-workspace.md`
- `moonsleep-v1:docs/specs/moonsleep-order-journey.md`

<a id="moonsleepfulfillment_delivery_plan"></a>

### Fulfillment Delivery Plan

`moonsleep.fulfillment_delivery_plan` · business_resource · deployed

Expected fulfillment grouping and route for one or more component obligations. A plan is not a physical shipment.

**Stable identity:** delivery_plan_id

**Revision identity:** Plan state and supersession history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.fulfillment_delivery_plans` (canonical; identity `delivery_plan_id`)

**Key fields:** `delivery_plan_id`, `order_key`, `node_id`, `plan_state`, `scheduled_at`, `expected_components`.

**Relationships:**

- `plans_obligation` → `moonsleep.fulfillment_obligation` (many; owner: Dispatch)
- `generates_package` → `moonsleep.fulfillment_package` (optional_many; owner: Dispatch)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `customer shipment plan`.

**Do not recreate:** shipment created from a promise or ETA.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-order-journey.md`

<a id="moonsleepfulfillment_node"></a>

### Fulfillment Node

`moonsleep.fulfillment_node` · business_resource · deployed

Operational Dispatch node identity, distinct from but explicitly related to a physical Facility and partner Organization.

**Stable identity:** node_id

**Revision identity:** Node configuration history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.fulfillment_nodes` (canonical; identity `node_id`)

**Key fields:** `node_id`, `node_name`, `node_state`, `facility_ref`, `partner_ref`.

**Relationships:**

- `located_at` → `moonsleep.facility` (optional_one; owner: Inventory and Dispatch)
- `operates_wave` → `moonsleep.dispatch_wave` (optional_many; owner: Dispatch)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `warehouse node`.

**Do not recreate:** Facility and Node collapsed into one identity.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-ops-object-workspace.md`

<a id="moonsleepfulfillment_package"></a>

### Fulfillment Package

`moonsleep.fulfillment_package` · business_resource · deployed

Dispatch package attempt and its composition, label, node, wave, and physical carrier evidence. Tracking number is an attribute until a broader transport identity is approved.

**Stable identity:** dispatch wave_row_id/package attempt ID

**Revision identity:** Package state and tracking event history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.dispatch_wave_rows` (canonical; identity `wave_row_id`)

**Key fields:** `wave_row_id`, `wave_id`, `order_key`, `node_id`, `package_state`, `label_ref`, `tracking_number`, `first_physical_event_at`.

**Relationships:**

- `in_wave` → `moonsleep.dispatch_wave` (one; owner: Dispatch)
- `operated_by` → `moonsleep.fulfillment_node` (one; owner: Dispatch)
- `fulfills_obligation` → `moonsleep.fulfillment_obligation` (many; owner: Dispatch)
- `has_incident` → `moonsleep.carrier_incident` (optional_many; owner: Claims)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `Customer Shipment`, `Tracking`.

**Do not recreate:** label as carrier possession; duplicate original/remedy Shipment object; tracking string as standalone Resource without owner decision.

**Open questions:** A cross-domain transport identity may later generalize package tracking.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-order-journey.md`
- `moonsleep-v1:docs/specs/moonsleep-ops-object-workspace.md`

## MoonSleep inventory and supply

| Object | Class | Status | Canonical owner | Stable identity | Observation target |
| --- | --- | --- | --- | --- | --- |
| [Facility](#moonsleepfacility) | business_resource | deployed | Inventory and Organization registry | facility/location ID | through_owner_adapter |
| [Inventory Position](#moonsleepinventory_position) | business_resource | deployed | Inventory Ledger | position identity defined by owning inventory surface | through_owner_adapter |
| [Lot](#moonsleeplot) | business_resource | deployed | Inventory Ledger | purchase order lot ID | through_owner_adapter |
| [Purchase Order](#moonsleeppurchase_order) | business_resource | deployed | Inventory Ledger | po_id/purchase_order_id | through_owner_adapter |

<a id="moonsleepfacility"></a>

### Facility

`moonsleep.facility` · business_resource · deployed

Physical facility/location identity, distinct from a Dispatch Node and related explicitly to a Partner Organization.

**Stable identity:** facility/location ID

**Revision identity:** Facility edit and mapping history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_facility_locations` (canonical; identity `facility_id`)
- MoonSleep Ops: `public.supply_facility_node_mappings` (canonical)

**Key fields:** `facility_id`, `organization_ref`, `name`, `address`, `status`, `capabilities`.

**Relationships:**

- `operated_by` → `moonsleep.partner` (optional_one; owner: Identity and Inventory)
- `mapped_to_node` → `moonsleep.fulfillment_node` (optional_many; owner: Inventory and Dispatch)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `warehouse`, `factory location`.

**Do not recreate:** Facility and Dispatch Node collapsed; address text as Facility identity.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/supply_facility_master_postgres.sql`
- `moonsleep-v1:docs/specs/moonsleep-ops-object-workspace.md`

<a id="moonsleepinventory_position"></a>

### Inventory Position

`moonsleep.inventory_position` · business_resource · deployed

Source-owned stock position facet by component, variant, node, lot, or location, retaining physical basis, reserve, allocations, and reconciliation.

**Stable identity:** position identity defined by owning inventory surface

**Revision identity:** Ledger transactions and snapshots

**Canonical storage/read custody:**

- MoonSleep Ops: `Inventory Ledger and inventory position views` (canonical; identity `position_ref`)

**Key fields:** `position_ref`, `resource_ref`, `node_or_location_ref`, `lot_ref`, `on_hand`, `allocated`, `reserved`, `available`, `reconciliation_state`, `as_of`.

**Relationships:**

- `at_facility` → `moonsleep.facility` (optional_one; owner: Inventory Ledger)
- `from_lot` → `moonsleep.lot` (optional_one; owner: Inventory Ledger)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `stock position`, `inventory snapshot`.

**Do not recreate:** Shopify quantity as canonical inventory; snapshot as ledger identity.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-ops-object-workspace.md`

<a id="moonsleeplot"></a>

### Lot

`moonsleep.lot` · business_resource · deployed

Distinct purchased/produced inventory lot tied to a Purchase Order and physical receipt history. Lot and business Batch remain distinct.

**Stable identity:** purchase order lot ID

**Revision identity:** ETA, shipment, receipt, and allocation history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.inventory_purchase_order_lots` (canonical; identity `lot_id`)
- MoonSleep Ops: `public.inventory_purchase_order_lot_eta_history` (canonical)

**Key fields:** `lot_id`, `po_id`, `sku_key`, `units`, `lot_state`, `expected_at`, `received_at`, `location`.

**Relationships:**

- `belongs_to_po` → `moonsleep.purchase_order` (one; owner: Inventory Ledger)
- `has_position` → `moonsleep.inventory_position` (optional_many; owner: Inventory Ledger)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `PO lot`.

**Do not recreate:** Lot and Batch collapsed; supplier promise as received inventory.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-ops-object-workspace.md`

<a id="moonsleeppurchase_order"></a>

### Purchase Order

`moonsleep.purchase_order` · business_resource · deployed

Commercial procurement commitment issued to a supplier, distinct from a Purchase Plan, quote, Invoice, or Sample Order.

**Stable identity:** po_id/purchase_order_id

**Revision identity:** PO status, line, lot, and payment histories

**Canonical storage/read custody:**

- MoonSleep Ops: `public.inventory_purchase_orders` (canonical; identity `po_id`)

**Key fields:** `po_id`, `supplier_ref`, `ordered_at`, `status`, `currency`, `units_ordered`, `expected_delivery`, `payment_state`.

**Relationships:**

- `ordered_from` → `moonsleep.partner` (one; owner: Inventory and Identity)
- `has_lot` → `moonsleep.lot` (optional_many; owner: Inventory Ledger)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `supply_order`, `PO`.

**Do not recreate:** Purchase Plan or Invoice as PO.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-ops-object-workspace.md`

## MoonSleep partner and supply

| Object | Class | Status | Canonical owner | Stable identity | Observation target |
| --- | --- | --- | --- | --- | --- |
| [Partner](#moonsleeppartner) | business_resource | implemented | Owning partner registry over Nex Entity | canonical Nex Organization Entity plus reviewed partner role and provider references | through_owner_adapter |
| [Supply Organization](#moonsleepsupply_organization) | compatibility_alias | compatibility | Supply compatibility storage with Nex Organization target | organization_id pending mandatory Nex Entity crosswalk | compatibility_only |

<a id="moonsleeppartner"></a>

### Partner

`moonsleep.partner` · business_resource · implemented

Business-role facade for a supplier, carrier, creator, facility operator, or service provider represented by canonical Nex Entities and Contacts.

**Stable identity:** canonical Nex Organization Entity plus reviewed partner role and provider references

**Revision identity:** Entity/role/contact history and owner-specific agreement history

**Canonical storage/read custody:**

- Nex: `entities, entity_tags, contacts` (canonical; identity `entity_id`)
- MoonSleep Ops: `Partners object view` (projection)

**Key fields:** `entity_id`, `partner_roles`, `contact_refs`, `provider_refs`, `relationship_state`.

**Relationships:**

- `represented_by` → `nex.entity` (one; owner: Nex Identity)
- `has_contact` → `nex.contact` (many; owner: Nex Identity)
- `participates_in` → `nex.channel` (optional_many; owner: Nex Channels)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `supplier`, `carrier`, `creator`, `service provider`.

**Do not recreate:** provider text as a new Organization; domain-local Partner identity.

**Open questions:** Supply and Finance party tables require enforced Entity crosswalks.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-ops-object-workspace.md`

<a id="moonsleepsupply_organization"></a>

### Supply Organization

`moonsleep.supply_organization` · compatibility_alias · compatibility

Existing Supply organization row used by product and procurement tables. It must crosswalk to the canonical Nex Organization Entity rather than becoming a competing identity authority.

**Stable identity:** organization_id pending mandatory Nex Entity crosswalk

**Revision identity:** Supply compatibility identity history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_organizations` (compatibility; identity `organization_id`)

**Key fields:** `organization_id`.

**Relationships:**

- `resolves_to_partner` → `moonsleep.partner` (one; owner: Identity steward and Supply)

**Projection/action boundary:** Observation target `compatibility_only`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `supplier organization`.

**Do not recreate:** second supplier company identity.

**Open questions:** Mandatory supply_organization to Nex Entity crosswalk is not production-enforced.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

## MoonSleep people and service

| Object | Class | Status | Canonical owner | Stable identity | Observation target |
| --- | --- | --- | --- | --- | --- |
| [Customer](#moonsleepcustomer) | business_resource | deployed | MoonSleep Customer Operations over Nex Identity and source-owned customer identities | canonical Nex Entity with Customer role plus reviewed provider identity links | through_owner_adapter |
| [Customer Issue](#moonsleepcustomer_issue) | business_resource | deployed | MoonSleep Customer Operations | Customer Operations issue ID derived from the exact initiating occurrence and issue-boundary contract | through_owner_adapter |
| [Customer Thread](#moonsleepcustomer_thread) | read_model | implemented | Customer Operations over Nex communications | Customer plus preserved native Channel identities; any support-thread identity remains Helpdesk-owned | through_owner_adapter |

<a id="moonsleepcustomer"></a>

### Customer

`moonsleep.customer` · business_resource · deployed

Federated business-role view over a canonical Entity, Customer role, native Contacts, and source-owned customer identities. It is not a separate duplicate person table.

**Stable identity:** canonical Nex Entity with Customer role plus reviewed provider identity links

**Revision identity:** Entity/contact/role history remains with each owner; equivalence links are reviewed

**Canonical storage/read custody:**

- Nex: `entities and entity_tags` (canonical; identity `entity_id`)
- Nex: `contacts and contact_observations` (canonical; identity `contact_id`)
- MoonSleep Ops: `federated Customers object view` (projection)

**Key fields:** `entity_id`, `customer_role`, `contact_refs`, `source_customer_refs`, `identity_resolution_state`, `latest_customer_activity_at`, `latest_moonsleep_activity_at`.

**Relationships:**

- `represented_by_entity` → `nex.entity` (one; owner: Nex Identity)
- `has_contact` → `nex.contact` (many; owner: Nex Identity)
- `participates_in_channel` → `nex.channel` (many; owner: Nex Channels)
- `placed_order` → `moonsleep.commerce_order` (optional_many; owner: Commerce)
- `has_issue` → `moonsleep.customer_issue` (optional_many; owner: Customer Operations)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `customer role resource`, `Shopify customer`, `Helpdesk roster customer`.

**Do not recreate:** synthetic Customer IDs when an Entity and Customer role already exist; email-address-only Customer identity.

**Open questions:** Cross-channel equivalence promotion remains reviewable rather than universally automatic.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-ops-object-workspace.md`
- `moonsleep-v1:docs/specs/moonsleep-customer-operations.md`

<a id="moonsleepcustomer_issue"></a>

### Customer Issue

`moonsleep.customer_issue` · business_resource · deployed

Canonical support episode for one customer goal, question, exception, or remedy. One Channel may contain several Issues; acknowledgments or general history may create no Issue.

**Stable identity:** Customer Operations issue ID derived from the exact initiating occurrence and issue-boundary contract

**Revision identity:** Issue lifecycle events and reviewed successors preserve chronology

**Canonical storage/read custody:**

- MoonSleep Ops: `verified Customer Issue and issue lifecycle tables` (canonical; identity `customer_issue_id`)
- MoonSleep Ops: `ops_customer_issue_measurement_current` (projection)

**Key fields:** `customer_issue_id`, `initiating_logical_message_id`, `channel_ref`, `customer_ref`, `issue_category`, `conversation_state`, `operational_state`, `created_at`, `updated_at`.

**Relationships:**

- `belongs_to_customer` → `moonsleep.customer` (one; owner: Customer Operations)
- `initiated_in_channel` → `nex.channel` (one; owner: Nex Channels)
- `concerns_order` → `moonsleep.commerce_order` (optional_many; owner: Commerce and Customer Operations)
- `has_commitment` → `moonsleep.commitment` (optional_many; owner: Commitment owner)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `support episode`, `customer case`.

**Do not recreate:** one Issue per provider thread; acknowledgment-only Issue; dossier as canonical object.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-customer-operations.md`
- `moonsleep-v1:infra/ops-analytics/sql/customer_operations_verified_issue_postgres.sql`

<a id="moonsleepcustomer_thread"></a>

### Customer Thread

`moonsleep.customer_thread` · read_model · implemented

Customer-facing history view that preserves each native Channel and provider conversation while presenting their combined chronology for one Customer. It is not a replacement Channel or reply route.

**Stable identity:** Customer plus preserved native Channel identities; any support-thread identity remains Helpdesk-owned

**Revision identity:** Derived from immutable communication occurrences and current identity links

**Canonical storage/read custody:**

- Nex: `channels, channel_participants, records` (canonical)
- MoonSleep Helpdesk: `Customer Threads read model` (projection)

**Key fields:** `customer_ref`, `channel_refs`, `provider_thread_refs`, `latest_customer_activity_at`, `latest_moonsleep_activity_at`, `open_commitment_count`, `issue_refs`.

**Relationships:**

- `for_customer` → `moonsleep.customer` (one; owner: Customer Operations)
- `includes_channel` → `nex.channel` (many; owner: Nex Channels)
- `has_issue` → `moonsleep.customer_issue` (optional_many; owner: Customer Operations)
- `evidences_commitment` → `moonsleep.commitment` (optional_many; owner: Commitment owner)

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `consolidated customer history`, `support thread`.

**Do not recreate:** cross-provider mega-thread; synthetic reply target; communication stream treated as native Channel.

**Open questions:** The exact derived multi-Channel read contract needs central registration.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-ops-object-workspace.md`
- `moonsleep-v1:docs/specs/moonsleep-customer-operations.md`

## MoonSleep product and supply

| Object | Class | Status | Canonical owner | Stable identity | Observation target |
| --- | --- | --- | --- | --- | --- |
| [Product BOM Line](#moonsleepproduct_bom_line) | typed_supporting_object | deployed | Product and Inventory | bom_line_id | direct |
| [Product BOM Version](#moonsleepproduct_bom_version) | business_resource | deployed | Product and Inventory | bom_version_id | direct |
| [Product Experiment](#moonsleepproduct_experiment) | business_resource | deployed | Product and Supply | experiment_id | direct |
| [Product Experiment Option](#moonsleepproduct_experiment_option) | typed_supporting_object | deployed | Product and Supply | experiment_option_id | direct |
| [Product Family](#moonsleepproduct_family) | business_resource | deployed | Product and Supply | product_family_id | direct |
| [Product Prototype](#moonsleepproduct_prototype) | business_resource | deployed | Product and Supply | prototype_id | direct |
| [Product Revision](#moonsleepproduct_revision) | business_resource | deployed | Product and Supply | product_revision_id | direct |
| [Purchase Plan](#moonsleeppurchase_plan) | business_resource | deployed | Supply planning | purchase_plan_id | direct |
| [Purchase Plan Option](#moonsleeppurchase_plan_option) | typed_supporting_object | deployed | Supply planning | purchase_plan_option_id | direct |
| [Purchase Plan Requirement](#moonsleeppurchase_plan_requirement) | typed_supporting_object | deployed | Supply planning | purchase_plan_requirement_id | direct |
| [Sample Article](#moonsleepsample_article) | business_resource | deployed | Supply | sample_article_id | direct |
| [Sample Article Status Event](#moonsleepsample_article_status) | typed_supporting_object | deployed | Supply | sample_article_status_id | direct |
| [Sample Order](#moonsleepsample_order) | business_resource | deployed | Supply | sample_order_id | direct |
| [Sample Order Line](#moonsleepsample_order_line) | typed_supporting_object | deployed | Supply | sample_order_line_id | direct |
| [Sample Order Status Event](#moonsleepsample_order_status) | typed_supporting_object | deployed | Supply | sample_order_status_id | direct |
| [Sample Payment Report](#moonsleepsample_payment_report) | evidence_custody | deployed | Supply evidence; Finance owns actual payment truth | sample_payment_report_id | direct |
| [Supplier Freight Quotation](#moonsleepsupplier_freight_quote) | business_resource | deployed | Supply | freight_quotation_id | direct |
| [Supplier Freight Quotation Line](#moonsleepsupplier_freight_quote_line) | typed_supporting_object | deployed | Supply | freight_quote_line_id | direct |
| [Supplier Product Quotation](#moonsleepsupplier_product_quote) | business_resource | deployed | Supply | product_quotation_id | direct |
| [Supplier Product Quotation Line](#moonsleepsupplier_product_quote_line) | typed_supporting_object | deployed | Supply | product_quote_line_id | direct |
| [Supplier Product Quotation Packaging Option](#moonsleepsupplier_product_quote_packaging_option) | typed_supporting_object | deployed | Supply | product_quote_packaging_option_id | direct |

<a id="moonsleepproduct_bom_line"></a>

### Product BOM Line

`moonsleep.product_bom_line` · typed_supporting_object · deployed

One component requirement within a BOM Version.

**Stable identity:** bom_line_id

**Revision identity:** Inherited from BOM Version

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_product_bom_lines` (canonical; identity `bom_line_id`)

**Key fields:** `bom_line_id`, `bom_version_id`, `component_code`, `component_role`, `quantity`, `unit_of_measure`, `specification_json`.

**Relationships:**

- `belongs_to_bom` → `moonsleep.product_bom_version` (one; owner: Product and Inventory)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `component requirement`.

**Do not recreate:** free-text component obligation as BOM identity.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleepproduct_bom_version"></a>

### Product BOM Version

`moonsleep.product_bom_version` · business_resource · deployed

Versioned bill of materials for one Product Revision.

**Stable identity:** bom_version_id

**Revision identity:** version_ordinal and supersedes_bom_version_id

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_product_bom_versions` (canonical; identity `bom_version_id`)

**Key fields:** `bom_version_id`, `product_revision_id`, `version_ordinal`, `version_state`, `supersedes_bom_version_id`.

**Relationships:**

- `specifies_revision` → `moonsleep.product_revision` (one; owner: Product and Inventory)
- `has_line` → `moonsleep.product_bom_line` (many; owner: Product and Inventory)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `BOM`.

**Do not recreate:** mutable component list without BOM version.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleepproduct_experiment"></a>

### Product Experiment

`moonsleep.product_experiment` · business_resource · deployed

Structured product hypothesis and evaluation over one or more options or prototypes.

**Stable identity:** experiment_id

**Revision identity:** experiment state and conclusion history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_product_experiments` (canonical; identity `experiment_id`)

**Key fields:** `experiment_id`, `product_family_id`, `product_revision_id`, `title`, `hypothesis`, `experiment_state`, `opened_at`, `concluded_at`.

**Relationships:**

- `belongs_to_family` → `moonsleep.product_family` (one; owner: Product and Supply)
- `has_option` → `moonsleep.product_experiment_option` (many; owner: Product and Supply)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `product trial`.

**Do not recreate:** informal preference promoted to experiment without decision.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleepproduct_experiment_option"></a>

### Product Experiment Option

`moonsleep.product_experiment_option` · typed_supporting_object · deployed

One tested alternative and result within a Product Experiment.

**Stable identity:** experiment_option_id

**Revision identity:** Option state and result history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_product_experiment_options` (canonical; identity `experiment_option_id`)

**Key fields:** `experiment_option_id`, `experiment_id`, `option_label`, `option_state`, `tested_prototype_id`, `result_summary`.

**Relationships:**

- `belongs_to_experiment` → `moonsleep.product_experiment` (one; owner: Product and Supply)
- `tests_prototype` → `moonsleep.product_prototype` (optional_one; owner: Product and Supply)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `experiment alternative`.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleepproduct_family"></a>

### Product Family

`moonsleep.product_family` · business_resource · deployed

Stable commercial/product concept that can have revisions, prototypes, BOMs, experiments, purchase plans, and commercial variants.

**Stable identity:** product_family_id

**Revision identity:** Product Revision

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_product_families` (canonical; identity `product_family_id`)

**Key fields:** `product_family_id`, `canonical_name`, `lifecycle_state`.

**Relationships:**

- `has_revision` → `moonsleep.product_revision` (many; owner: Product and Supply)
- `has_prototype` → `moonsleep.product_prototype` (optional_many; owner: Product and Supply)
- `has_experiment` → `moonsleep.product_experiment` (optional_many; owner: Product and Supply)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `product concept`.

**Do not recreate:** SKU or prototype substituted for Product Family.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleepproduct_prototype"></a>

### Product Prototype

`moonsleep.product_prototype` · business_resource · deployed

Planned or realized prototype design identity, distinct from each physical Sample Article.

**Stable identity:** prototype_id

**Revision identity:** supersedes_prototype_id and current_prototype_state

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_product_prototypes` (canonical; identity `prototype_id`)

**Key fields:** `prototype_id`, `product_family_id`, `product_revision_id`, `prototype_label`, `current_prototype_state`, `supersedes_prototype_id`.

**Relationships:**

- `belongs_to_family` → `moonsleep.product_family` (one; owner: Product and Supply)
- `implements_revision` → `moonsleep.product_revision` (one; owner: Product and Supply)
- `realized_by` → `moonsleep.sample_article` (optional_many; owner: Supply)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `prototype design`.

**Do not recreate:** physical sample collapsed into prototype identity.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleepproduct_revision"></a>

### Product Revision

`moonsleep.product_revision` · business_resource · deployed

Effective-dated version of a Product Family's design and requirements.

**Stable identity:** product_revision_id

**Revision identity:** Explicit revision label/state and effective_from

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_product_revisions` (canonical; identity `product_revision_id`)

**Key fields:** `product_revision_id`, `product_family_id`, `revision_label`, `revision_state`, `effective_from`.

**Relationships:**

- `belongs_to_family` → `moonsleep.product_family` (one; owner: Product and Supply)
- `specified_by` → `moonsleep.product_bom_version` (optional_many; owner: Product and Supply)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `product version`.

**Do not recreate:** BOM version collapsed into Product Revision.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleeppurchase_plan"></a>

### Purchase Plan

`moonsleep.purchase_plan` · business_resource · deployed

Pre-commitment procurement plan evaluating requirements, suppliers, product quotes, and freight options. It is not a Purchase Order.

**Stable identity:** purchase_plan_id

**Revision identity:** Plan state and option/requirement history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_purchase_plans` (canonical; identity `purchase_plan_id`)

**Key fields:** `purchase_plan_id`, `display_name`, `product_family_id`, `product_revision_id`, `target_units`, `planning_state`, `opened_at`.

**Relationships:**

- `plans_family` → `moonsleep.product_family` (one; owner: Supply)
- `has_option` → `moonsleep.purchase_plan_option` (many; owner: Supply)
- `has_requirement` → `moonsleep.purchase_plan_requirement` (many; owner: Supply)
- `may_result_in` → `moonsleep.purchase_order` (optional_many; owner: Inventory Ledger)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `sourcing plan`.

**Do not recreate:** plan treated as committed Purchase Order.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleeppurchase_plan_option"></a>

### Purchase Plan Option

`moonsleep.purchase_plan_option` · typed_supporting_object · deployed

One supplier/product/freight alternative evaluated inside a Purchase Plan.

**Stable identity:** purchase_plan_option_id

**Revision identity:** Option state history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_purchase_plan_options` (canonical; identity `purchase_plan_option_id`)

**Key fields:** `purchase_plan_option_id`, `purchase_plan_id`, `option_label`, `option_state`, `supplier_organization_id`, `target_units`.

**Relationships:**

- `belongs_to_plan` → `moonsleep.purchase_plan` (one; owner: Supply)
- `uses_supplier` → `moonsleep.supply_organization` (optional_one; owner: Supply compatibility)
- `evaluates_product_quote` → `moonsleep.supplier_product_quote_line` (optional_many; owner: Supply)
- `evaluates_freight_quote` → `moonsleep.supplier_freight_quote_line` (optional_many; owner: Supply)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `sourcing alternative`.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleeppurchase_plan_requirement"></a>

### Purchase Plan Requirement

`moonsleep.purchase_plan_requirement` · typed_supporting_object · deployed

One quantity, component, product, or service requirement inside a Purchase Plan or option.

**Stable identity:** purchase_plan_requirement_id

**Revision identity:** Requirement Observations and plan revisions

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_purchase_plan_requirements` (canonical; identity `purchase_plan_requirement_id`)

**Key fields:** `purchase_plan_requirement_id`, `purchase_plan_id`, `purchase_plan_option_id`, `requirement_category`, `requirement_description`, `resource_ref`, `quantity`, `unit_of_measure`, `supplier_organization_id`.

**Relationships:**

- `belongs_to_plan` → `moonsleep.purchase_plan` (one; owner: Supply)
- `requires_resource` → `moonsleep.product_revision` (optional_one; owner: Supply)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `procurement requirement`.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleepsample_article"></a>

### Sample Article

`moonsleep.sample_article` · business_resource · deployed

One physical sample article realizing a prototype or product revision and fulfilling a Sample Order Line.

**Stable identity:** sample_article_id

**Revision identity:** Sample Article Status events

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_sample_articles` (canonical; identity `sample_article_id`)

**Key fields:** `sample_article_id`, `article_label`, `sample_order_line_id`, `product_revision_id`, `prototype_id`, `bom_version_id`, `current_article_state`, `is_commercial_inventory`.

**Relationships:**

- `fulfills_line` → `moonsleep.sample_order_line` (one; owner: Supply)
- `realizes_prototype` → `moonsleep.product_prototype` (optional_one; owner: Supply)
- `has_status` → `moonsleep.sample_article_status` (many; owner: Supply)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `physical prototype`, `sample unit`.

**Do not recreate:** prototype design and physical sample collapsed.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleepsample_article_status"></a>

### Sample Article Status Event

`moonsleep.sample_article_status` · typed_supporting_object · deployed

Effective status assertion for one physical Sample Article.

**Stable identity:** sample_article_status_id

**Revision identity:** Immutable append-only status history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_sample_article_status_history` (canonical; identity `sample_article_status_id`)

**Key fields:** `sample_article_status_id`, `sample_article_id`, `article_state`, `effective_at`, `reported_by_scope`, `source_precision`.

**Relationships:**

- `status_for` → `moonsleep.sample_article` (one; owner: Supply)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `sample status`.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleepsample_order"></a>

### Sample Order

`moonsleep.sample_order` · business_resource · deployed

Supplier-facing order for prototypes or samples, distinct from commercial Purchase Orders and Customer Orders.

**Stable identity:** sample_order_id

**Revision identity:** Sample Order Status events

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_sample_orders` (canonical; identity `sample_order_id`)

**Key fields:** `sample_order_id`, `supplier_organization_id`, `provider_order_reference`, `provider_contract_reference`, `ordered_at`, `currency`, `total_minor_units`, `current_order_state`.

**Relationships:**

- `ordered_from` → `moonsleep.supply_organization` (one; owner: Supply compatibility)
- `has_line` → `moonsleep.sample_order_line` (many; owner: Supply)
- `has_status` → `moonsleep.sample_order_status` (many; owner: Supply)
- `has_payment_report` → `moonsleep.sample_payment_report` (optional_many; owner: Supply evidence and Finance)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `prototype order`.

**Do not recreate:** sample order as commercial PO.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleepsample_order_line"></a>

### Sample Order Line

`moonsleep.sample_order_line` · typed_supporting_object · deployed

One product revision/BOM quantity within a Sample Order.

**Stable identity:** sample_order_line_id

**Revision identity:** Inherited from order and Observation history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_sample_order_lines` (canonical; identity `sample_order_line_id`)

**Key fields:** `sample_order_line_id`, `sample_order_id`, `product_revision_id`, `bom_version_id`, `quantity`, `unit_price_minor_units`.

**Relationships:**

- `belongs_to_order` → `moonsleep.sample_order` (one; owner: Supply)
- `orders_revision` → `moonsleep.product_revision` (optional_one; owner: Supply)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleepsample_order_status"></a>

### Sample Order Status Event

`moonsleep.sample_order_status` · typed_supporting_object · deployed

Effective status assertion for one Sample Order, preserving source precision.

**Stable identity:** sample_order_status_id

**Revision identity:** Immutable append-only status history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_sample_order_status_history` (canonical; identity `sample_order_status_id`)

**Key fields:** `sample_order_status_id`, `sample_order_id`, `order_state`, `effective_at`, `source_precision`.

**Relationships:**

- `status_for` → `moonsleep.sample_order` (one; owner: Supply)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `sample order state`.

**Do not recreate:** supplier promise as physical shipment.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleepsample_payment_report"></a>

### Sample Payment Report

`moonsleep.sample_payment_report` · evidence_custody · deployed

Source-supported report that a Sample Order payment occurred. It is evidence and not necessarily a canonical Payment.

**Stable identity:** sample_payment_report_id

**Revision identity:** Immutable report

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_sample_order_payment_reports` (canonical; identity `sample_payment_report_id`)

**Key fields:** `sample_payment_report_id`, `sample_order_id`, `amount_minor_units`, `currency`, `reported_at`, `payment_evidence_scope`.

**Relationships:**

- `reports_payment_for` → `moonsleep.sample_order` (one; owner: Supply)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `reported payment`.

**Do not recreate:** reported payment as settled Payment.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleepsupplier_freight_quote"></a>

### Supplier Freight Quotation

`moonsleep.supplier_freight_quote` · business_resource · deployed

Supplier or forwarder-issued freight quotation with transport mode, service scope, incoterm, and priced lines.

**Stable identity:** freight_quotation_id

**Revision identity:** supersedes_freight_quotation_id and quotation state

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_supplier_freight_quotations` (canonical; identity `freight_quotation_id`)

**Key fields:** `freight_quotation_id`, `supplier_organization_id`, `supplier_reference`, `issued_at`, `currency`, `transport_mode`, `service_scope`, `incoterm_code`, `quotation_state`, `supersedes_freight_quotation_id`.

**Relationships:**

- `issued_by` → `moonsleep.supply_organization` (one; owner: Supply compatibility)
- `has_line` → `moonsleep.supplier_freight_quote_line` (many; owner: Supply)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `freight quote`.

**Do not recreate:** freight quote as shipment or invoice.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleepsupplier_freight_quote_line"></a>

### Supplier Freight Quotation Line

`moonsleep.supplier_freight_quote_line` · typed_supporting_object · deployed

One priced cargo/service alternative within a Supplier Freight Quotation.

**Stable identity:** freight_quote_line_id

**Revision identity:** Inherited from quotation and Observation history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_supplier_freight_quotation_lines` (canonical; identity `freight_quote_line_id`)

**Key fields:** `freight_quote_line_id`, `freight_quotation_id`, `cargo_resource_ref`, `quantity_basis_units`, `carton_count`, `quoted_amount_minor_units`, `transit_min_days`, `transit_max_days`, `duties_included`, `delivery_to_address_included`.

**Relationships:**

- `belongs_to_quote` → `moonsleep.supplier_freight_quote` (one; owner: Supply)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `freight option`.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleepsupplier_product_quote"></a>

### Supplier Product Quotation

`moonsleep.supplier_product_quote` · business_resource · deployed

Versioned supplier-issued commercial quotation for product/components, distinct from a Purchase Order or Invoice.

**Stable identity:** product_quotation_id

**Revision identity:** quotation_state, valid_through, and superseding evidence

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_supplier_product_quotations` (canonical; identity `product_quotation_id`)

**Key fields:** `product_quotation_id`, `supplier_organization_id`, `supplier_reference`, `issued_at`, `valid_through`, `currency`, `price_basis`, `lead_time_basis`, `quotation_state`.

**Relationships:**

- `issued_by` → `moonsleep.supply_organization` (one; owner: Supply compatibility)
- `has_line` → `moonsleep.supplier_product_quote_line` (many; owner: Supply)
- `has_packaging_option` → `moonsleep.supplier_product_quote_packaging_option` (optional_many; owner: Supply)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `product quote`.

**Do not recreate:** quote as Purchase Order or Invoice.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleepsupplier_product_quote_line"></a>

### Supplier Product Quotation Line

`moonsleep.supplier_product_quote_line` · typed_supporting_object · deployed

One priced quantity break or resource line within a Supplier Product Quotation.

**Stable identity:** product_quote_line_id

**Revision identity:** Inherited from quotation and Observation history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_supplier_product_quotation_lines` (canonical; identity `product_quote_line_id`)

**Key fields:** `product_quote_line_id`, `product_quotation_id`, `quoted_resource_ref`, `line_description`, `quantity_break_units`, `unit_price_minor_units`.

**Relationships:**

- `belongs_to_quote` → `moonsleep.supplier_product_quote` (one; owner: Supply)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `product quote line`.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="moonsleepsupplier_product_quote_packaging_option"></a>

### Supplier Product Quotation Packaging Option

`moonsleep.supplier_product_quote_packaging_option` · typed_supporting_object · deployed

One supplier-proposed packaging configuration attached to a Product Quotation, preserving package and carton assumptions separately from price lines.

**Stable identity:** product_quote_packaging_option_id

**Revision identity:** Inherited from quotation and Observation history

**Canonical storage/read custody:**

- MoonSleep Ops: `public.supply_supplier_product_quotation_packaging_options` (canonical; identity `product_quote_packaging_option_id`)

**Key fields:** `product_quote_packaging_option_id`, `product_quotation_id`, `package_type`, `units_per_package`, `packages_per_carton`, `carton_length_cm`, `carton_width_cm`, `carton_height_cm`, `compression_packaging`, `packaging_basis`.

**Relationships:**

- `belongs_to_quote` → `moonsleep.supplier_product_quote` (one; owner: Supply)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `product quotation packaging option`.

**Do not recreate:** packaging assumption copied into product identity.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

## MoonSleep work and governance

| Object | Class | Status | Canonical owner | Stable identity | Observation target |
| --- | --- | --- | --- | --- | --- |
| [Action and Receipt](#moonsleepaction_receipt) | business_resource | implemented | Owning mutation domain and resolution executor | registered action ID plus domain receipt ID | through_owner_adapter |
| [Commitment](#moonsleepcommitment) | business_resource | deployed | General Commitment contract; accepting domain owns satisfaction evidence | commitment_id | direct |

<a id="moonsleepaction_receipt"></a>

### Action and Receipt

`moonsleep.action_receipt` · business_resource · implemented

Stable governed action identity and immutable provider/readback receipt. It separates proposed action, approval, execution, provider effect, reconciliation, and recovery.

**Stable identity:** registered action ID plus domain receipt ID

**Revision identity:** Append-only lifecycle events and readbacks

**Canonical storage/read custody:**

- MoonSleep Ops: `domain action and receipt tables` (canonical; identity `action_id or receipt_id`)

**Key fields:** `action_id`, `target_object_type`, `target_object_id`, `preview`, `approval`, `execution_state`, `provider_effect`, `readback`, `receipt_sha256`, `recovery_state`.

**Projection/action boundary:** Observation target `through_owner_adapter`; projection authority `false`; implicit action authority `true`.

**Aliases and legacy names:** `resolution receipt`, `provider receipt`.

**Do not recreate:** accepted Observation as action authorization; provider status without readback as completion.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-ops-object-workspace.md`

<a id="moonsleepcommitment"></a>

### Commitment

`moonsleep.commitment` · business_resource · deployed

General evidenced obligation, promise, accepted responsibility, policy-implied responsibility, or detected customer-affecting exception. It can concern any Entity and optionally Customer, Channel, Order, Issue, or other Resource.

**Stable identity:** commitment_id

**Revision identity:** Explicit supersedes_commitment relationship; satisfaction requires owning receipt

**Canonical storage/read custody:**

- MoonSleep PostgreSQL: `public.commitments` (canonical; identity `commitment_id`)
- MoonSleep PostgreSQL: `commitment_channels, commitment_resource_contexts, commitment_satisfaction_events` (canonical)

**Key fields:** `commitment_id`, `commitment_statement`, `commitment_category`, `commitment_basis`, `committed_at`, `due_at`, `due_condition`, `commitment_state`, `completion_evidence_state`, `completed_at`, `breach_state`, `committed_by_entity_id`, `committed_to_entity_id`, `action_authority`.

**Relationships:**

- `committed_by` → `nex.entity` (one; owner: Nex Identity)
- `committed_to` → `nex.entity` (one; owner: Nex Identity)
- `evidenced_in_channel` → `nex.channel` (optional_many; owner: Nex Channels)
- `involves_customer` → `moonsleep.customer` (optional_one; owner: Customer Operations)
- `concerns_order` → `moonsleep.commerce_order` (optional_one; owner: Commerce)
- `belongs_to_issue` → `moonsleep.customer_issue` (optional_one; owner: Customer Operations)
- `supersedes` → `moonsleep.commitment` (optional_one; owner: Commitment contract)
- `satisfied_by` → `moonsleep.action_receipt` (optional_many; owner: Owning mutation domain)

**Projection/action boundary:** Observation target `direct`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `operational obligation`, `customer obligation`.

**Do not recreate:** Customer Obligation subtype table; Issue-required Commitment; promise treated as completed without receipt.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-reviewed-interpretation-projection-pattern.md`
- `moonsleep-v1:infra/ops-analytics/sql/reviewed_commitment_foundation_v1_postgres.sql`

## Nex communications

| Object | Class | Status | Canonical owner | Stable identity | Observation target |
| --- | --- | --- | --- | --- | --- |
| [Channel](#nexchannel) | nex_primitive | deployed | Nex Channels | logical active-channel resolution key platform plus connection_id plus container_id plus nullable thread_id | direct |
| [Channel Participant](#nexchannel_participant) | typed_supporting_object | deployed | Nex Channels | Channel participant ID | direct |
| [Derived Channel Collection](#nexchannel_collection) | read_model | planned | Nex Channels and consuming read domain | content-addressed Set identity plus exact native Channel membership digest | not_applicable |

<a id="nexchannel"></a>

### Channel

`nex.channel` · nex_primitive · deployed

Native provider communication container. Provider threads, inbox conversations, direct-message containers, and support conversations resolve here; a cross-provider history is a derived Entity view, not a synthetic mega-channel.

**Stable identity:** logical active-channel resolution key platform plus connection_id plus container_id plus nullable thread_id

**Revision identity:** Stored Channel row ID is version identity: channels.update soft-deletes the prior row and creates a successor row with a new ID and created_at; table uniqueness includes created_at

**Canonical storage/read custody:**

- Nex: `channels` (canonical; identity `id`)
- Nex: `channel_participants` (canonical; identity `id`)

**Key fields:** `id`, `platform`, `connection_id`, `space_id`, `container_id`, `container_kind`, `thread_id`, `created_at`, `deleted_at`, `metadata_json`.

**Relationships:**

- `has_participant` → `nex.channel_participant` (many; owner: Nex Channels)
- `contains_record` → `nex.record` (many; owner: Nex Records and Channels)

**Projection/action boundary:** Observation target `direct`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `provider conversation`, `provider thread`, `communication container`.

**Do not recreate:** MoonSleep-specific thread table that replaces native Channels; synthetic cross-provider reply route.

**Source contracts:**

- `nex-core:src/storage/migrations/identity/helpers.ts`
- `moonsleep-v1:docs/specs/moonsleep-reviewed-interpretation-projection-pattern.md`

<a id="nexchannel_participant"></a>

### Channel Participant

`nex.channel_participant` · typed_supporting_object · deployed

Effective participation of one Contact and optional Entity in one native Channel, with role and history.

**Stable identity:** Channel participant ID

**Revision identity:** channel_participant_history observations

**Canonical storage/read custody:**

- Nex: `channel_participants` (canonical; identity `id`)
- Nex: `channel_participant_history` (canonical; identity `id`)

**Key fields:** `id`, `channel_id`, `contact_id`, `entity_id`, `role`, `message_count`, `status`.

**Relationships:**

- `in_channel` → `nex.channel` (one; owner: Nex Channels)
- `uses_contact` → `nex.contact` (one; owner: Nex Identity)
- `represents_entity` → `nex.entity` (optional_one; owner: Nex Identity)

**Projection/action boundary:** Observation target `direct`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `thread participant`.

**Do not recreate:** free-text participant arrays as canonical identity.

**Source contracts:**

- `nex-core:src/storage/migrations/identity/helpers.ts`

<a id="nexchannel_collection"></a>

### Derived Channel Collection

`nex.channel_collection` · read_model · planned

Non-routable evidence or history view over an exact membership of native Channels and Records. It can group a multi-channel customer history or claims review corpus while every native Channel remains independently visible and replyable.

**Stable identity:** content-addressed Set identity plus exact native Channel membership digest

**Revision identity:** Changed membership creates a new sealed Set or collection revision

**Canonical storage/read custody:**

- Nex: `sets and set_members` (canonical; identity `id`)
- Consuming domain: `derived Channel collection read` (projection)

**Key fields:** `set_id`, `channel_refs`, `record_revision_refs`, `membership_sha256`, `subject_entity_refs`, `effective_start`, `effective_end`, `routable`.

**Relationships:**

- `represented_by_set` → `nex.set` (one; owner: Nex Memory)
- `includes_channel` → `nex.channel` (many; owner: Nex Channels)
- `includes_revision` → `nex.record_revision` (optional_many; owner: Nex Records)

**Projection/action boundary:** Observation target `not_applicable`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `logical evidence collection`, `multi-Channel history view`.

**Do not recreate:** mega reply route; replacement native Channel identity.

**Open questions:** Shared read API and membership contract remain to be published.

**Source contracts:**

- `nex-core:src/storage/migrations/memory/helpers.ts`
- `moonsleep-v1:infra/ops-analytics/sql/claims_reviewed_projection_v1_postgres.sql`

## Nex evidence

| Object | Class | Status | Canonical owner | Stable identity | Observation target |
| --- | --- | --- | --- | --- | --- |
| [Attachment](#nexattachment) | evidence_custody | deployed | Nex Records | Record ID plus attachment ID; content hash detects exact binary identity | not_applicable |
| [Record](#nexrecord) | nex_primitive | deployed | Nex Records | Nex record ID plus unique provider platform and provider record ID | not_applicable |
| [Record Revision](#nexrecord_revision) | evidence_custody | deployed | Nex Records | Nex record_revision_id | not_applicable |

<a id="nexattachment"></a>

### Attachment

`nex.attachment` · evidence_custody · deployed

File or media evidence attached to a source Record, with immutable content identity and optional interpretation kept separate from the binary custody.

**Stable identity:** Record ID plus attachment ID; content hash detects exact binary identity

**Revision identity:** Attachment revision follows its owning Record Revision

**Canonical storage/read custody:**

- Nex: `attachments` (canonical; identity `record_id,id`)
- Nex: `attachment_interpretations` (projection)

**Key fields:** `record_id`, `id`, `filename`, `mime_type`, `size`, `content_hash`, `url`, `local_path`.

**Relationships:**

- `attached_to` → `nex.record` (one; owner: Nex Records)

**Projection/action boundary:** Observation target `not_applicable`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `document`, `source document`.

**Do not recreate:** treating one PDF as one Invoice or Claim.

**Source contracts:**

- `nex-core:src/storage/migrations/records/helpers.ts`

<a id="nexrecord"></a>

### Record

`nex.record` · nex_primitive · deployed

Stable source-object envelope for one provider record identity. It is evidence, not a business Resource. Exact immutable payload custody belongs to Record Revision.

**Stable identity:** Nex record ID plus unique provider platform and provider record ID

**Revision identity:** nex.record_revision

**Canonical storage/read custody:**

- Nex: `records` (canonical; identity `id`)

**Key fields:** `id`, `record_id`, `platform`, `content_type`, `timestamp`, `received_at`, `sender_entity_id`, `receiver_entity_id`, `sender_contact_id`, `receiver_contact_id`, `container_id`, `thread_id`, `metadata`.

**Relationships:**

- `has_revision` → `nex.record_revision` (many; owner: Nex Records)
- `has_attachment` → `nex.attachment` (optional_many; owner: Nex Records)
- `observed_in_channel` → `nex.channel` (optional_one; owner: Nex identity and Channels)

**Projection/action boundary:** Observation target `not_applicable`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `source_record`, `communication_occurrence`.

**Do not recreate:** domain-local copies of source messages or provider rows.

**Source contracts:**

- `nex-core:src/storage/migrations/records/helpers.ts`
- `moonsleep-v1:docs/specs/moonsleep-reviewed-interpretation-projection-pattern.md`

<a id="nexrecord_revision"></a>

### Record Revision

`nex.record_revision` · evidence_custody · deployed

Immutable capture of one exact provider payload version, including content digest, source/capture timing, registration receipt, and attachment revision membership. Episodes bind Record Revisions, not mutable search results.

**Stable identity:** Nex record_revision_id

**Revision identity:** Content-addressed immutable revision; no in-place successor mutation

**Canonical storage/read custody:**

- Nex PostgreSQL: `nex_runtime.record_revisions` (canonical; identity `id`)
- Nex PostgreSQL: `nex_runtime.record_revision_registration_receipts` (canonical)

**Key fields:** `id`, `record_id`, `content_sha256`, `source_timestamp`, `captured_at`, `registration_receipt_id`, `access_scope`.

**Relationships:**

- `revision_of` → `nex.record` (one; owner: Nex Records)
- `member_of_episode` → `nex.episode` (optional_many; owner: Nex Memory evidence)

**Projection/action boundary:** Observation target `not_applicable`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `immutable Record`, `source revision`.

**Do not recreate:** hash-only domain evidence rows presented as canonical revision custody.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-reviewed-interpretation-projection-pattern.md`
- `moonsleep-v1:infra/ops-analytics/scripts/export_reviewed_interpretation_nex_record_index.py`

## Nex identity

| Object | Class | Status | Canonical owner | Stable identity | Observation target |
| --- | --- | --- | --- | --- | --- |
| [Contact](#nexcontact) | nex_primitive | deployed | Nex Identity | platform plus space_id plus contact_id, represented by immutable Contact row ID | direct |
| [Contact Observation](#nexcontact_observation) | evidence_custody | deployed | Nex Identity | Contact observation ID | not_applicable |
| [Entity](#nexentity) | nex_primitive | deployed | Nex Identity | Nex entity ID | direct |
| [Entity Role](#nexentity_role) | typed_supporting_object | deployed | Nex Identity and owning business domain | Entity ID plus active role/tag value | direct |

<a id="nexcontact"></a>

### Contact

`nex.contact` · nex_primitive · deployed

Platform- and space-scoped address or account through which an Entity is observed or contacted. Shopify and Gmail Contacts can represent the same Entity without being the same Contact.

**Stable identity:** platform plus space_id plus contact_id, represented by immutable Contact row ID

**Revision identity:** Contact observations retain seen names and platform aliases

**Canonical storage/read custody:**

- Nex: `contacts` (canonical; identity `id`)

**Key fields:** `id`, `entity_id`, `platform`, `space_id`, `contact_id`, `contact_name`, `avatar_url`, `origin`, `last_observed_at`, `deleted_at`.

**Relationships:**

- `represents` → `nex.entity` (one; owner: Nex Identity)
- `participates_in` → `nex.channel` (optional_many; owner: Nex Channels)
- `has_observation` → `nex.contact_observation` (many; owner: Nex Identity)

**Projection/action boundary:** Observation target `direct`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `email contact`, `Shopify customer contact`, `Gmail participant`.

**Do not recreate:** email-string-only customer rows; domain-local Contacts.

**Source contracts:**

- `nex-core:src/storage/migrations/identity/helpers.ts`

<a id="nexcontact_observation"></a>

### Contact Observation

`nex.contact_observation` · evidence_custody · deployed

Immutable observation that a platform contact identity, name, or alias was seen and resolved or proposed against a Contact and Entity.

**Stable identity:** Contact observation ID

**Revision identity:** Immutable append-only sighting

**Canonical storage/read custody:**

- Nex: `contact_observations` (canonical; identity `id`)

**Key fields:** `id`, `contact_row_id`, `entity_id`, `platform`, `space_id`, `contact_id`, `observed_platform`, `observed_contact_id`, `origin`, `observed_at`.

**Relationships:**

- `observes_contact` → `nex.contact` (optional_one; owner: Nex Identity)
- `resolves_entity` → `nex.entity` (optional_one; owner: Nex Identity)

**Projection/action boundary:** Observation target `not_applicable`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `contact history`.

**Do not recreate:** silent Contact-to-Entity merge based only on a matching string.

**Source contracts:**

- `nex-core:src/storage/migrations/identity/helpers.ts`

<a id="nexentity"></a>

### Entity

`nex.entity` · nex_primitive · deployed

Cross-platform identity for a person, organization, agent, or other identity-bearing actor. Platform Contacts point to an Entity; merges are explicit and historical.

**Stable identity:** Nex entity ID

**Revision identity:** Explicit update/merge history; merged_into preserves canonicalization

**Canonical storage/read custody:**

- Nex: `entities` (canonical; identity `id`)
- Nex: `entity_tags` (canonical; identity `id`)

**Key fields:** `id`, `name`, `type`, `merged_into`, `normalized`, `origin`, `created_at`, `updated_at`, `deleted_at`.

**Relationships:**

- `represented_by_contact` → `nex.contact` (optional_many; owner: Nex Identity)
- `participates_in_channel` → `nex.channel` (optional_many; owner: Nex Channels)

**Projection/action boundary:** Observation target `direct`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `person identity`, `organization identity`, `customer-role entity`.

**Do not recreate:** domain-local person or organization copies; Customer rows that duplicate an existing Entity.

**Source contracts:**

- `nex-core:src/storage/migrations/identity/helpers.ts`

<a id="nexentity_role"></a>

### Entity Role

`nex.entity_role` · typed_supporting_object · deployed

Effective role classification attached to an Entity, such as Customer, Shopify, supplier, carrier, or partner. A role does not create a second Entity.

**Stable identity:** Entity ID plus active role/tag value

**Revision identity:** Append/delete role history

**Canonical storage/read custody:**

- Nex: `entity_tags` (canonical; identity `id`)

**Key fields:** `id`, `entity_id`, `tag`, `created_at`, `deleted_at`.

**Relationships:**

- `classifies` → `nex.entity` (one; owner: Nex Identity)

**Projection/action boundary:** Observation target `direct`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `entity tag`, `business role`.

**Do not recreate:** standalone Customer identity when Customer is an Entity role.

**Source contracts:**

- `nex-core:src/storage/migrations/identity/helpers.ts`

## Nex orchestration

| Object | Class | Status | Canonical owner | Stable identity | Observation target |
| --- | --- | --- | --- | --- | --- |
| [Adapter Connection](#nexadapter_connection) | nex_primitive | deployed | Nex Adapters | adapter connection ID | not_applicable |
| [Agent](#nexagent) | nex_primitive | deployed | Nex Agents | agent ID backed by Entity identity | not_applicable |
| [Event Subscription](#nexevent_subscription) | nex_primitive | deployed | Nex Jobs | subscription ID | not_applicable |
| [Job and Job Run](#nexjob) | nex_primitive | deployed | Nex Jobs | job ID and run ID | not_applicable |
| [Set](#nexset) | nex_primitive | deployed | Nex Memory | set ID and definition | not_applicable |
| [Workspace](#nexworkspace) | nex_primitive | deployed | Nex Workspaces | workspace ID | not_applicable |

<a id="nexadapter_connection"></a>

### Adapter Connection

`nex.adapter_connection` · nex_primitive · deployed

Configured provider connection and its live-sync/backfill state. It supplies Records and identity observations but does not own business semantics.

**Stable identity:** adapter connection ID

**Revision identity:** Connection configuration and monitor state history

**Canonical storage/read custody:**

- Nex: `adapter connection runtime` (canonical; identity `connection_id`)

**Key fields:** `connection_id`, `adapter_id`, `account_scope`, `status`, `live_sync_state`, `backfill_state`.

**Relationships:**

- `creates_channel` → `nex.channel` (optional_many; owner: Nex Channels)
- `ingests_record` → `nex.record` (optional_many; owner: Nex Records)

**Projection/action boundary:** Observation target `not_applicable`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `source connection`.

**Do not recreate:** provider badge as freshness proof.

**Source contracts:**

- `nex-core:src/runtime/domains/adapters`

<a id="nexagent"></a>

### Agent

`nex.agent` · nex_primitive · deployed

Configured operating identity and behavior that can run Jobs or conversations within explicit authority. Agent output is candidate interpretation until accepted.

**Stable identity:** agent ID backed by Entity identity

**Revision identity:** Agent configuration and session history

**Canonical storage/read custody:**

- Nex: `agents runtime` (canonical; identity `agent_id`)

**Key fields:** `agent_id`, `entity_id`, `workspace_id`, `role_config`, `model_config`, `status`.

**Relationships:**

- `has_identity` → `nex.entity` (one; owner: Nex Identity)
- `uses_workspace` → `nex.workspace` (one; owner: Nex Workspaces)

**Projection/action boundary:** Observation target `not_applicable`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `persistent agent`, `investigator`.

**Do not recreate:** agent confidence as acceptance authority.

**Source contracts:**

- `nex-core:src/storage/agents.ts`

<a id="nexevent_subscription"></a>

### Event Subscription

`nex.event_subscription` · nex_primitive · deployed

Durable rule selecting runtime events that should enqueue governed work. Subscription breadth never changes evidence or action authority.

**Stable identity:** subscription ID

**Revision identity:** Explicit subscription revisions

**Canonical storage/read custody:**

- Nex: `events.subscriptions runtime` (canonical; identity `subscription_id`)

**Key fields:** `subscription_id`, `event_selector`, `target_job`, `enabled`, `created_at`, `updated_at`.

**Relationships:**

- `enqueues_job` → `nex.job` (many; owner: Nex Jobs)

**Projection/action boundary:** Observation target `not_applicable`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `record subscription`.

**Do not recreate:** fast recognizer required as a second mandatory stage.

**Source contracts:**

- `nex-core:src/runtime/domains`

<a id="nexjob"></a>

### Job and Job Run

`nex.job` · nex_primitive · deployed

Durable execution request and run receipt. Jobs may produce candidate outputs but are never source evidence or business Resources.

**Stable identity:** job ID and run ID

**Revision identity:** Run attempts and status history

**Canonical storage/read custody:**

- Nex: `jobs, runs, queue, idempotency, and DAG runtime` (canonical; identity `job_id`)

**Key fields:** `job_id`, `job_type`, `input_set_id`, `status`, `idempotency_key`, `created_at`, `started_at`, `completed_at`, `error`.

**Relationships:**

- `uses_input_set` → `nex.set` (optional_one; owner: Nex Jobs)

**Projection/action boundary:** Observation target `not_applicable`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `run`, `automation execution`.

**Do not recreate:** job output treated as accepted Fact or Resource.

**Source contracts:**

- `nex-core:src/storage/migrations/memory/helpers.ts`

<a id="nexset"></a>

### Set

`nex.set` · nex_primitive · deployed

Named or content-addressed membership collection used for job inputs, review packets, or derived cross-object collections. A Set never replaces the stable identity of its members.

**Stable identity:** set ID and definition

**Revision identity:** Sealed membership or a new Set

**Canonical storage/read custody:**

- Nex: `sets and set_members` (canonical; identity `id`)

**Key fields:** `id`, `definition_id`, `created_at`, `metadata`, `member_type`, `member_id`, `position`.

**Projection/action boundary:** Observation target `not_applicable`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `review packet`, `derived collection`.

**Do not recreate:** synthetic multi-channel collection used as a reply route.

**Source contracts:**

- `nex-core:src/storage/migrations/memory/helpers.ts`

<a id="nexworkspace"></a>

### Workspace

`nex.workspace` · nex_primitive · deployed

Durable operating context for an Entity or Agent, including identity and role-facing files. A Workspace is not a business customer, company, or case.

**Stable identity:** workspace ID

**Revision identity:** Manifest and file revision history

**Canonical storage/read custody:**

- Nex: `workspace runtime and manifest` (canonical; identity `workspace_id`)

**Key fields:** `workspace_id`, `entity_id`, `manifest`, `created_at`, `updated_at`.

**Relationships:**

- `owned_by` → `nex.entity` (one; owner: Nex Workspaces)

**Projection/action boundary:** Observation target `not_applicable`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `agent workspace`.

**Do not recreate:** Workspace interpreted as business Entity.

**Source contracts:**

- `nex-core:src/runtime/domains`

## Nex semantics

| Object | Class | Status | Canonical owner | Stable identity | Observation target |
| --- | --- | --- | --- | --- | --- |
| [Episode](#nexepisode) | nex_primitive | deployed | Nex Memory evidence | Immutable evidence-set ID returned as episode_id, bound to exact Record Revision membership and sealed scope/member digests | not_applicable |
| [Fact](#nexfact) | nex_primitive | deployed | Nex Memory evidence | fact_id | not_applicable |
| [Observation](#nexobservation) | nex_primitive | deployed | Nex Memory evidence | observation_id and deterministic head key | not_applicable |
| [Resource Attribute Projection Custody](#nexresource_attribute_projection) | evidence_custody | deployed | Owning Resource domain with Nex Observation authority | attribute projection link and receipt IDs | not_applicable |
| [Resource Relationship Projection Custody](#nexresource_relationship_projection) | evidence_custody | deployed | Owning Resource domain with Nex Observation authority | relationship projection link and receipt IDs | not_applicable |
| [Sealed Fact Set](#nexfact_set) | nex_primitive | deployed | Nex Memory evidence | input_set_id plus sorted membership digest | not_applicable |

<a id="nexepisode"></a>

### Episode

`nex.episode` · nex_primitive · deployed

Immutable bounded set of exact Record Revisions reviewed together for one coherent period or subject.

**Stable identity:** Immutable evidence-set ID returned as episode_id, bound to exact Record Revision membership and sealed scope/member digests

**Revision identity:** Episode membership is immutable; any membership or scope change creates a new Episode with a new episode_id

**Canonical storage/read custody:**

- Nex Memory evidence: `memory.evidence.episodes` (canonical; identity `episode_id`)

**Key fields:** `episode_id`, `profile_id`, `profile_version`, `subject`, `effective_start`, `effective_end`, `record_revision_count`, `record_set_sha256`, `seal`.

**Relationships:**

- `contains_revision` → `nex.record_revision` (many; owner: Nex Memory evidence)
- `contains_fact` → `nex.fact` (many; owner: Nex Memory evidence)

**Projection/action boundary:** Observation target `not_applicable`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `review chapter`, `bounded history window`.

**Do not recreate:** mutable chapter membership; search-result-as-episode; legacy Memory review Episode treated as continuous-evidence Episode authority.

**Source contracts:**

- `nex-core:docs/specs/evidence-episodes-and-typed-facts.md`
- `nex-core:src/api/server-methods/memory-evidence.ts`
- `nex-core:src/capabilities/memory/evidence.ts`
- `moonsleep-v1:docs/specs/moonsleep-reviewed-interpretation-projection-pattern.md`

<a id="nexfact"></a>

### Fact

`nex.fact` · nex_primitive · deployed

Immutable typed assertion supported by exact fragments from Record Revisions inside one Episode.

**Stable identity:** fact_id

**Revision identity:** Changed or corroborating evidence creates another Fact; prior Facts remain

**Canonical storage/read custody:**

- Nex Memory evidence: `memory.evidence.facts` (canonical; identity `fact_id`)

**Key fields:** `fact_id`, `episode_id`, `assertion_type`, `subject`, `value`, `effective_from`, `effective_through`, `effective_precision`, `support_fragments`.

**Relationships:**

- `belongs_to_episode` → `nex.episode` (one; owner: Nex Memory evidence)
- `member_of_fact_set` → `nex.fact_set` (optional_many; owner: Nex Memory evidence)

**Projection/action boundary:** Observation target `not_applicable`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `fact assertion`.

**Do not recreate:** model guesses presented as Facts; direct Fact-to-Resource writes; Fact citation outside its one governing Episode.

**Source contracts:**

- `nex-core:docs/specs/evidence-episodes-and-typed-facts.md`
- `nex-core:src/api/server-methods/memory-evidence.ts`
- `nex-core:src/capabilities/memory/evidence.ts`
- `moonsleep-v1:docs/specs/moonsleep-reviewed-interpretation-projection-pattern.md`

<a id="nexobservation"></a>

### Observation

`nex.observation` · nex_primitive · deployed

Versioned reviewed interpretation of one sealed Fact set for a Resource attribute or typed relationship. It carries uncertainty, contradiction state, business-effective timing, and semantic predecessor history.

**Stable identity:** observation_id and deterministic head key

**Revision identity:** revision_number plus prior_observation_id within one head

**Canonical storage/read custody:**

- Nex Memory evidence: `Observation candidates, committed Observations, heads, and semantic receipts` (canonical; identity `observation_id`)
- MoonSleep PostgreSQL: `evidence_nex_observation_refs` (reference; identity `observation_id`) — Immutable custody reference, not a copied Observation

**Key fields:** `observation_id`, `head_key`, `revision_number`, `prior_observation_id`, `profile_id`, `subject`, `input_set_id`, `input_set_sha256`, `output_payload_sha256`, `effective_from`, `effective_through`, `effective_precision`, `review_decision`.

**Relationships:**

- `interprets` → `nex.fact_set` (one; owner: Nex Memory evidence)
- `projects_attribute_through` → `nex.resource_attribute_projection` (optional_many; owner: Owning Resource domain)
- `projects_relationship_through` → `nex.resource_relationship_projection` (optional_many; owner: Owning Resource domain)

**Projection/action boundary:** Observation target `not_applicable`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `reviewed interpretation`, `semantic Observation`.

**Do not recreate:** domain-local semantic history; projection row as Observation authority; legacy Memory review Observation treated as semantic authority.

**Source contracts:**

- `nex-core:docs/specs/evidence-episodes-and-typed-facts.md`
- `nex-core:src/api/server-methods/memory-evidence.ts`
- `nex-core:src/capabilities/memory/evidence.ts`
- `moonsleep-v1:docs/specs/moonsleep-reviewed-interpretation-projection-pattern.md`
- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="nexresource_attribute_projection"></a>

### Resource Attribute Projection Custody

`nex.resource_attribute_projection` · evidence_custody · deployed

Append-only receipt that one exact Nex Observation was applied to one registered Resource attribute. It is custody, not a second Resource or Observation.

**Stable identity:** attribute projection link and receipt IDs

**Revision identity:** Semantic predecessor remains the Nex Observation predecessor; current projection is derived

**Canonical storage/read custody:**

- MoonSleep PostgreSQL: `evidence_resource_attribute_observation_links` (canonical; identity `attribute_link_id`)
- MoonSleep PostgreSQL: `evidence_resource_attribute_projection_current_v3` (projection)

**Key fields:** `resource_type`, `resource_id`, `attribute_path`, `observation_id`, `projected_value`, `projection_receipt_id`, `projected_at`.

**Relationships:**

- `governed_by` → `nex.observation` (one; owner: Nex Memory evidence)

**Projection/action boundary:** Observation target `not_applicable`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `attribute Observation link`.

**Do not recreate:** second active/superseded chain outside Nex Observation history.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="nexresource_relationship_projection"></a>

### Resource Relationship Projection Custody

`nex.resource_relationship_projection` · evidence_custody · deployed

Append-only receipt that one exact Nex Observation was applied to one registered typed Resource relationship.

**Stable identity:** relationship projection link and receipt IDs

**Revision identity:** Semantic predecessor remains the Nex Observation predecessor

**Canonical storage/read custody:**

- MoonSleep PostgreSQL: `evidence_resource_relationship_observation_links` (canonical; identity `relationship_link_id`)
- MoonSleep PostgreSQL: `evidence_resource_relationship_projection_current_v3` (projection)

**Key fields:** `from_resource_type`, `from_resource_id`, `relationship_type`, `to_resource_type`, `to_resource_id`, `relationship_attributes`, `observation_id`, `projection_receipt_id`.

**Relationships:**

- `governed_by` → `nex.observation` (one; owner: Nex Memory evidence)

**Projection/action boundary:** Observation target `not_applicable`; projection authority `true`; implicit action authority `false`.

**Aliases and legacy names:** `relationship Observation link`.

**Do not recreate:** untyped foreign-key guesses; relationship cardinality inferred from one chapter.

**Source contracts:**

- `moonsleep-v1:infra/ops-analytics/sql/reviewed_interpretation_nex_projection_v3_postgres.sql`

<a id="nexfact_set"></a>

### Sealed Fact Set

`nex.fact_set` · nex_primitive · deployed

Sorted immutable Fact membership and digest used as the complete bounded input to an Observation.

**Stable identity:** input_set_id plus sorted membership digest

**Revision identity:** Immutable seal

**Canonical storage/read custody:**

- Nex Memory evidence: `sealed sets and Observation input membership` (canonical; identity `input_set_id`)

**Key fields:** `input_set_id`, `input_count`, `input_set_sha256`, `sealed_at`, `members`.

**Relationships:**

- `contains_fact` → `nex.fact` (many; owner: Nex Memory evidence)
- `interpreted_by` → `nex.observation` (optional_many; owner: Nex Memory evidence)

**Projection/action boundary:** Observation target `not_applicable`; projection authority `false`; implicit action authority `false`.

**Aliases and legacy names:** `Observation input set`.

**Do not recreate:** unordered or mutable input membership.

**Source contracts:**

- `moonsleep-v1:docs/specs/moonsleep-reviewed-interpretation-projection-pattern.md`

## Open gap register

| Gap | Status | Owner | Decision | Affected objects |
| --- | --- | --- | --- | --- |
| `shopify-record-revision-custody-chapter1` Seven historical Shopify Records lack canonical Record Revision registration | open | Nex Records | Keep the existing Records and Orders. Register immutable revisions from the durable source payloads through the canonical registrar before using them as Episode members; no provider refetch or new Order schema is implied. | `nex.record`, `nex.record_revision`, `nex.episode`, `moonsleep.commerce_order` |
| `gmail-native-channel-contact-replay-chapter1` Seven historical Gmail conversations have communication projections but no native Channel/participant Contact materialization | open | Nex Gmail adapter and Identity | Run a bounded historical identity and Channel replay through the current adapter machinery. Do not manually create a MoonSleep thread table or new Customer Entities. | `nex.record`, `nex.channel`, `nex.channel_participant`, `nex.contact`, `moonsleep.customer_thread`, `moonsleep.customer` |
| `observation-target-adapters` Shared reviewed projection needs typed adapters for all registered canonical targets | open | Nex semantic foundation and each owning domain | Extend the closed target and relationship registry so Observations can address existing objects in place. Never copy native Contacts, Orders, Entities, Channels, or Issues into a parallel Resource store. | `nex.observation`, `nex.resource_attribute_projection`, `nex.resource_relationship_projection`, `nex.entity`, `nex.contact`, `nex.channel`, `moonsleep.customer`, `moonsleep.commerce_order`, `moonsleep.customer_issue` |
| `supply-organization-entity-crosswalk` Supply organization compatibility IDs are not yet mandatorily crosswalked to Nex Organization Entities | open | Identity steward and Supply | Add an evidence-backed mandatory reference/crosswalk; do not merge or recreate organizations from provider text. | `moonsleep.supply_organization`, `moonsleep.partner`, `nex.entity`, `nex.contact` |
| `finance-party-entity-crosswalk` Finance AP party IDs are not yet production-enforced against canonical Nex Organization Entities | open | Identity steward and Finance | Register a typed party-to-Entity relationship with evidence and review; retain AP party as subledger identity without making it a second Organization. | `moonsleep.finance_ap_party`, `moonsleep.invoice`, `moonsleep.partner`, `nex.entity` |
| `finance-local-observation-compatibility` Finance-local observation tables need explicit compatibility and retirement semantics | open | Finance and Nex semantic foundation | Mark them as references/projections of canonical Nex Observations, define regeneration or retirement, and prohibit an independent predecessor chain. | `moonsleep.finance_observation_compat`, `nex.observation` |
| `finance-provider-payment-coverage` Payment registration covers Mercury AP payment orders but not PayPal or other providers | open | Finance and provider adapters | Register provider-native account and payment identities before they participate. Do not overload PayPal into Mercury identity and do not infer a Payment from an email, amount, or creator statement alone. | `moonsleep.payment`, `moonsleep.cash_card_account`, `moonsleep.finance_source_record_bridge` |
| `finance-cross-domain-typed-links` Finance cross-domain reconciliation and source-resource links lack deployed typed join contracts | open | Finance with Commerce, Inventory, Supply, and Claims | Define exact join storage, stable identity, cardinality, owner, and evidence before projecting Invoice-to-PO, Invoice-Line-to-Claim, Transaction-to-Payment-or-Refund, Sample-Payment-to-Payment, or Recovery-to-Transaction relationships. | `moonsleep.invoice`, `moonsleep.invoice_line`, `moonsleep.purchase_order`, `moonsleep.carrier_case`, `moonsleep.carrier_recovery_receipt`, `moonsleep.financial_transaction`, `moonsleep.payment`, `moonsleep.refund`, `moonsleep.sample_payment_report` |
| `cross-domain-transport-identity` Tracking and transport identity remains split across Dispatch package attempts and source-owned carrier evidence | open | Dispatch, Claims, and Supply | Reuse Fulfillment Package today and preserve ambiguous tracking as Observations. Generalize only after an owner and stable cross-domain transport identity are proven. | `moonsleep.fulfillment_package`, `moonsleep.carrier_incident` |
| `derived-channel-collection-read-contract` Cross-Channel customer histories and evidence collections need one registered derived read contract | open | Nex Channels, Customer Operations, and consuming review domains | Define a non-routable, content-addressed derived collection that preserves every native Channel and reply route. Reuse it for Customer history and claims evidence grouping without creating a synthetic cross-provider Channel identity. | `nex.channel_collection`, `nex.set`, `moonsleep.customer_thread`, `moonsleep.customer`, `nex.channel` |

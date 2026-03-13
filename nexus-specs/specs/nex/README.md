# NEX — Nexus Runtime

**Last Updated:** 2026-03-08

---

## Canonical Specs

These are the authoritative target-state definitions. Everything in the codebase must converge to what these documents describe.

| Spec | Description |
|------|-------------|
| [NEX_ARCHITECTURE_AND_SDK_MODEL.md](./NEX_ARCHITECTURE_AND_SDK_MODEL.md) | **Start here.** The 4-layer architecture (Core, Transport, Client, SDK), app model, operation taxonomy as API, Nex SDK vs Adapter SDK. |
| [API_CONTRACT_MODEL.md](./API_CONTRACT_MODEL.md) | Canonical split between Frontdoor API, Nex API, Adapter API, and App API, plus the OpenAPI/SDK projection model. |
| [ADAPTER_API_CAPTURE_AND_PUBLICATION_MODEL.md](./ADAPTER_API_CAPTURE_AND_PUBLICATION_MODEL.md) | Canonical boundary for adapter-owned package contracts versus Nex runtime adapter wrapper methods, plus first-wave per-adapter OpenAPI publication rules. |
| [OPENAPI_CONTRACT_ARTIFACT_MODEL.md](./OPENAPI_CONTRACT_ARTIFACT_MODEL.md) | Canonical central storage and generation model for OpenAPI artifacts across Frontdoor API, Nex API, App API, and Adapter API. |
| [TRANSPORT_SURFACE_MODEL.md](./TRANSPORT_SURFACE_MODEL.md) | Detailed canonical transport model: real transports only, internal dispatch is not a surface, browser app launch is not an operation, and ordinary Nex API operations are transport-neutral. |
| [RUNTIME_API_BOUNDARY_AND_EXTENSION_OWNERSHIP.md](./RUNTIME_API_BOUNDARY_AND_EXTENSION_OWNERSHIP.md) | Canonical runtime boundary and ownership model for document routes, app APIs, adapter APIs, and hosted relays around the Nex API. |
| [RUNTIME_API_AUTHZ_TAXONOMY.md](./RUNTIME_API_AUTHZ_TAXONOMY.md) | Canonical method-based IAM taxonomy for Nex runtime methods, including method kinds, actions, resources, and `core.<resource>.<action>` permission names. |
| [COMMUNICATION_MODEL.md](./COMMUNICATION_MODEL.md) | **Communication nouns and boundaries.** Locks `record`, `event`, `conversation`, `session`, `persona`, and `workspace`, plus the safety boundary between managing conversations and jobs. |
| [NEXUS_REQUEST_TARGET.md](./NEXUS_REQUEST_TARGET.md) | **The core spec.** NexusRequest data bus, 5-stage pipeline, Entity model, `record.ingest` / `record.ingested`, conversations, jobs, and memory integration. |
| [AGENT_DELIVERY.md](./AGENT_DELIVERY.md) | Agent-driven delivery model. The pipeline doesn't deliver — the agent invokes tools. Adapter owns typing, chunking, streaming. |
| [ATTACHMENTS.md](./ATTACHMENTS.md) | Unified attachment schema across all layers. Zero translation from adapter protocol to the records ledger. |
| [NEX_APP_MANIFEST_AND_PACKAGE_MODEL.md](./NEX_APP_MANIFEST_AND_PACKAGE_MODEL.md) | Canonical app package and manifest contract: execution modes, multi-service routing, dependencies, package boundaries, product metadata. |

---

## Supporting Specs

Topics not covered by the canonical specs that are still relevant and active.

| Spec | Description |
|------|-------------|
| [ADAPTER_INTERFACE_UNIFICATION.md](./ADAPTER_INTERFACE_UNIFICATION.md) | NexusAdapter interface, operation catalog (70+ operations), SDK contract, clock scheduling cutover. |
| [DAEMON.md](./DAEMON.md) | Process lifecycle — startup, signals, shutdown, crash recovery, CLI commands. |
| [RELAY_FEDERATION_MCP_ARCHITECTURE.md](./RELAY_FEDERATION_MCP_ARCHITECTURE.md) | Federation layer for Nex-to-Nex communication, MCP integration, nex-peer adapter. |
| [hosted/HOSTED_APP_PLATFORM_CONTRACT.md](./hosted/HOSTED_APP_PLATFORM_CONTRACT.md) | Cross-system hosted app reference: frontdoor, runtime, DNS/routing, callbacks, packaging, publish/install/upgrade. |
| [hosted/HOSTED_ACCOUNT_AND_SERVER_ACCESS.md](./hosted/HOSTED_ACCOUNT_AND_SERVER_ACCESS.md) | Hosted account membership, server selection, active session context, and runtime token minting rules. |
| [hosted/HOSTED_OBJECT_TAXONOMY.md](./hosted/HOSTED_OBJECT_TAXONOMY.md) | Canonical hosted vocabulary: account, user, server, runtime, tenant_id, and when `workspace` is allowed to appear. |
| [hosted/HOSTED_PLATFORM_ACCESS_AND_ROUTING.md](./hosted/HOSTED_PLATFORM_ACCESS_AND_ROUTING.md) | Hosted launch profiles, object model, token layering, WebSocket transport, DNS/domain classes, callback ownership. |
| [hosted/HOSTED_RUNTIME_PROFILE.md](./hosted/HOSTED_RUNTIME_PROFILE.md) | Hosted runtime security profile: strict auth, tenant pinning, callback surfaces, and operator endpoint boundaries. |
| [hosted/HOSTED_TENANT_ORIGIN_RUNTIME_ACCESS.md](./hosted/HOSTED_TENANT_ORIGIN_RUNTIME_ACCESS.md) | Direct tenant-origin runtime access profile for browsers and machine clients using runtime access tokens. |
| [hosted/HOSTED_ARTIFACT_REGISTRY_AND_RELEASES.md](./hosted/HOSTED_ARTIFACT_REGISTRY_AND_RELEASES.md) | Durable frontdoor registry, immutable package releases, variant blobs, dependency metadata, publish contract. |
| [hosted/HOSTED_INSTALL_AND_UPGRADE_LIFECYCLE.md](./hosted/HOSTED_INSTALL_AND_UPGRADE_LIFECYCLE.md) | Private operator lifecycle API, server package state, dependency-aware install/uninstall, staged upgrade, rollback. |
| [hosted/HOSTED_ADMIN_AND_BILLING_SURFACES.md](./hosted/HOSTED_ADMIN_AND_BILLING_SURFACES.md) | Frontdoor operator, account, server, and billing surfaces under the account-first hosted model. |
| [hosted/HOSTED_PRODUCT_CONTROL_PLANES.md](./hosted/HOSTED_PRODUCT_CONTROL_PLANES.md) | Product-specific control planes, admin apps, product-managed provider profiles, and frontdoor's gateway role. |
| [hosted/HOSTED_PRODUCT_CONTROL_PLANE_SHELL.md](./hosted/HOSTED_PRODUCT_CONTROL_PLANE_SHELL.md) | Reusable shell for product control plane services and admin apps: ingress, managed profiles, secret ops, diagnostics, config, and product modules. |
| [adapters/ADAPTER_CONNECTION_ARCHITECTURE.md](./adapters/ADAPTER_CONNECTION_ARCHITECTURE.md) | Architecture-level model for shared adapters, app-specific connection profiles, managed provider profiles, connection scope, and `connection_id` identity. |
| [adapters/ADAPTER_CONNECTION_PROFILES_AND_CALLBACKS.md](./adapters/ADAPTER_CONNECTION_PROFILES_AND_CALLBACKS.md) | Shared adapter auth methods, app connection profiles, callback ownership, platform-managed and product-managed connection profiles, and server-vs-app connection scope. |

---

## Validation

Validation artifacts prove the canonical target-state specs.

| Validation | Scope |
|------------|-------|
| [VALIDATION_LADDER.md](./VALIDATION_LADDER.md) | Active runtime validation ladder for the `nex` core. Still under alignment to the newest record/event and work-runtime model. |
| [validation/HOSTED_PLATFORM_VALIDATION_LADDER.md](./validation/HOSTED_PLATFORM_VALIDATION_LADDER.md) | Hosted/runtime validation ladder for the hosted platform model. |

---

## Active Workplans

Current execution plans against the active canonical specs.

| Workplan | Phase | Summary |
|----------|-------|---------|
| [COMMUNICATION_ALIGNMENT_AND_SPEC_HYGIENE_2026-03-06.md](./workplans/COMMUNICATION_ALIGNMENT_AND_SPEC_HYGIENE_2026-03-06.md) | Focused | Active spec-alignment pass for record/event, conversation/session, and persona/workspace cleanup. |
| [MASTER_SPEC_ALIGNMENT_WORKPLAN_2026-03-06.md](./workplans/MASTER_SPEC_ALIGNMENT_WORKPLAN_2026-03-06.md) | Master | Corpus-wide spec alignment pass across root, delivery, memory, ingress, examples, and structure. |
| [SPEC_TREE_KEEP_REWRITE_ARCHIVE_INVENTORY_2026-03-08.md](./workplans/SPEC_TREE_KEEP_REWRITE_ARCHIVE_INVENTORY_2026-03-08.md) | Inventory | Artifact-type inventory of what stays canonical, what must be rewritten or relabeled, what moves to validation/proposal/reference, and what should be archived. |
| [NEX_DOCS_INFORMATION_ARCHITECTURE_REORG_2026-03-08.md](./workplans/NEX_DOCS_INFORMATION_ARCHITECTURE_REORG_2026-03-08.md) | IA | Long-term plan to move active Nex docs into `nex/docs/` with clean canonical/spec/workplan/validation/proposal/archive separation and feature-based names. |
| [ADAPTER_CONNECTION_RUNTIME_CUTOVER_2026-03-06.md](./workplans/ADAPTER_CONNECTION_RUNTIME_CUTOVER_2026-03-06.md) | Focused | Runtime cutover from adapter-singleton `methodIndex` flows to connection-based `connection_id` and app-profile-aware adapter connections. |
| [PRODUCT_CONTROL_PLANE_MANAGED_CONNECTION_CUTOVER_2026-03-06.md](./workplans/PRODUCT_CONTROL_PLANE_MANAGED_CONNECTION_CUTOVER_2026-03-06.md) | Focused | Hard cutover from frontdoor-owned app-managed provider secrets to product-control-plane-owned managed profiles behind the frontdoor gateway. |
| [HOSTED_PLATFORM_GAP_ANALYSIS_2026-03-06.md](./workplans/HOSTED_PLATFORM_GAP_ANALYSIS_2026-03-06.md) | Hosted | Current code vs hosted target-state gap inventory. |
| [HOSTED_PLATFORM_IMPLEMENTATION_WORKPLAN_2026-03-06.md](./workplans/HOSTED_PLATFORM_IMPLEMENTATION_WORKPLAN_2026-03-06.md) | Hosted | Execution sequencing for the hosted platform surface. |
| [HOSTED_SHELL_AND_RUNTIME_TRANSPORT_CUTOVER_2026-03-06.md](./workplans/HOSTED_SHELL_AND_RUNTIME_TRANSPORT_CUTOVER_2026-03-06.md) | Hosted | Runtime shell + hosted transport hard cutover plan. |
| [API_CONTRACT_ALIGNMENT_REVIEW_2026-03-12.md](./workplans/API_CONTRACT_ALIGNMENT_REVIEW_2026-03-12.md) | Focused | Canonical corpus review against the Frontdoor API / Nex API / Adapter API / App API split. |
| [TRANSPORT_SURFACE_HARD_CUTOVER_2026-03-12.md](./workplans/TRANSPORT_SURFACE_HARD_CUTOVER_2026-03-12.md) | Focused | Hard cut from surface-gated runtime methods to transport-neutral Nex API and App API projection. |
| [RUNTIME_API_AND_OPERATOR_CONSOLE_NAMING_HARD_CUTOVER_2026-03-12.md](./workplans/RUNTIME_API_AND_OPERATOR_CONSOLE_NAMING_HARD_CUTOVER_2026-03-12.md) | Focused | Hard cut structural/runtime naming from legacy `control-plane` and `control-ui` residue to `runtime API` and `operator console`. |
| [OPENAPI_FIRST_GENERATORS_WORKPLAN_2026-03-12.md](./workplans/OPENAPI_FIRST_GENERATORS_WORKPLAN_2026-03-12.md) | Focused | Central `contracts/` tree plus the first generated Frontdoor API and AIX App API OpenAPI artifacts. |

---

## Active Proposals

These inform current planning but are not finished-state canonical specs.

| Proposal | Scope |
|----------|-------|
| [JOB_RUNTIME_AND_DAG_ENGINE.md](./workplans/JOB_RUNTIME_AND_DAG_ENGINE.md) | Taskengine-style execution engine proposal: central event dispatcher, `event_subscriptions`, `job_queue`, leasing, retries, delayed work, and DAG advancement. |

---

## Reference And Historical

These are useful, but they are not part of the active canonical target-state contract.

| Document | Why It Is Not Canonical |
|----------|-------------------------|
| [OPERATION_TAXONOMY.md](./OPERATION_TAXONOMY.md) | Historical pre-redesign operation taxonomy baseline. |
| [SESSION_ROUTING_UNIFICATION.md](./SESSION_ROUTING_UNIFICATION.md) | Superseded by the communication-model and conversation/session split. |
| [CUTOVER_INDEX.md](./workplans/CUTOVER_INDEX.md) | Historical cutover sequencing reference, not the current active workplan surface. |

---

## Subdirectories

| Directory | Description |
|-----------|-------------|
| `ingress/` | Ingress integrity, credentials, and multi-user trust boundaries. |
| `hosted/` | Hosted app platform, account/server access, runtime security, tenant-origin access, install lifecycle, billing/admin surfaces. |
| `adapters/` | Shared adapter connection architecture, app connection profiles, callbacks, and webhook ownership. |
| `validation/` | Active validation ladders for the hosted/runtime target state. |
| `workplans/` | Active cutover workplans. |
| `archive/` | Superseded specs and completed workplans (historical reference). |

- [NEX_API_CAPTURE_AND_PUBLICATION_MODEL.md](./NEX_API_CAPTURE_AND_PUBLICATION_MODEL.md) - Defines the dedicated code-facing API contract layers and centralized OpenAPI publication model for Frontdoor, Nex, apps, and adapters.
- [ADAPTER_API_CAPTURE_AND_PUBLICATION_MODEL.md](./ADAPTER_API_CAPTURE_AND_PUBLICATION_MODEL.md) - Defines the adapter-owned package contract boundary, the split from Nex runtime adapter wrappers, and the first-wave per-adapter publication model.

- [NEX_API_CAPTURE_ALIGNMENT_REVIEW_2026-03-12.md](./workplans/NEX_API_CAPTURE_ALIGNMENT_REVIEW_2026-03-12.md) - Reviews the current Nex and Frontdoor spec corpus against the API capture/publication model and identifies stale supporting docs.

- [NEX_API_LAYER_HARD_CUTOVER_2026-03-12.md](./workplans/NEX_API_LAYER_HARD_CUTOVER_2026-03-12.md) - Hard-cut workplan for consolidating ownership under the dedicated `nex/src/nex/runtime-api/` layer and publishing the canonical Nex OpenAPI contract.

- [ADAPTER_CONSUMER_SDK_OWNERSHIP_AND_GENERATION_MODEL.md](./ADAPTER_CONSUMER_SDK_OWNERSHIP_AND_GENERATION_MODEL.md)

- [ADAPTER_STREAM_SESSION_SDK_MODEL.md](./ADAPTER_STREAM_SESSION_SDK_MODEL.md)

- [workplans/ADAPTER_DISCORD_PUBLISHABILITY_HARD_CUTOVER_2026-03-13.md](./workplans/ADAPTER_DISCORD_PUBLISHABILITY_HARD_CUTOVER_2026-03-13.md)

- [ADAPTER_EXPANSION_TAXONOMY.md](./ADAPTER_EXPANSION_TAXONOMY.md)

- [workplans/ADAPTER_GO_PUBLICATION_FIRST_WAVE_2026-03-13.md](./workplans/ADAPTER_GO_PUBLICATION_FIRST_WAVE_2026-03-13.md)

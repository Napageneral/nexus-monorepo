# Frontdoor Sandbox Hosted Cleanroom Validation Model

**Status:** CANONICAL
**Last Updated:** 2026-03-28
**Related:** FRONTDOOR_ARCHITECTURE.md, CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md, FRONTDOOR_AWS_HOSTING_AND_SERVER_CLASS_MODEL.md, `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`, `/Users/tyler/nexus/home/projects/nexus/packages/apps/dispatch/docs/workplans/DISPATCH_PINNED_CLEANROOM_RUNTIME_LANE_2026-03-16.md`

---

## 1) Purpose

This document defines the Frontdoor-specific hosted extension of the broader
cleanroom validation model.

It is not the canonical center of Nex validation philosophy.

The primary local model lives in Nex and Dispatch:

- fresh Nex server per test
- inside a sandbox
- with artifacts and recordings attached to the owning run

This document only owns the case where hosted-control-plane parity is part of
what is being proven.

The goal is to prove the full Frontdoor-managed lifecycle:

1. create server
2. bootstrap owner truth
3. mint runtime auth
4. install apps and adapters
5. exercise runtime behavior
6. capture evidence
7. destroy or archive the server

without relying on:

1. the operator's lived-in host runtime
2. ad hoc local shell state
3. external cloud providers as the default validation target

When hosted validation is required, the path must still look like Frontdoor,
not a sidecar shortcut.

---

## 2) Operator Experience

The intended validation experience is:

1. an operator or agent launches one Docker-backed cleanroom executor
2. that executor talks to Frontdoor through the normal hosted API boundary
3. Frontdoor provisions one disposable hosted server surrogate
4. that surrogate is a sandbox-backed Nex instance running inside a local
   cleanroom substrate
5. Frontdoor still performs the same bootstrap, runtime-token, install, and
   cleanup lifecycle it uses for hosted servers
6. proof bundles are mounted out of the cleanroom for review

The operator should not need to:

1. mutate the host Nex runtime to make the proof pass
2. provision a real cloud VM for ordinary hosted integration proof
3. depend on hidden browser cookies or host CLI auth files

---

## 3) Non-Negotiable Rules

1. Docker-backed or equivalently containerized execution is the default hosted
   validation executor.
2. The canonical hosted cleanroom target is a sandbox-backed disposable Nex
   instance provisioned through Frontdoor semantics.
3. Frontdoor create/read/runtime-token/install/uninstall/archive/destroy seams
   remain the authoritative lifecycle, even in cleanroom mode.
4. The sandbox-backed provider is validation infrastructure, not a new
   customer-facing server class.
5. `standard` and `compliant` remain the only customer-facing server classes.
6. Production hosted servers may still use real cloud providers; sandbox-backed
   cleanroom targets are the default proof substrate, not the canonical
   production substrate.
7. Provider-specific or compliance-bound behavior may still require separate
   cloud validation, but that is an explicit exception, not the default proof
   path.
8. Secrets must be injected explicitly into the cleanroom executor and target;
   ambient host auth is not part of the contract.
9. Proof bundles must survive container teardown through an explicit mounted
   artifact root.
10. This hosted model is an extension of the Nex-side local model, not a
    replacement for it.

---

## 4) Canonical Topology

```text
Docker cleanroom executor
    ↓ Frontdoor API
Frontdoor
    ↓ sandbox provider
Disposable sandbox-hosted Nex server
    ↓ runtime token / package operator / app+adapter seams
Proof bundle mounted out of the executor cleanroom
```

The important distinction is:

1. the executor is isolated
2. the target server is also isolated
3. Frontdoor remains in the middle as the authoritative lifecycle surface

---

## 5) Sandbox Provider Model

Frontdoor must support a validation provider that creates sandbox-backed local
hosted servers.

That provider must:

1. create one disposable Nex server boundary per hosted server record
2. preserve the normal Frontdoor server lifecycle object model:
   - `server_id`
   - `tenant_id`
   - provision callback or equivalent authenticated ready signal
   - runtime token minting
   - archive/destroy semantics
3. expose runtime addresses in the same shape Frontdoor already uses
4. support package install and runtime operator traffic through the normal
   Frontdoor routes

The sandbox provider is not a separate customer product.

It is an internal validation provider implementation under the existing hosted
server lifecycle model.

---

## 6) Production Provider Relationship

Production hosted server policy remains:

1. `standard` customer servers may use Hetzner
2. `compliant` customer servers use AWS

The sandbox provider does not replace that production policy.

Instead:

1. sandbox-backed hosted cleanroom is the default proof substrate for lifecycle
   and integration validation
2. real cloud validation remains the narrow signoff path for behavior that is
   genuinely cloud- or compliance-specific

This keeps ordinary proof fast, isolated, and reproducible while preserving
separate final checks where infrastructure differences matter.

---

## 7) Secret And Credential Contract

Hosted cleanroom jobs must receive one explicit secret contract.

Secret classes include:

1. Frontdoor control-plane auth
2. runtime/model auth when needed
3. adapter/provider auth such as Jira or Slack credentials
4. cleanroom infrastructure control inputs

Rules:

1. the cleanroom executor receives only the secrets declared for that lane
2. the target server receives only the secrets Frontdoor or Nex must project
3. host browser sessions, host keychains, and ambient CLI auth files are not
   canonical dependencies

Current Docker-executor contract:

1. control-plane inputs:
   - `FRONTDOOR_SMOKE_ORIGIN`
   - `FRONTDOOR_SMOKE_API_TOKEN`
2. common hosted lane inputs:
   - `FRONTDOOR_SMOKE_PLAN`
   - `FRONTDOOR_SMOKE_SERVER_CLASS`
   - `FRONTDOOR_SMOKE_DISPLAY_NAME`
   - `FRONTDOOR_SMOKE_CLEANUP_MODE`
   - `FRONTDOOR_SMOKE_PROVISION_TIMEOUT_MS`
   - `FRONTDOOR_SMOKE_PROVISION_POLL_MS`
3. app-lane inputs:
   - `FRONTDOOR_SMOKE_APPS`
   - `FRONTDOOR_SMOKE_APP_PROOF_COMMAND`
4. adapter-lane inputs:
   - `FRONTDOOR_SMOKE_ADAPTERS`
   - `FRONTDOOR_SMOKE_ADAPTER_PROOF_COMMAND`
5. current Jira pilot inputs:
   - `JIRA_SITE`
   - `JIRA_EMAIL`
   - `JIRA_API_TOKEN`
   - `JIRA_PROJECT_KEY`
6. proof bundle mount:
   - host proof bundle root mounted to `/proof-bundle`
   - `NEXUS_CLEANROOM_PROOF_BUNDLE_DIR=/proof-bundle` inside the executor

Non-contract inputs:

1. browser session cookies
2. username/password login fallback
3. host CLI auth files
4. host home-directory secret discovery

---

## 8) Evidence And Review

Every hosted cleanroom lane must emit a durable proof bundle that can be
reviewed after teardown.

The bundle should include:

1. input lane identity and command
2. created server and tenant ids
3. runtime token / runtime descriptor evidence as appropriate
4. app or adapter proof outputs
5. cleanup outcome
6. optional browser or screen-recording artifacts

Proof bundles are mounted outside the cleanroom container boundary so teardown
does not destroy the evidence.

---

## 9) Dispatch Integration

The long-term orchestration model is Dispatch-driven.

That means:

1. each hosted cleanroom validation lane is expressed as a job packet
2. Dispatch launches the packet in a sandboxed executor
3. the packet provisions its own disposable hosted target through Frontdoor
4. evidence returns as structured artifacts
5. later review may include browser capture or full screen recording

Dispatch is therefore the preferred orchestrator for parallel hosted cleanroom
validation, but the cleanroom provider and Docker-backed executor model must be
usable independently first.

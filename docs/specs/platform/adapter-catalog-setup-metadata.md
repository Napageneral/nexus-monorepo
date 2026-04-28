---
summary: "Canonical contract for published adapter setup metadata from adapter source through Frontdoor, local runtime catalog, and Operator Console setup flows."
title: "Adapter Catalog Setup Metadata"
---

# Adapter Catalog Setup Metadata

## Purpose

The adapter catalog is the product front door for connecting external
platforms to Nex.

The catalog must answer three questions without guessing from local connection
state:

- which adapters are published and supported
- which setup methods each adapter supports
- what information the operator must provide before a durable connection exists

The Operator Console uses this catalog to guide an operator through setup. It
does not create a connection row just because an operator selected an adapter.
A durable connection row exists only after the setup method finishes
successfully.

## Target Experience

The Console Connectors page has one primary action: `Add new app`.

Selecting that action opens the Add App modal. The modal is catalog-backed and
shows available adapters, not current connection rows.

The modal separates:

- published adapters from Frontdoor
- adapters installed into the local runtime
- adapters present in the current workspace

Selecting an adapter starts setup inside the modal:

- if the adapter has one setup method, Console goes directly to that method's
  configure screen
- if the adapter has multiple setup methods, Console first shows method cards
- setup questions and credentials are collected in the method configure screen
- OAuth setup redirects or opens the provider authorization step
- API key and custom setup submit through the runtime setup operations
- file upload setup collects the required file inputs before runtime submission
- the modal stays open until setup succeeds, fails, or the operator cancels

Existing connections never block starting another setup. They can be shown as
context, but the operator can always attempt another connection for the same
adapter. If a provider or adapter cannot support the requested account, the
setup method returns a truthful failure at submit time.

## Authoritative Source

Adapter setup metadata is authored once in the adapter runtime declaration.

The authoritative declaration is the adapter SDK `auth.methods[]` structure
already returned by `adapter.info`.

The package install manifest remains install metadata. It identifies the
adapter package and how to run it. It is not the source of truth for setup
questions.

Publishing extracts a sanitized catalog setup descriptor from the adapter
runtime declaration and attaches that descriptor to the published release. The
descriptor contains only operator-facing setup metadata. It never contains
credential values, tokens, environment variable values, local file paths with
secrets, or account-specific runtime state.

## Setup Descriptor

Each published adapter release exposes a setup descriptor with:

- adapter id
- display name
- description
- version
- release id
- icon metadata when available
- setup guide text when available
- auth methods
- optional capability hints for setup UI only

Each auth method uses the existing adapter SDK method shape:

- `id`
- `type`
- `label`
- `description`
- `icon`
- `service`
- `fields`
- provider-specific OAuth metadata when the method is OAuth

Supported method `type` values are:

- `oauth2`
- `api_key`
- `file_upload`
- `custom_flow`

Fields describe prompts, not secret values. Field definitions can include:

- `name`
- `label`
- `type`
- `required`
- `description`
- validation hints
- placeholder text

## Package Publication Contract

Publishing an adapter release produces two artifacts:

- the install package needed by a runtime to execute the adapter
- the sanitized catalog setup descriptor needed by Frontdoor and Console

The release is invalid if the adapter declares no usable setup descriptor and
does not explicitly declare itself setup-free.

The publish pipeline validates:

- the descriptor matches the adapter SDK auth method schema
- every method has a stable id, label, and supported type
- every required field has a stable name and operator-facing label
- the descriptor contains no secret values
- the descriptor can be served independently of a live local runtime
- the descriptor is attached to the exact release being published

## Frontdoor Catalog Contract

Frontdoor is the published adapter catalog authority.

`GET /api/adapters/catalog` returns all active published adapters with their
latest published release metadata and setup descriptor. It is not derived from
local connection rows.

Frontdoor keeps setup metadata release-scoped. A new release can change setup
methods without mutating older release records.

Frontdoor responses include enough metadata for the Console to render the Add
App modal and method configure screens before the adapter is installed or
running locally.

## Local Runtime Catalog Contract

The local runtime exposes a canonical `adapters.catalog.list` operation.

That operation merges three surfaces:

- Frontdoor published catalog metadata
- locally installed package metadata
- live registered adapter info from running adapters

Merge precedence is:

1. live registered `adapter.info` for installed/running adapters
2. locally installed package metadata for installed but stopped adapters
3. Frontdoor published catalog metadata for not-yet-installed adapters

The runtime preserves the Frontdoor setup descriptor for published adapters
even when the adapter is not locally installed.

When live `adapter.info` disagrees with the published setup descriptor for the
same release, the runtime reports the drift in diagnostics while still using
live info for the local setup flow.

## Console Contract

The Console never infers the Add App catalog by probing existing local
connections.

The Connectors table shows durable connection rows. The Add App modal shows
adapter catalog entries.

The Console setup flow:

- reads available adapters from `adapters.catalog.list`
- preserves the published, installed, and workspace sections
- renders one method picker only when an adapter has multiple setup methods
- skips the method picker when there is exactly one setup method
- renders method configure fields from the selected method descriptor
- creates or completes setup through runtime operations
- refreshes connection rows only after setup succeeds
- shows setup failures inside the modal with actionable details

For adapters that use OAuth, Console starts the OAuth setup and makes the
handoff explicit. For adapters that use API key, file upload, or custom setup,
Console submits the collected inputs through the matching runtime setup
operation.

## Durable Connection Semantics

Selecting an adapter is not connection creation.

Selecting a setup method is not connection creation.

Filling out setup fields is not connection creation.

A durable connection row is created only after the runtime reports successful
completion for that setup method.

Failed, canceled, or incomplete setup attempts can create setup sessions or
diagnostic history, but they do not appear as connected adapter rows.

## Validation Requirements

A release is not complete until all of these pass:

- adapter SDK schema tests for setup descriptors
- package publish tests proving descriptors are generated and packaged
- Frontdoor API tests proving `/api/adapters/catalog` serves descriptor data
- runtime catalog tests proving published setup metadata survives the merge
- Console controller and view tests for single-method and multi-method setup
- cleanroom proof from published Frontdoor catalog to local Console setup
- live dogfood proof on the operator's local runtime

## Non-Goals

This spec does not define adapter-specific credential values.

This spec does not make the local `nexus` CLI a Frontdoor client.

This spec does not permit Console to use existing connection rows as the source
of available adapters.

This spec does not require one connection per adapter. Multiple durable
connections per adapter are allowed by the Console flow.

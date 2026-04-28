# ACSM-003 Frontdoor Catalog Serves Setup Metadata

## Goal

Persist setup descriptors in Frontdoor package release state and expose them
through `/api/adapters/catalog`.

## Why

The Console Add App modal needs setup metadata before an adapter is installed
or running locally. Frontdoor is the published adapter catalog authority.

## Scope

- extend Frontdoor package release persistence for adapter setup descriptors
- update adapter publish API and tests
- update `/api/adapters/catalog` response and OpenAPI contract
- preserve release-scoped setup metadata for latest published adapter releases
- keep app catalog behavior unchanged

## Acceptance

- Frontdoor stores setup descriptor metadata per adapter release
- `/api/adapters/catalog` returns setup metadata for published adapters
- existing adapter catalog tests assert descriptor fields
- OpenAPI contract reflects the new response fields
- published entries remain sorted and filtered by active published releases

## Completion Notes

- Frontdoor package release persistence now stores setup descriptor JSON.
- Adapter publish requires a matching release-scoped setup descriptor.
- `/api/adapters/catalog` returns both `auth` and `setup_descriptor` metadata.
- Frontdoor OpenAPI and focused catalog tests cover the new fields.

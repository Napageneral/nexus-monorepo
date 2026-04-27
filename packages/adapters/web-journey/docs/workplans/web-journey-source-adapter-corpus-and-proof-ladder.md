# Web Journey Source Adapter Corpus And Proof Ladder

**Status:** CANONICAL
**Last Updated:** 2026-04-06
**Related:** [Web Journey Source Adapter](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/docs/specs/web-journey-source-adapter.md), [Source Adapters, Control-Plane Apps, and Proof Standard](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/source-adapters-control-plane-and-proof-standard.md)

## Purpose

This workplan closes the gap between the current `web-journey` package and the
package-author-experience bar for a source adapter.

It is a docs-first workplan for the package-local corpus, proof ladder, and
truthful naming around the existing adapter surface.

## Current Package Reality

`web-journey` already has:

- adapter install and connection identity
- `collect` and `collect.batch`
- canonical journey row normalization
- `record.ingest` emission
- push-based freshness semantics
- package release and validation scripts

The remaining work is primarily corpus quality, proof clarity, and naming
truthfulness.

## Closure Sequence

### 1. Spec clarity

Document the source-adapter contract in a package-local spec rather than
depending only on umbrella docs.

### 2. Validation clarity

Document the install/connect, live collect/freshness, and consuming-app proof
shape in package-local validation docs.

### 3. Skill alignment

Keep the package skill aligned to the actual adapter surface and its source
adapter boundary.

### 4. Naming review

Ensure package-local docs do not imply provider-backed full-surface behavior or
old hybrid `website-input` ownership.

### 5. Revalidation

Re-run the package-local and cleanroom proofs against the final corpus once the
docs are in place.

## Exit Criteria

This work is done when:

1. the package-local corpus is real and complete
2. the proof ladder is explicit and truthful
3. the package docs do not overclaim provider-backed behavior
4. the adapter surface is described as a source adapter, not a hybrid app

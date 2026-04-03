# GitLab Adapter Spec

## Purpose

The `gitlab` package is the canonical Nex adapter for GitLab provider APIs.

It exposes GitLab-native outbound methods and implements the Nex projection
contract for repository, review request, and review-comment ingest.

## Core Truth

- provider-native outward namespace: `gitlab.*`
- package-attached skill at `./SKILL.md`
- normalized inbound forge projection under logical platform `git`
- provider provenance preserved in record metadata via `forge_provider=gitlab`

## Validation Standard

Validation for this package requires:

1. focused package-local tests
2. package validation and release
3. cleanroom live-provider proof when GitLab credentials exist
4. app and agent-use proof where the capability tree and skill are mounted

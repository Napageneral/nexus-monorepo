# GitHub Adapter Spec

## Purpose

The `github` package is the canonical Nex adapter for GitHub provider APIs.

It exposes GitHub-native outbound methods and implements the Nex projection
contract for repository, pull request, and review-comment ingest.

## Core Truth

- provider-native outward namespace: `github.*`
- package-attached skill at `./SKILL.md`
- normalized inbound forge projection under logical platform `git`
- provider provenance preserved in record metadata via `forge_provider=github`

## Validation Standard

Validation for this package requires:

1. focused package-local tests
2. package validation and release
3. cleanroom live-provider proof
4. app and agent-use proof where the capability tree and skill are mounted

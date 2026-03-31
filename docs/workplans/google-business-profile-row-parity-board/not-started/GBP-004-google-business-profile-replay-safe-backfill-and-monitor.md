# GBP-004 Google Business Profile Replay-Safe Backfill And Monitor

## Goal

Align GBP backfill and monitor behavior around replay-safe immutable-arrival
semantics.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-business-profile-adapter.md`

## Acceptance

1. account and location snapshots are replay-safe
2. performance daily rows replay a recent date window
3. review snapshots replay safely without inventing a new contract
4. backfill and monitor emit the same row families and payload shape

# CORP-004 Runtime-Backed Records, Contacts, And Channels Proof Contract

## Goal

Make runtime-backed data surfaces the explicit proof target after adapter
setup.

## Why

The Console proof is only compelling if it shows the result of real ingest,
not just a connection badge.

## Scope

- define which records, contacts, and channels assertions are required
- make seeded or live data expectations deterministic enough for cleanroom
  proof
- ensure the proof asserts runtime-backed content rather than fixture-only DOM

## Acceptance

- the proof opens Records, Contacts, and Channels after connect or backfill
- the assertions depend on runtime-backed data presence
- the result clearly distinguishes connect success from ingest success


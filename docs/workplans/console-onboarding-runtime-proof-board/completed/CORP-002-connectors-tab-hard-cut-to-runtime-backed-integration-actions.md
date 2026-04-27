# CORP-002 Connectors Tab Hard Cut To Runtime-Backed Integration Actions

## Goal

Replace the presentation-first top-level connectors experience with the real
runtime-backed integration actions.

## Why

Today the top-level connectors page still acts like a picker over a softer UI
surface. The Console cannot claim to prove adapter setup through the UI until
the primary connector actions are the real ones.

## Scope

- make the top-level connectors flow use the same integration actions used by
  the real adapter setup controller
- ensure OAuth and custom setup start from the main connectors experience
- remove no-op action seams from the primary user path

## Acceptance

- selecting an adapter from the connectors tab reaches a truthful setup surface
- starting OAuth or custom setup from that surface invokes real runtime-backed
  actions
- the Console proof can connect at least one adapter without dropping to a
  lower-level surface


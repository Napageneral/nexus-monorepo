# AIL-001 Canonical Taxonomy And Scope Lock

## Goal

Lock the active target-state vocabulary and product scope for the attribution
intelligence layer before adapter and app implementation expands.

## Why This Exists

The domain currently pulls language from MoonSleep, Glowbot, ecommerce,
healthcare, and generic marketing analytics.

If the taxonomy and scope remain fuzzy, later adapter and app tickets will
drift into incompatible assumptions.

## Current Gap

- umbrella canon for this domain did not exist
- MoonSleep provides a working exemplar, but not the generic Nexus target state
- website input, backend outcome, and attribution nouns were not yet unified

## Acceptance

1. active canonical docs exist for taxonomy and target-state architecture
2. the core product boundary excludes creative management, moderation, and
   traffic experimentation
3. adapters, website packages, and the app have explicit responsibility
   boundaries
4. later tickets reference these docs instead of redefining product shape

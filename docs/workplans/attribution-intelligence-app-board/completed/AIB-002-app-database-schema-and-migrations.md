# AIB-002 App Database Schema And Migrations

## Goal

Land the first app-owned database schema and migrations for bindings,
canonical facts, reconciliation state, and aggregate marts.

## Acceptance

1. the app owns a dedicated database boundary
2. first-pass tables exist for bindings, facts, and marts
3. migrations are replay-safe and explicit
4. the schema preserves inspectable evidence rather than only aggregates

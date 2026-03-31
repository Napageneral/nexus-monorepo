# AIB-004 Acquisition Fact Materialization

## Goal

Materialize canonical acquisition facts from shared paid-adapter records into
app-owned facts and marts.

## Acceptance

1. adapter records map into one canonical acquisition fact family
2. provider-native ids and measures are preserved
3. replay and restatement behavior is safe
4. first marts support paid performance by provider and hierarchy

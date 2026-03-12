# Zenoti EMR Adapter Spec

## Purpose

`nexus-adapter-zenoti-emr` ingests aggregate Zenoti EMR metrics into canonical
Nex `record.ingest` payloads for downstream GlowBot and other app consumers.

## Canonical Responsibilities

1. validate Zenoti credentials
2. backfill aggregate EMR metrics without PHI leakage
3. emit canonical `record.ingest` envelopes
4. support package install and restart rehydration as a shared adapter package

## Package Identity

- package id: `nexus-adapter-zenoti-emr`
- platform: `zenoti-emr`
- binary: `./bin/zenoti-emr-adapter`

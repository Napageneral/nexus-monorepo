# PatientNow EMR Adapter Spec

## Purpose

`nexus-adapter-patient-now-emr` ingests aggregate PatientNow EMR metrics into
canonical Nex `record.ingest` payloads for downstream GlowBot and other app
consumers.

## Canonical Responsibilities

1. validate PatientNow credentials
2. backfill aggregate EMR metrics without PHI leakage
3. emit canonical `record.ingest` envelopes
4. support package install and restart rehydration as a shared adapter package

## Package Identity

- package id: `nexus-adapter-patient-now-emr`
- platform: `patient-now-emr`
- binary: `./bin/patient-now-emr-adapter`

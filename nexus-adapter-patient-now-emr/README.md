# nexus-adapter-patient-now-emr

Nexus adapter wrapper for PatientNow EMR metrics.

## Fast Path

- API key + practice id credential capture
- CSV fallback for immediate manual ingestion

## Notes

PatientNow API contracts are partner-gated. This adapter supports credential validation and a configurable metrics endpoint path to avoid hardcoding undocumented private routes.

## Build

```bash
go build ./cmd/patient-now-emr-adapter
```

## Run

```bash
go run ./cmd/patient-now-emr-adapter adapter.info
go run ./cmd/patient-now-emr-adapter adapter.health --account default
go run ./cmd/patient-now-emr-adapter event.backfill --account default --since 2026-01-01
```

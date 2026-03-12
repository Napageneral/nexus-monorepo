# Zenoti EMR Adapter Testing

## Local package/install bar

1. `go test ./...`
2. `go build -o ./bin/zenoti-emr-adapter ./cmd/zenoti-emr-adapter`
3. `./scripts/package-release.sh`
4. install the emitted tarball through `POST /api/operator/packages/install`
5. verify package health through `GET /api/operator/packages/adapter/nexus-adapter-zenoti-emr/health`
6. restart the runtime and verify active package rehydration

## Live adapter bar

Live EMR validation remains a separate slice and is not part of the local
package/install checkpoint.

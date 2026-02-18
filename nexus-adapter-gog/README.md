# nexus-adapter-gog

Nexus adapter wrapper around the `gog` CLI.

This project does **not** modify the upstream `gogcli` repo. It shells out to a `gog` binary
and adapts its JSON output into the Nexus adapter protocol using `adapter-sdk-go`.

## Requirements

- `gog` must be installed and available on PATH (or set `NEXUS_GOG_COMMAND`).
- A Google account must be authorized in `gog` (e.g. `gog auth add <email>`).

## Build

```bash
go build ./cmd/gog-adapter
```

## Run

```bash
go run ./cmd/gog-adapter info
go run ./cmd/gog-adapter accounts list
go run ./cmd/gog-adapter health --account you@example.com
```


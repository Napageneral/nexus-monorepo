# Flexport Adapter Workplan

**Last Updated:** 2026-10-21

## Closure sequence

1. Review and merge this package; build and validate it from committed `origin/main`.
2. Run `scripts/runtime-cleanroom-proof.sh` on a lab standby against the exact Nex and PostgreSQL release images and keep its receipt.
3. Install the exact release into the production runtime with `scripts/install-runtime-package.sh` inside a governed package-install activity.
4. Create connection `moonsleep-flexport` (account `moonsleep`) with `scripts/register-connection.sh` from a private 0600 request file holding the Flexport client id and secret; print nothing but the status line.
5. On Tyler's go, run the first live backfill, read the shipment bundle and network Records back, and check `token_requests_24h` in health.
6. Enable the 30-minute monitor; confirm checkpoints, the status file and that unchanged bundles are not re-emitted.
7. Cut the moonsleep-v1 writes over to the four write methods through the runtime, then retire the laptop credential and the old Python client.

## Exit criteria

The review gate requires the cleanroom receipt, an exact install readback, a connection that reads back as `flexport/moonsleep-flexport`, live Records whose bundles the Python reader accepts, no more than one token request a day in steady state, and zero automatic writes.

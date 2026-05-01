# MAL-004 Discord Gateway Supervision

## Goal

Harden the Nex Discord monitor lifecycle using the useful parts of OpenClaw's
gateway supervisor pattern.

## Current Gap

The Discord adapter now has durable per-channel monitor state, startup catch-up,
and live edit/delete revision records. Its gateway lifecycle is still mostly a
direct `discord.js` monitor loop, with less explicit distinction between
transport readiness, reconnecting, degraded record processing, and fatal
configuration failures.

## Scope

- classify gateway failures as recoverable, degraded, or fatal
- expose monitor transport state separately from record emission state
- add ready watchdog behavior
- suppress expected teardown noise during stop
- protect against duplicate event replay around reconnects
- add focused lifecycle tests

## Acceptance

1. monitor startup reports ready only after gateway readiness
2. recoverable gateway disconnects surface as reconnecting/degraded, not fatal
3. fatal auth/config failures stop with explicit operator-facing errors
4. reconnect event replay does not duplicate records
5. tests cover ready, recoverable failure, fatal failure, and teardown

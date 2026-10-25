---
name: sequences
description: Read and operate Nex Sequences, the app that runs MoonSleep's approved email series and giveaways as Nex jobs.
---

# Sequences

Use `sequences.health` to read the installed version, the store schema and the last tick.

The app owns one job (`sequences.tick`, control lane) and one schedule (`sequences.tick`,
`0 * * * * *` UTC). Install registers both with the schedule disabled; no lifecycle hook enables
it, and an upgrade keeps whatever state it had. Never enable the schedule by editing its row;
use the app's plan/apply method once it exists.

## Boundaries

- Do not query the `sequences` schema directly; read through the app's methods.
- The app holds no provider write authority in this release.

---
name: sequences
description: Read and operate Nex Sequences, the app that runs MoonSleep's approved email series and giveaways as Nex jobs. Use it for how a series is going, its plan and steps, why a step is late, who a step reached, the shadow drawings, and arming or parking the tick.
---

# Sequences

People and agents reach these methods through `seqctl` (moonsleep-v1), which calls
`ops.moonsleep.co/api/sequences/*`; operators on a site use `nexus runtime call sequences.<method>`.
Relay the server's words: every method returns a `text` twin and a `relay` line.

## Use

- `sequences.brief.get {series}`: "how's it going". Exit 4 held, 3 needs Tyler, 8 needs an agent, 0 fine.
- `sequences.timeline.get {series[/instance]}`: the plan laid out.
- `sequences.explain {ref}`: one step, alert (`A11-0007`), `msg:<name>` or `src:<name>` in depth.
- `sequences.audit.query {step, against: winners}`: who a step reached (by step; by person is P4).
- `sequences.check.run {series}` and `sequences.check.file {files}`: live engine check; recipe check.
- `sequences.help.get {topic}`: playbooks for every code, step types, sources, grammars.
- `sequences.items.take` / `sequences.items.told`: take an item for 60 minutes; record that Tyler was told
  (stops the 6-hourly re-sends). `by` is your actor id, e.g. `claude@tyler-mac#4f2a`.
- `sequences.series.import`: preview first, then apply with the preview's exact `pt_…` token.
- `sequences.runtime.configure` (admin): plan, show Tyler the sha, apply only on his go.

## Boundaries

- Agents never approve: there is no approval method in P1b, and nothing an agent writes counts as one.
- No address ever goes in params or comes back in an output: people are entry ids and hashes.
- Never enable the tick schedule by editing its row; only `sequences.runtime.configure` arms it.
- Never `jobs.requeue` or hand-invoke a sequences Run: the handlers refuse any trigger they did not admit.
- Do not query the `sequences` schema directly; read through the methods.
- The app holds no provider write authority in this release.

## Before P2 (Fri 10/30)

Engine sends, approvals, claims, codes and the steering verbs (`hold`, `resume`, `change`,
`repair`, `submit`) arrive with P2. Until then the Mac and the review sender run every October step
and the engine observes, adopts their evidence and shadows the last three drawings.

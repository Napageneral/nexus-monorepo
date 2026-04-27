# AGJV-004 Demo Website Resource Set And Install Lane

## Goal

Bind one review-safe website resource set for first-party attribution proof.

## Scope

- choose the first truthful website proof target
- package and bind the install instructions for that target
- define the proof-safe landing URLs, CTA, and handoff surfaces
- decide how a Vercel-hosted demo site fits relative to the sandbox-managed
  cleanroom

## Notes

The first cleanroom slice should prefer a website surface that can talk to the
fresh cleanroom Nex server directly.

If a public Vercel site is used later, it should be an explicit follow-on proof
lane rather than an implicit dependency of the first cleanroom pass.

## Acceptance

1. one review-safe website proof resource set is named and documented
2. the install lane uses the shared `website-input` contract rather than custom
   one-off instrumentation
3. the proof journey has one tagged landing path, one CTA path, and one handoff
   path
4. the website resource choice fits the cleanroom-first doctrine cleanly

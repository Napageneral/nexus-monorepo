---
summary: "Correct the operator-chat corpus to reflect that the current package is not a true upstream fork, and reset provenance against the pinned upstream t3code commit."
title: "OTF-001 - Corpus Correction And Upstream Provenance Reset"
---

# OTF-001 - Corpus Correction And Upstream Provenance Reset

## Why

The current operator-chat docs overstate upstream-shell fidelity.
Before more UI work happens, the corpus must truthfully state that the present
package is only a partial vendoring of upstream `t3code`, not a true fork.

## Required Outcomes

- active operator-chat spec set reflects the true upstream-fork target state
- a new fork-reset execution board exists
- older shell-transplant documentation no longer claims the current package is
  already a near-upstream shell transplant
- package provenance references the actual local upstream checkout and commit

## Implementation Notes

- use `/Users/tyler/nexus/home/projects/t3code` as the upstream reference
- pin the reset to upstream commit `28e481eb` unless a later sync is performed
- preserve the existing runtime/spec corpus for `chat.*`; only correct the UI
  fork story

## Validation

- the updated spec/workplan corpus tells one coherent story
- the package provenance doc references the same upstream commit used by the
  reset board

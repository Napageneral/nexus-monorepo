# OTT-003 Agent Group Sidebar Remap

## Goal

Preserve the upstream sidebar visual language while remapping its data model
from `project -> thread` to `agent group -> lane`.

## Why

The sidebar is one of the strongest parts of upstream `t3code`.
The product should keep that visual grammar while making it truthful for Nex.

## Scope

- reinterpret project headers as agent-group headers
- reinterpret thread rows as lane rows
- render the top-level direct lane plus nested worker lanes under each group
- preserve selection, previews, timestamps, status pills, and expand-collapse
  behavior
- keep route selection and keyboard navigation aligned with lane selection

## Implementation Notes

- agent groups derive from top-level chat lanes and their children
- the direct lane for the owning agent should remain the first row in the group
- worker visibility derives from lane hierarchy, not generic thread nesting
- do not preserve stock project-creation or generic new-thread semantics

## Acceptance

- the sidebar visually reads like real upstream `t3code`
- the nouns exposed to the operator are agent groups and lanes rather than
  projects and threads
- manager and worker navigation works through the preserved left-rail grammar

## Validation

- sidebar interaction tests
- browser proof showing group expansion, lane selection, and worker selection

## Current Result

- the sidebar now preserves the upstream `project -> thread` visual grammar as
  `agent group -> lane`
- top-level groups render the direct agent lane first and nested worker lanes
  beneath it
- previews, timestamps, run-state badges, selection state, and
  expand-collapse behavior are active in the transplanted shell
- the recorded cleanroom proof at
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260407T195221Z`
  now demonstrates agent-group visibility, worker-lane selection, and direct
  worker navigation from the preserved left rail

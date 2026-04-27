# WSA-001 - Current Website Input Gap Analysis And Split Plan

## Status

Completed.

## Goal

Compare the current codebase against the canonical web-signals and
web-adapters architecture, then define the concrete gap-closure sequence.

Canonical target:

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/web-signals-control-plane-and-web-adapter-family.md`

Current implementation roots:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/attribution-intelligence/app/`

## Current Reality

The current implementation is a hybrid `website-input` app package.

It currently owns all of the following in one package:

- installation creation and rotation
- sender token issuance and sender-entity binding
- collector methods for single and batch ingest
- canonical event normalization
- local installation and event storage
- durable `record.ingest` emission
- operator event inspection methods
- SDK assets and environment wrappers

The current package therefore combines both the control plane and the data
plane.

There is no dedicated web adapter package under:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/`

The `attribution` app currently treats the hybrid `website-input` package as
the canonical middle-funnel source.

## Gap Summary

### 1. Package taxonomy gap

Current state:

- one hybrid `website-input` app

Target state:

- one `web-signals` control-plane app
- one `web-journey` adapter
- one future `web-rum` adapter

Impact:

- current package names and boundaries do not match the intended long-term
  architecture

### 2. Control-plane and data-plane ownership gap

Current state:

- installation lifecycle, token issuance, collector ingest, and event storage
  all live together in:
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/app/methods/index.ts`

Target state:

- `web-signals` owns installation lifecycle and trust
- `web-journey` owns canonical journey ingest
- `web-rum` later owns browser runtime telemetry ingest

Impact:

- the current package cannot cleanly serve multiple sibling web signal
  adapters without continuing the hybrid pattern

### 3. Adapter connection model gap

Current state:

- website signal flow is not represented as a dedicated adapter connection
- there is no reusable web adapter package to install, connect, monitor, or
  validate through the adapter seams

Target state:

- `web-journey` and `web-rum` are first-class adapter packages
- consuming apps bind adapter truth instead of a hybrid app-specific ingest
  surface

Impact:

- the middle-funnel source is not yet aligned with the top-funnel and
  bottom-funnel adapter model

### 4. Live-sync and health semantics gap

Current state:

- live web ingest arrives through app methods
- freshness exists implicitly through installation and event timestamps
- there is no dedicated adapter-facing monitor contract for the web source

Target state:

- push-based web adapters expose clear freshness, recent-ingest, and degraded
  health semantics
- historical replay is explicit and separate from the default live path

Impact:

- monitoring and validation do not yet line up with the canonical adapter proof
  posture in the workflow

### 5. Naming and schema gap

Current state:

- the system still uses `website-input` as the package noun
- the app DB uses `website_input_*` tables
- the runtime record platform is `website-input`
- installation identity is `website_installation_id`

Target state:

- canonical nouns are `web-signals`, `web-journey`, `web-rum`, and
  `web_installation_id`

Impact:

- current names will keep leaking the old hybrid model into new code unless the
  split explicitly addresses naming

### 6. Attribution binding gap

Current state:

- the attribution layer is conceptually correct, but it still binds through the
  old middle-funnel package story

Target state:

- `attribution` binds `web-journey` as the middle-funnel adapter
- the control plane remains adjacent and operator-facing, not the consumed
  source contract

Impact:

- the attribution app cannot fully model the middle funnel as “just another
  adapter” until the split lands

### 7. Validation gap

Current state:

- validation proves the working hybrid package
- the current proof corpus does not yet prove a split control plane plus
  adapter family

Target state:

- active validation covers:
  - install and connect proof for `web-signals` and `web-journey`
  - live ingest and freshness proof for `web-journey`
  - consuming-app proof through `attribution`

Impact:

- the proof story will become stale once the split starts unless the validation
  lane is updated as part of the work

### 8. Legacy residue gap

Current state:

- the codebase, docs, package names, runtime method names, and stored table
  names still carry the old `website-input` hybrid model

Target state:

- the supported system uses `web-signals`, `web-journey`, `web-rum`, and
  `web_installation_id`
- old aliases, stale compatibility seams, and split-brain naming are removed

Impact:

- any compatibility posture will prolong confusion and increase the chance that
  new code keeps targeting the wrong surface

## Current Code Mapping

### Control-plane behavior currently living in the hybrid app

- installation lifecycle methods:
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/app/methods/index.ts`
- installation and token storage:
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/app/methods/store.ts`

### Data-plane behavior currently living in the hybrid app

- collector methods:
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/app/methods/index.ts`
- durable record mapping:
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/app/methods/journal.ts`
- SDK assets and wrappers:
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/sdk/`

### Consuming-app dependency on the old middle-funnel contract

- attribution pipeline:
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/attribution-intelligence/app/pipeline/processor.ts`
- attribution storage and bindings:
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/attribution-intelligence/app/storage/store.ts`

## Proposed Closure Sequence

### WSA-002 - Web Signals Control Plane Extraction

Create the canonical `web-signals` app boundary and move installation, token,
and control-plane methods there without changing the live browser SDK payload
shape.

### WSA-003 - Web Journey Adapter Extraction

Create a new `web-journey` adapter package and move collector normalization,
durable record mapping, and live freshness semantics into that adapter.

### WSA-004 - Attribution Rebinding

Update the attribution app and related specs so the middle funnel binds to
`web-journey` adapter truth instead of the old hybrid package contract.

### WSA-005 - Compatibility And Cutover

Perform the hard cutover to the new names and package seams with no supported
legacy alias layer.

### WSA-006 - Web RUM Lane

Lock the `web-rum` sibling boundary and scaffold its initial package and proof
lane without collapsing it into the journey adapter.

### WSA-007 - Legacy Residue Eradication

After the new path is validated, remove all remaining `website-input` legacy
residue, stale compatibility surfaces, and old split-brain naming from the
supported system.

## Exit Criteria

This ticket is done when:

1. the canonical target-state spec is published
2. the active workplan tells the truthful split story
3. the current code-to-target gaps are explicit
4. the next execution tickets are sequenced clearly enough to burn down

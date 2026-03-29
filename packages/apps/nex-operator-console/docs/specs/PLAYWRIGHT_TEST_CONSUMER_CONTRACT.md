# Playwright Test Consumer Contract

Status: CANONICAL
Updated: 2026-03-29

## Purpose

This document defines what the operator console Playwright test suite **produces** and **requires**, so that upstream orchestration systems (Dispatch DAGs, nex sandbox runners, CI pipelines) can correctly invoke the tests and consume the artifacts.

This is a **consumer contract** — it tells the sandbox/orchestration layer what shape to expect, not how to build that layer.

## Environment Variables (inputs)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BASE_URL` | No | `http://localhost:5173` | URL where the operator console is served |
| `RUNTIME_TOKEN` | No | None | Auth token for the nex runtime (if token auth is enabled) |
| `NEXUS_CLEANROOM_PROOF_BUNDLE_DIR` | No | `./test-results` | Directory where all proof artifacts are written |
| `PLAYWRIGHT_JSON_OUTPUT_NAME` | No | `./test-results/results.json` | Path for the structured JSON test results |

## What the tests need running

1. A **nex runtime** — booted, healthy, reachable at some URL
2. The **operator console** — built and served (static files or dev server), pointing at the runtime
3. A **Chromium browser** — Playwright manages this, but the host needs browser dependencies installed

The tests do NOT:
- Start the runtime (the orchestrator does that)
- Build the console (the orchestrator does that)
- Install any packages (the orchestrator does that)

## Invocation

```bash
cd packages/apps/nex-operator-console/e2e
BASE_URL=http://localhost:5173 \
NEXUS_CLEANROOM_PROOF_BUNDLE_DIR=/path/to/proof-bundle \
npx playwright test
```

For HTML report generation:
```bash
npx playwright test --reporter=html
```

## Proof Artifacts (outputs)

All artifacts are written to `NEXUS_CLEANROOM_PROOF_BUNDLE_DIR`:

```
$NEXUS_CLEANROOM_PROOF_BUNDLE_DIR/
├── results.json                          # Structured test results (pass/fail/duration per test)
├── screenshots/
│   ├── 01-shell-loaded.png
│   ├── 02-nav-tabs-visible.png
│   ├── 03-connectors-platform-picker.png
│   ├── ...
│   └── 35-memory-quality-tab.png
├── <test-name>/
│   ├── video.webm                        # Full test run video
│   └── trace.zip                         # Playwright trace (interactive replay)
└── playwright-report/                    # HTML report (if --reporter=html)
    └── index.html
```

### Artifact kinds (for Dispatch evidence mapping)

| Kind | Path pattern | Description |
|------|-------------|-------------|
| `video` | `*/video.webm` | Screen recording of each test |
| `screenshot` | `screenshots/*.png` | Named screenshots at key UI moments |
| `trace` | `*/trace.zip` | Playwright trace file (step-by-step replay) |
| `log` | `results.json` | Structured pass/fail results |

These map directly to Dispatch's `dispatch.issues.list_artifacts` response shape:
```json
{
  "artifacts": [
    { "kind": "video", "path": "01-shell-navigation/video.webm" },
    { "kind": "screenshot", "path": "screenshots/01-shell-loaded.png" },
    { "kind": "trace", "path": "01-shell-navigation/trace.zip" },
    { "kind": "log", "path": "results.json" }
  ]
}
```

## Test Suite Structure

| File | Coverage |
|------|----------|
| `00-smoke.spec.ts` | Shell loads, nav renders, no JS errors |
| `01-shell-navigation.spec.ts` | All 7 tabs navigate, brand renders, right-side controls present |
| `02-connectors-agents.spec.ts` | Connectors page, agents page, agent creation wizard |
| `03-monitor-jobs-records.spec.ts` | Monitor, Jobs (5 sub-tabs), Records (3 sub-tabs) |
| `04-identity-memory.spec.ts` | Identity (6 sub-tabs), Memory (3 sub-tabs) |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All tests passed |
| 1 | One or more tests failed |

The orchestrator should treat exit code 1 as **evidence of failure**, not as an infrastructure error. The proof bundle still contains valid artifacts (videos, screenshots) that show what went wrong.

## What Dispatch Needs to Do

When a Dispatch validation job runs these tests:

1. Create a fresh sandbox
2. Boot nex inside it
3. Build and serve the operator console
4. Set `BASE_URL` and `NEXUS_CLEANROOM_PROOF_BUNDLE_DIR`
5. Run `npx playwright test`
6. Collect the proof bundle directory
7. Map artifacts to evidence via the `kind`/`path` shape above
8. Attach to the owning run via `dispatch.issues.list_artifacts`
9. Gate ticket completion on exit code 0

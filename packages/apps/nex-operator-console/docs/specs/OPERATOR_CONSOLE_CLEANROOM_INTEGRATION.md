# Operator Console Cleanroom Integration Testing

**Status:** CANONICAL
**Domain:** Operator Console — Integration Validation
**Depends on:** nex Docker cleanroom boot, Playwright browser automation, operator console v2 UI

---

## Customer Experience

An operator or developer can run a single command that:

1. Boots a disposable nex runtime in Docker
2. Builds and serves the operator console v2 UI
3. Launches a Playwright-driven browser that navigates the full console
4. Exercises every page, tab, form, and modal against the live runtime
5. Records video of the entire session, captures Playwright traces, and takes screenshots at key moments
6. Produces a durable proof bundle with structured results, video, traces, and screenshots

The proof bundle is the primary evidence that the v2 console works. A reviewer can:
- Watch the video to see the full user journey
- Open the Playwright trace in Trace Viewer for interactive replay with DOM snapshots
- Review screenshots at key moments (page loads, form submissions, modal states)
- Check the structured JSON results for pass/fail per domain

This spec defines the operator-console implementation of the broader browser
proof overlay model. It is not the owner of recording/video/trace capture as a
concept; it is the first concrete producer that plugs into the shared cleanroom
bundle contract.

---

## Conceptual Model

### Browser Integration Test

A browser integration test uses Playwright to drive a real Chromium browser
through the operator console UI. The console is connected to a live nex runtime
via WebSocket. Tests validate what the user sees — real data in the DOM, not
mocked responses.

In the cleanroom proof model, Playwright is a producer:

- shared cleanroom capture owns the bundle root
- shared review media projects into `videos/`, `traces/`, and `screenshots/`
- Playwright-specific logs and structured results live under `playwright/`

Each test:
- Navigates to a page or tab
- Waits for data to load (DOM assertions, not timers)
- Validates that runtime data appears correctly in the rendered UI
- Interacts with forms, buttons, modals as a user would
- Captures screenshots at meaningful moments

### Test Domains

| Domain | What Gets Tested |
|--------|-----------------|
| **Shell & Navigation** | Top nav renders all tabs, clicking each tab navigates, brand/logo present, settings gear works |
| **Connectors** | Platform picker empty state renders, "Browse all connectors" link works, connected list shows data when adapters exist |
| **Agents — List** | Empty state renders, create button visible |
| **Agents — Creation Wizard** | 4-step wizard: fill name → select model → set guardrails → review → create. Validate agent appears in list after creation |
| **Agents — Detail** | Settings tab loads with agent data, sub-tabs (Settings/Skills/Run History) navigate, chat panel renders |
| **Agents — Detail Modals** | Open and interact with: schedule templates, manage tools, edit guardrails, manage memory, Slack setup |
| **Monitor** | Live tab renders stat cards and empty table, History tab renders with filters |
| **Jobs** | Overview shows stat cards, Definitions/Queue/Runs/Schedules sub-tabs render. Create a schedule, verify it appears in list |
| **Records** | Browse/Channels/Search sub-tabs render, filters work, empty states display correctly |
| **Identity** | All 6 sub-tabs render (Entities, Contacts, Channels, Groups, Policies, Merge Queue), search works |
| **Memory** | Library/Search/Quality sub-tabs render, episode inspector shows empty state |
| **Settings** | Profile shows user identity from runtime, API Keys section renders, Auth section renders |

### Proof Bundle

```
operator-console-cleanroom-proof/
  <timestamp>/
    metadata.json              # generic cleanroom wrapper metadata
    result.json                # generic cleanroom wrapper pass/fail
    bundle-files.json          # generic inventory of every file in the bundle
    operator-console-runtime.json
    videos/
      full-session.webm        # complete screen recording of the test run
    traces/
      trace.zip                # Playwright trace (open with: npx playwright show-trace trace.zip)
    screenshots/
      01-shell-initial-load.png
      02-connectors-empty-state.png
      03-agents-empty-state.png
      04-agents-wizard-step1.png
      05-agents-wizard-step2.png
      06-agents-wizard-step3.png
      07-agents-wizard-step4-review.png
      08-agents-wizard-created.png
      09-agent-detail-settings.png
      10-agent-detail-skills.png
      11-agent-detail-run-history.png
      12-monitor-live.png
      13-monitor-history.png
      14-jobs-overview.png
      15-jobs-schedules.png
      16-records-browse.png
      17-records-search.png
      18-identity-entities.png
      19-identity-merge-queue.png
      20-memory-library.png
      21-memory-search.png
      22-settings-profile.png
      23-settings-api-keys.png
      ...
    playwright/
      stdout.log
      stderr.log
      results.json             # per-domain pass/fail with individual test details
      artifacts.json           # copied Playwright artifact summary
      output/                  # raw Playwright output tree
    stdout.log
    stderr.log
```

---

## Test Harness Architecture

### Docker Container Layout

```
Docker container (based on mcr.microsoft.com/playwright + nex build):
  ├── nex runtime (port 18792, token auth, loopback)
  ├── console static server (port 5173, vite preview)
  └── Playwright test runner
       ├── Chromium (headless, 1400x900 viewport)
       ├── video recording enabled
       ├── tracing enabled (screenshots + snapshots + sources)
       ├── navigates http://localhost:5173
       └── writes proof artifacts to /proof-bundle/
```

### Dockerfile

Extends the existing nex cleanroom Dockerfile with:
- Playwright browser dependencies (Chromium)
- Console build step (`cd packages/apps/nex-operator-console/app && pnpm build`)
- Static file server for the built console
- Playwright test runner

Alternatively, use a multi-stage build:
1. Stage 1: Build nex (existing Dockerfile)
2. Stage 2: Build console UI
3. Stage 3: Playwright runner image with both artifacts

### Boot Sequence

1. Init nex workspace (`nexus init`)
2. Seed owner identity
3. Onboard non-interactively (creates agent, workspace, identity)
4. Start runtime with token auth
5. Wait for runtime readiness (TCP poll)
6. Optionally: seed additional test data via `callRuntime()` (create extra agents, schedules, etc. so the UI has data to display)
7. Start static file server for console build output
8. Run Playwright test suite

### Test Data Seeding

Before the browser tests run, use `callRuntime()` (the existing WebSocket RPC
helper) to seed the runtime with test data:

- Create 2-3 agents with different names and models
- Create a schedule attached to an agent
- Create an ingress credential
- This ensures the UI has real data to render, not just empty states

This is the only use of `callRuntime()` — for test setup, not for testing the
RPC layer directly.

### Playwright Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Operator Console Cleanroom', () => {
  test.beforeAll(async () => {
    // Boot runtime + seed data (or assume Docker already did this)
  });

  test('shell and navigation', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.screenshot({ path: '/proof-bundle/screenshots/01-shell-initial-load.png' });

    // Verify nav tabs exist
    await expect(page.locator('.v2-nav-tab')).toHaveCount(7);

    // Click each tab and verify navigation
    for (const tab of ['Connectors', 'Agents', 'Monitor', 'Jobs', 'Records', 'Identity', 'Memory']) {
      await page.click(`.v2-nav-tab:has-text("${tab}")`);
      await expect(page.locator('.v2-page-title')).toBeVisible();
    }
  });

  test('agent creation wizard', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.click('.v2-nav-tab:has-text("Agents")');
    await page.click('button:has-text("Create agent")');
    await page.screenshot({ path: '/proof-bundle/screenshots/04-agents-wizard-step1.png' });

    // Fill step 1
    await page.fill('input[placeholder*="name"]', 'Cleanroom Test Agent');
    await page.click('button:has-text("Next")');
    await page.screenshot({ path: '/proof-bundle/screenshots/05-agents-wizard-step2.png' });

    // Continue through steps...
  });

  // ... more tests per domain
});
```

### Video and Tracing Configuration

```typescript
// playwright.config.ts
export default {
  use: {
    video: 'on',                    // Record video for every test
    trace: 'on',                    // Capture full trace
    screenshot: 'on',              // Screenshot on failure (plus manual captures)
    viewport: { width: 1400, height: 900 },
    baseURL: 'http://localhost:5173',
  },
  outputDir: '/proof-bundle/playwright/output',
};
```

The important rule is not the exact directory name. The rule is that browser
producer internals stay namespaced while shared review media is copied into the
canonical bundle locations.

---

## Integration with Existing Infrastructure

### Reuse

| Component | Source | How We Use It |
|-----------|--------|--------------|
| nex Docker build | `nex/scripts/e2e/Dockerfile` | Base image or multi-stage source |
| Boot + init + onboard pattern | `runtime-capability-matrix-cleanroom-docker.sh` | Same sequence |
| `callRuntime()` | `nex/src/api/call.ts` | Test data seeding only |
| Proof capture | `capture-cleanroom-proof.sh` | Shared cleanroom wrapper that owns bundle root files |

### New

| Component | Location | Purpose |
|-----------|----------|---------|
| Dockerfile.console-cleanroom | `nex/scripts/e2e/Dockerfile.console-cleanroom` | Multi-stage: nex + console + Playwright |
| Playwright test suite | `packages/apps/nex-operator-console/e2e/` | First browser proof producer implementation |
| Playwright config | `packages/apps/nex-operator-console/e2e/playwright.config.ts` | Producer-local video + trace + screenshot config |
| Docker wrapper script | `nex/scripts/e2e/operator-console-cleanroom-docker.sh` | Boot + serve + test |
| Capture wrapper | `nex/scripts/e2e/operator-console-cleanroom-capture.sh` | Shared bundle wrapper around this producer |

---

## Validation Requirements

The work is complete when:

1. A single command boots nex + console in Docker and runs the Playwright suite
2. Every domain listed has at least one passing browser test
3. Video recording captures the complete test session
4. Playwright trace is viewable in Trace Viewer
5. Screenshots are captured at every key moment listed in the proof bundle spec
6. The proof bundle is self-contained and reviewable offline
7. A reviewer can watch the video and confirm the UI matches the reference design
8. The test can be wrapped with `capture-cleanroom-proof.sh` for durable proof
9. Playwright-specific logs and structured results do not overwrite the
   generic cleanroom bundle root files

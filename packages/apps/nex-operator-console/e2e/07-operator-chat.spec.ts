import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { test, expect, type Page } from "@playwright/test";
import { screenshot, setupConsoleErrorCapture, waitForConsoleReady } from "./helpers";

const nexRoot = process.env.NEX_ROOT?.trim() || "";
const cleanroomContainerName = process.env.NEXUS_CLEANROOM_CONTAINER_NAME?.trim() || "";

type OperatorChatProofSummary = {
  manager_lane_id?: string;
  worker_lane_id?: string;
};

type OperatorChatPerformanceMetric = {
  name: string;
  value: number;
  unit: string;
  recorded_at: string;
  metadata?: Record<string, unknown>;
};

function readProofSummary(): OperatorChatProofSummary | null {
  const summaryPath =
    process.env.OPERATOR_CHAT_PROOF_SUMMARY_PATH?.trim() ||
    (process.env.NEXUS_CLEANROOM_PROOF_BUNDLE_DIR
      ? path.join(process.env.NEXUS_CLEANROOM_PROOF_BUNDLE_DIR, "operator-chat-proof-summary.json")
      : "");
  if (!summaryPath || !fs.existsSync(summaryPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(summaryPath, "utf8")) as OperatorChatProofSummary;
}

const proofSummary = readProofSummary();
const managerLaneId = proofSummary?.manager_lane_id?.trim() || "lane:agent:entity-assistant";
const workerLaneId =
  proofSummary?.worker_lane_id?.trim() || "lane:worker_session:session:operator-chat:worker";
const performanceMetricsPath = process.env.NEXUS_CLEANROOM_PROOF_BUNDLE_DIR?.trim()
  ? path.join(process.env.NEXUS_CLEANROOM_PROOF_BUNDLE_DIR, "operator-chat-performance-metrics.json")
  : "";
const performanceMetrics: OperatorChatPerformanceMetric[] = [];

function requireEnv(name: string, value: string): string {
  if (!value) {
    throw new Error(`${name} is required for the operator-chat cleanroom proof`);
  }
  return value;
}

function runProofHelper(args: string[]): string {
  if (cleanroomContainerName) {
    return execFileSync(
      "docker",
      [
        "exec",
        cleanroomContainerName,
        "node",
        "--import",
        "tsx",
        "/nex/scripts/e2e/operator-chat-cleanroom-proof.ts",
        ...args,
      ],
      {
        encoding: "utf8",
        env: process.env,
      },
    );
  }
  if (nexRoot) {
    const tsxBinary = path.join(nexRoot, "node_modules", ".bin", "tsx");
    return execFileSync(
      tsxBinary,
      [path.join(nexRoot, "scripts", "e2e", "operator-chat-cleanroom-proof.ts"), ...args],
      {
        cwd: nexRoot,
        encoding: "utf8",
        env: process.env,
      },
    );
  }
  const root = requireEnv("NEX_ROOT", nexRoot);
  const tsxBinary = path.join(root, "node_modules", ".bin", "tsx");
  return execFileSync(
    tsxBinary,
    [path.join(root, "scripts", "e2e", "operator-chat-cleanroom-proof.ts"), ...args],
    {
      cwd: root,
      encoding: "utf8",
      env: process.env,
    },
  );
}

function writePerformanceMetrics(): void {
  if (!performanceMetricsPath) {
    return;
  }
  fs.mkdirSync(path.dirname(performanceMetricsPath), { recursive: true });
  fs.writeFileSync(performanceMetricsPath, `${JSON.stringify(performanceMetrics, null, 2)}\n`, "utf8");
}

function recordPerformanceMetric(
  name: string,
  value: number,
  unit: string,
  metadata?: Record<string, unknown>,
): void {
  performanceMetrics.push({
    name,
    value,
    unit,
    recorded_at: new Date().toISOString(),
    ...(metadata ? { metadata } : {}),
  });
  writePerformanceMetrics();
}

function laneButton(page: Page, laneId: string) {
  return page
    .locator(
      `[data-testid="thread-row-${laneId}"]:visible, [data-testid="chat-group-toggle"][data-group-lane-id="${laneId}"]:visible`,
    )
    .first();
}

async function ensureLaneVisible(page: Page, laneId: string, parentLaneId?: string): Promise<void> {
  const threadRow = laneButton(page, laneId);
  if ((await threadRow.count()) > 0) {
    return;
  }
  const expandToggle = page
    .locator(
      `[data-testid="chat-group-expand-toggle"][data-group-lane-id="${parentLaneId ?? laneId}"]`,
    )
    .first();
  await expect(expandToggle).toBeVisible({ timeout: 30_000 });
  await expandToggle.click();
  await expect(threadRow).toBeVisible({ timeout: 30_000 });
}

async function openLane(page: Page, laneId: string, parentLaneId?: string): Promise<void> {
  await ensureLaneVisible(page, laneId, parentLaneId);
  const row = laneButton(page, laneId);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await expect(page.locator('[data-testid="chat-view"]')).toHaveAttribute("data-lane-id", laneId, {
    timeout: 20_000,
  });
}

async function reconnectRuntime(page: Page): Promise<void> {
  await page.evaluate(() => {
    const app = document.querySelector("nexus-app") as { client?: { stop(): void; start(): void } } | null;
    app?.client?.stop();
  });
  await page.waitForTimeout(500);
  await page
    .waitForFunction(() => {
      const app = document.querySelector("nexus-app") as { connected?: boolean } | null;
      return app?.connected === false;
    }, { timeout: 5_000 })
    .catch(() => {});
  await page.evaluate(() => {
    const app = document.querySelector("nexus-app") as { client?: { stop(): void; start(): void } } | null;
    app?.client?.start();
  });
  await page.waitForTimeout(1_000);
  await page
    .waitForFunction(() => {
      const app = document.querySelector("nexus-app") as { lastError?: string | null } | null;
      return !app?.lastError;
    }, { timeout: 10_000 })
    .catch(() => {});
}

async function expectTranscriptTextVisible(page: Page, text: string | RegExp, timeout = 20_000): Promise<void> {
  await expect(
    page.locator('[data-testid="chat-transcript-panel"]').getByText(text, { exact: typeof text === "string" }).first(),
  ).toBeVisible({ timeout });
}

async function expectChatOwnsViewportScroll(page: Page): Promise<{
  documentOverflowPx: number;
  windowScrollY: number;
}> {
  const metrics = await page.evaluate(() => {
    const scrollingElement = document.scrollingElement ?? document.documentElement;
    return {
      documentOverflowPx: scrollingElement.scrollHeight - scrollingElement.clientHeight,
      windowScrollY: window.scrollY,
    };
  });
  expect(metrics.windowScrollY).toBe(0);
  expect(metrics.documentOverflowPx).toBeLessThanOrEqual(2);
  return metrics;
}

async function exerciseTranscriptScroll(page: Page): Promise<{
  clientHeight: number;
  durationMs: number;
  scrollHeight: number;
  scrollTopAfterBottom: number;
  scrollTopAfterMiddle: number;
  scrollTopAfterTop: number;
  windowScrollY: number;
}> {
  return await page.evaluate(async () => {
    const panel = document.querySelector<HTMLElement>('[data-testid="chat-transcript-panel"]');
    if (!panel) {
      throw new Error("chat transcript panel not found");
    }
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const startedAt = performance.now();

    panel.scrollTop = 0;
    await frame();
    const scrollTopAfterTop = panel.scrollTop;

    panel.scrollTop = Math.floor(panel.scrollHeight / 2);
    await frame();
    const scrollTopAfterMiddle = panel.scrollTop;

    panel.scrollTop = panel.scrollHeight;
    await frame();
    const scrollTopAfterBottom = panel.scrollTop;

    return {
      clientHeight: panel.clientHeight,
      durationMs: performance.now() - startedAt,
      scrollHeight: panel.scrollHeight,
      scrollTopAfterBottom,
      scrollTopAfterMiddle,
      scrollTopAfterTop,
      windowScrollY: window.scrollY,
    };
  });
}

test.describe("Operator Chat cleanroom proof", () => {
  test.skip(!process.env.E2E_REQUIRE_RUNTIME, "runtime-backed assertions only run in cleanroom");

  test("proves manager chat, worker chat, approvals, replay, and linked public context from /chat", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    page.on("pageerror", (error) => {
      // Keep browser-side render failures in the cleanroom stdout bundle.
      console.log("[operator-chat:pageerror]", error.message);
      if (error.stack) {
        console.log(error.stack);
      }
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        console.log("[operator-chat:console:error]", message.text());
      }
    });

    const consoleErrors = setupConsoleErrorCapture(page);
    const consoleReadyStartedAt = Date.now();
    await waitForConsoleReady(page);
    recordPerformanceMetric("console_ready", Date.now() - consoleReadyStartedAt, "ms", {
      entry_path: process.env.CONSOLE_ENTRY_PATH ?? "/",
    });

    const firstLaneStartedAt = Date.now();
    await expect(page.locator('[data-testid="chat-sidebar"]')).toBeVisible({ timeout: 30_000 });
    await ensureLaneVisible(page, managerLaneId);
    recordPerformanceMetric("manager_lane_visible", Date.now() - firstLaneStartedAt, "ms", {
      lane_id: managerLaneId,
    });
    await expect(page.locator(`[data-testid="thread-row-${workerLaneId}"]:visible`)).toHaveCount(0);
    await screenshot(page, "operator-chat-manager-first-default");

    await openLane(page, managerLaneId);
    await expect(page.locator('[data-testid="chat-view"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid="chat-view"]')).toHaveAttribute("data-lane-id", managerLaneId);
    await expect(page.locator('[data-testid="chat-lane-title"]')).toBeVisible();
    await expect(page.locator('[data-testid="chat-lane-title"]')).toHaveText(/Echo/i);
    const viewportMetrics = await expectChatOwnsViewportScroll(page);
    recordPerformanceMetric("document_overflow_after_manager_open", viewportMetrics.documentOverflowPx, "px", {
      lane_id: managerLaneId,
    });

    await expect(page.locator('[data-testid="chat-context-toggle"]')).toBeVisible();
    const contextOpenStartedAt = Date.now();
    await page.locator('[data-testid="chat-context-toggle"]').click();
    await expect(page.locator('[data-testid="chat-context-sheet"]')).toBeVisible({ timeout: 10_000 });
    recordPerformanceMetric("context_sheet_open", Date.now() - contextOpenStartedAt, "ms", {
      lane_id: managerLaneId,
    });
    await expect(page.locator('[data-testid="chat-conversation-record"]')).toHaveCount(2);
    const contextSheetMetrics = await page.locator('[data-testid="chat-context-sheet"]').evaluate((sheet) => {
      const viewport = sheet.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
      return {
        hasInternalViewport: Boolean(viewport),
        internalOverflowPx: viewport ? viewport.scrollHeight - viewport.clientHeight : 0,
        windowScrollY: window.scrollY,
      };
    });
    expect(contextSheetMetrics.hasInternalViewport).toBe(true);
    expect(contextSheetMetrics.windowScrollY).toBe(0);
    await page.getByRole("button", { name: /^Close$/ }).click();
    await expect(page.locator('[data-testid="chat-context-sheet"]')).toBeHidden();
    await screenshot(page, "operator-chat-initial-state");

    const actionPrompt = `Lane action proof prompt ${Date.now()}`;
    const actionReply = `Lane action cleanroom reply for ${actionPrompt}`;
    await page.locator('[data-testid="chat-lane-action-add"]').click();
    await page.locator('[data-testid="chat-lane-action-label-input"]').fill("Retained proof action");
    await page.locator('[data-testid="chat-lane-action-prompt-input"]').fill(actionPrompt);
    await page.locator('[data-testid="chat-lane-action-save"]').click();
    await expect(page.locator('[data-testid="chat-lane-action-primary"]')).toBeVisible();
    await page.locator('[data-testid="chat-lane-action-menu"]').click();
    const createdAction = page
      .locator('[data-testid="chat-lane-action-item"]')
      .filter({ hasText: "Retained proof action" })
      .first();
    await expect(createdAction).toBeVisible();
    await createdAction.click();
    runProofHelper([
      "append-turn",
      "--lane-id",
      managerLaneId,
      "--expected-text",
      actionPrompt,
      "--assistant-text",
      actionReply,
    ]);
    await expect(
      page.locator('[data-testid="chat-transcript-panel"]').getByText(actionPrompt, { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expectTranscriptTextVisible(page, actionReply);
    await screenshot(page, "operator-chat-lane-action-created-and-invoked");

    const activeChatView = page.locator('[data-testid="chat-view"]');
    await expect(activeChatView.getByText(/PENDING APPROVAL/i)).toBeVisible();
    await page.getByRole("button", { name: /^Approve once$/ }).click();
    await expect(activeChatView.getByText(/PENDING APPROVAL/i)).toHaveCount(0);
    await screenshot(page, "operator-chat-approval-resolved");

    await page.reload();
    await waitForConsoleReady(page);
    await openLane(page, managerLaneId);

    const managerPrompt = `Manager proof send ${Date.now()}`;
    const managerReply = `Manager cleanroom reply for ${managerPrompt}`;
    await page.getByTestId("composer-editor").fill(managerPrompt);
    await page.getByTestId("composer-editor").press("Enter");
    runProofHelper([
      "append-turn",
      "--lane-id",
      managerLaneId,
      "--expected-text",
      managerPrompt,
      "--assistant-text",
      managerReply,
    ]);
    await expectTranscriptTextVisible(page, managerPrompt);
    await expectTranscriptTextVisible(page, managerReply);
    await screenshot(page, "operator-chat-manager-send-reply");

    const scrollProofPrefix = `Large transcript proof ${Date.now()}`;
    runProofHelper([
      "append-many-turns",
      "--lane-id",
      managerLaneId,
      "--count",
      "80",
      "--prefix",
      scrollProofPrefix,
    ]);
    await page.reload();
    const largeTranscriptReloadStartedAt = Date.now();
    await waitForConsoleReady(page);
    recordPerformanceMetric("large_transcript_reload_ready", Date.now() - largeTranscriptReloadStartedAt, "ms", {
      lane_id: managerLaneId,
    });
    await openLane(page, managerLaneId);
    await expectTranscriptTextVisible(page, `${scrollProofPrefix} assistant 080`, 30_000);
    const transcriptScrollMetrics = await exerciseTranscriptScroll(page);
    recordPerformanceMetric("transcript_programmatic_scroll", transcriptScrollMetrics.durationMs, "ms", {
      client_height: transcriptScrollMetrics.clientHeight,
      scroll_height: transcriptScrollMetrics.scrollHeight,
    });
    expect(transcriptScrollMetrics.scrollHeight).toBeGreaterThan(
      transcriptScrollMetrics.clientHeight + 500,
    );
    expect(transcriptScrollMetrics.scrollTopAfterMiddle).toBeGreaterThan(
      transcriptScrollMetrics.scrollTopAfterTop,
    );
    expect(transcriptScrollMetrics.scrollTopAfterBottom).toBeGreaterThan(
      transcriptScrollMetrics.scrollTopAfterMiddle,
    );
    expect(transcriptScrollMetrics.windowScrollY).toBe(0);

    const transcript = page.locator('[data-testid="chat-transcript-panel"]');
    await transcript.evaluate((panel) => {
      panel.scrollTop = 0;
    });
    await transcript.hover();
    const wheelStartTop = await transcript.evaluate((panel) => panel.scrollTop);
    await page.mouse.wheel(0, 1200);
    await expect
      .poll(async () => await transcript.evaluate((panel) => panel.scrollTop), { timeout: 5_000 })
      .toBeGreaterThan(wheelStartTop);
    const wheelEndTop = await transcript.evaluate((panel) => panel.scrollTop);
    recordPerformanceMetric("transcript_wheel_scroll_delta", wheelEndTop - wheelStartTop, "px", {
      lane_id: managerLaneId,
    });
    await expectChatOwnsViewportScroll(page);
    await screenshot(page, "operator-chat-large-transcript-scroll-proof");

    await openLane(page, workerLaneId, managerLaneId);
    await expect(page.locator('[data-testid="chat-view"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid="chat-view"]')).toHaveAttribute("data-lane-id", workerLaneId, {
      timeout: 20_000,
    });
    await expect(page.locator('[data-testid="chat-lane-title"]')).toBeVisible();
    await expect(page.locator('[data-testid="chat-lane-title"]')).toHaveText(/Worker Proof/i);
    const workerPrompt = `Worker proof send ${Date.now()}`;
    const workerReply = `Worker cleanroom reply for ${workerPrompt}`;
    await page.getByTestId("composer-editor").fill(workerPrompt);
    await page.getByTestId("composer-editor").press("Enter");
    runProofHelper([
      "append-turn",
      "--lane-id",
      workerLaneId,
      "--expected-text",
      workerPrompt,
      "--assistant-text",
      workerReply,
    ]);
    await page.reload();
    await waitForConsoleReady(page);
    await openLane(page, workerLaneId, managerLaneId);
    await expectTranscriptTextVisible(page, workerPrompt);
    await expectTranscriptTextVisible(page, workerReply);
    await screenshot(page, "operator-chat-worker-send-reply");

    await laneButton(page, managerLaneId).click();
    await expect(page.locator('[data-testid="chat-view"]')).toHaveAttribute("data-lane-id", managerLaneId, {
      timeout: 20_000,
    });

    await page.locator('[data-testid="chat-context-toggle"]').click();
    await expect(page.locator('[data-testid="chat-context-sheet"]')).toBeVisible({ timeout: 10_000 });
    await page.locator('[data-testid="chat-delivery-select"]').selectOption({ label: "Casey (discord) via discord" });
    await expect(
      page
        .locator('[data-testid="chat-context-sheet"]')
        .locator('[data-testid="chat-delivery-panel"]'),
    ).toContainText(/discord/i);
    await screenshot(page, "operator-chat-delivery-switched");

    const replayUser = `Replay proof message ${Date.now()}`;
    const replayReply = `Replay cleanroom reply for ${replayUser}`;
    await page.evaluate(() => {
      const app = document.querySelector("nexus-app") as { client?: { stop(): void } } | null;
      app?.client?.stop();
    });
    await page.waitForTimeout(500);
    runProofHelper([
      "append-turn",
      "--lane-id",
      managerLaneId,
      "--user-text",
      replayUser,
      "--assistant-text",
      replayReply,
      "--nudge",
      "0",
    ]);
    await page.reload();
    await waitForConsoleReady(page);
    await laneButton(page, managerLaneId).click();
    await expect(page.locator('[data-testid="chat-view"]')).toHaveAttribute("data-lane-id", managerLaneId, {
      timeout: 20_000,
    });
    await expectTranscriptTextVisible(page, replayReply);
    await screenshot(page, "operator-chat-replay-recovered");

    const criticalErrors = consoleErrors.filter((entry) =>
      !entry.includes("favicon") &&
      !entry.includes("WebSocket") &&
      !entry.includes("runtime closed") &&
      !entry.includes("disconnected ("),
    );
    expect(criticalErrors).toHaveLength(0);
  });
});

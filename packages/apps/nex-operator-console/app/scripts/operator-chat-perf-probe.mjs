#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const targetUrl = process.env.CONSOLE_URL || "http://127.0.0.1:18789/app/console/chat";
const outputPath = process.env.OUTPUT || "";
const timeoutMs = Number.parseInt(process.env.TIMEOUT_MS || "30000", 10);
const poisonRuntimeUrl = process.env.POISON_RUNTIME_URL === "1";

function nowIso() {
  return new Date().toISOString();
}

function summarizeResource(entry) {
  return {
    name: entry.name,
    initiatorType: entry.initiatorType,
    transferSize: entry.transferSize,
    encodedBodySize: entry.encodedBodySize,
    decodedBodySize: entry.decodedBodySize,
    durationMs: entry.duration,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: process.env.PLAYWRIGHT_HEADLESS !== "0" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const startedAt = Date.now();
  const consoleErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });

  await page.addInitScript(
    ({ poisonRuntimeUrl }) => {
      window.localStorage.setItem("nexus.console.latency", "1");
      if (poisonRuntimeUrl) {
        const staleSettings = JSON.stringify({
          runtimeUrl: "ws://127.0.0.1:9",
          token: "stale-token",
        });
        window.localStorage.setItem("nexus.control.settings", staleSettings);
        window.localStorage.setItem("nexus.control.settings.v1", staleSettings);
      }
    },
    { poisonRuntimeUrl },
  );

  let navigationError = null;
  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  } catch (error) {
    navigationError = error instanceof Error ? error.message : String(error);
  }

  const waitForApp = async () => {
    await page
      .waitForFunction(() => Boolean(document.querySelector("nexus-app")), { timeout: timeoutMs })
      .catch(() => {});
  };
  await waitForApp();

  const waitForConnected = async () => {
    await page
      .waitForFunction(() => {
        const app = document.querySelector("nexus-app");
        return app?.connected === true;
      }, { timeout: timeoutMs })
      .catch(() => {});
  };
  await waitForConnected();

  const waitForChatSurface = async () => {
    await page
      .waitForFunction(() => {
        const bodyText = document.body.innerText;
        return (
          Boolean(document.querySelector('[data-testid="chat-sidebar"]')) ||
          bodyText.includes("Waiting for the Nex runtime connection") ||
          bodyText.includes("Connecting to the Nex runtime") ||
          bodyText.includes("runtime not connected")
        );
      }, { timeout: timeoutMs })
      .catch(() => {});
  };
  await waitForChatSurface();

  await page
    .waitForFunction(() => {
      return (window.__nexusConsoleTimings ?? []).some((entry) =>
        String(entry.label ?? "").startsWith("chat.bridge.request.chat.snapshot"),
      );
    }, { timeout: Math.min(timeoutMs, 10_000) })
    .catch(() => {});

  const result = await page.evaluate(() => {
    const app = document.querySelector("nexus-app");
    const chatHost = document.querySelector("nexus-console-chat-host");
    const sidebar = document.querySelector('[data-testid="chat-sidebar"]');
    const chatView = document.querySelector('[data-testid="chat-view"]');
    const transcript = document.querySelector('[data-testid="chat-transcript-panel"]');
    const timings = window.__nexusConsoleTimings ?? [];
    const resources = performance
      .getEntriesByType("resource")
      .filter((entry) => {
        const resource = entry;
        return (
          resource.initiatorType === "script" ||
          resource.initiatorType === "css" ||
          resource.initiatorType === "font"
        );
      })
      .map((entry) => ({
        name: entry.name,
        initiatorType: entry.initiatorType,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
        duration: entry.duration,
      }));

    return {
      app: {
        connected: app?.connected ?? null,
        runtimeConnecting: app?.runtimeConnecting ?? null,
        lastError: app?.lastError ?? null,
        runtimeUrl: app?.settings?.runtimeUrl ?? null,
      },
      chat: {
        hostPresent: Boolean(chatHost),
        sidebarPresent: Boolean(sidebar),
        selectedLaneId: chatView?.getAttribute("data-lane-id") ?? null,
        transcriptPresent: Boolean(transcript),
        transcriptScrollHeight: transcript?.scrollHeight ?? null,
        transcriptClientHeight: transcript?.clientHeight ?? null,
      },
      text: document.body.innerText.slice(0, 500),
      timings,
      resources,
    };
  });

  const output = {
    recorded_at: nowIso(),
    targetUrl,
    poisonRuntimeUrl,
    elapsedMs: Date.now() - startedAt,
    navigationError,
    consoleErrors,
    app: result.app,
    chat: result.chat,
    timings: result.timings,
    resources: result.resources.map(summarizeResource),
    text: result.text,
  };

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(output, null, 2));
  await browser.close();

  if (!output.app.connected) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

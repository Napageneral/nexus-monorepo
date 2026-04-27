import { test } from "@playwright/test";
import { waitForConsoleReady } from "./helpers";

test("diagnoses operator chat embed state", async ({ page }) => {
  test.setTimeout(180_000);

  await waitForConsoleReady(page);
  await page.waitForTimeout(1_000);

  const snapshot = await page.evaluate(async () => {
    const win = window as typeof window & {
      __NEX_CHAT_EMBED_CONFIG__?: unknown;
      nativeApi?: {
        server?: { getConfig?: () => Promise<unknown> };
        orchestration?: { getSnapshot?: () => Promise<unknown> };
      };
    };

    const result: Record<string, unknown> = {
      href: window.location.href,
      bodyText: document.body.innerText.slice(0, 600),
      hasNativeApi: Boolean(win.nativeApi),
      hasEmbedConfig: Boolean(win.__NEX_CHAT_EMBED_CONFIG__),
      sidebarPresent: Boolean(document.querySelector('[data-testid="chat-sidebar"]')),
    };

    if (win.__NEX_CHAT_EMBED_CONFIG__ && typeof win.__NEX_CHAT_EMBED_CONFIG__ === "object") {
      result.embedConfigKeys = Object.keys(win.__NEX_CHAT_EMBED_CONFIG__ as object);
    }

    try {
      result.serverConfig = await win.nativeApi?.server?.getConfig?.();
    } catch (error) {
      result.serverConfigError = error instanceof Error ? error.message : String(error);
    }

    try {
      result.orchestrationSnapshot = await win.nativeApi?.orchestration?.getSnapshot?.();
    } catch (error) {
      result.orchestrationSnapshotError = error instanceof Error ? error.message : String(error);
    }

    return result;
  });

  console.log(JSON.stringify(snapshot, null, 2));
});

import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { FrontdoorStore } from "./frontdoor-store.js";
import { syncProductFromManifest } from "./product-sync.js";

const AIX_MANIFEST_PATH = "/Users/tyler/nexus/home/projects/nexus/apps/aix/app/app.nexus.json";

describe("syncProductFromManifest", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    while (cleanupPaths.length > 0) {
      const target = cleanupPaths.pop();
      if (target) {
        await rm(target, { recursive: true, force: true });
      }
    }
  });

  it("ingests the AIX app manifest into the frontdoor product catalog", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "frontdoor-product-sync-aix-"));
    cleanupPaths.push(tempDir);
    const storePath = path.join(tempDir, "frontdoor.db");
    const store = new FrontdoorStore(storePath);
    try {
      const result = await syncProductFromManifest(store, AIX_MANIFEST_PATH);
      expect(result.appId).toBe("aix");
      expect(result.productsUpserted).toBe(1);

      const product = store.getProduct("aix");
      expect(product).not.toBeNull();
      expect(product?.displayName).toBe("AIX");
      expect(product?.tagline).toBe("Collect and archive distributed AI session history");
      expect(product?.accentColor).toBe("#0f766e");
    } finally {
      store.close();
    }
  });
});

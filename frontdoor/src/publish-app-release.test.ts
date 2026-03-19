import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { FrontdoorStore } from "./frontdoor-store.js";
import { publishAppRelease } from "./publish-app-release.js";

const AIX_APP_ROOT = "/Users/tyler/nexus/home/projects/nexus/packages/apps/aix/app";
const AIX_MANIFEST_PATH = path.join(AIX_APP_ROOT, "app.nexus.json");
const SPIKE_APP_ROOT = "/Users/tyler/nexus/home/projects/nexus/packages/apps/spike/app";
const SPIKE_MANIFEST_PATH = path.join(SPIKE_APP_ROOT, "app.nexus.json");

describe("publishAppRelease", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    while (cleanupPaths.length > 0) {
      const target = cleanupPaths.pop();
      if (target) {
        await rm(target, { recursive: true, force: true });
      }
    }
  });

  it("publishes the AIX app into both product catalog and package registry state", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "frontdoor-publish-aix-"));
    cleanupPaths.push(tempDir);
    const storePath = path.join(tempDir, "frontdoor.db");
    const tarballPath = path.join(tempDir, "app-aix-1.0.0.tar.gz");
    fs.writeFileSync(tarballPath, "aix-test-package\n", "utf8");

    const manifest = JSON.parse(fs.readFileSync(AIX_MANIFEST_PATH, "utf8")) as {
      id?: string;
      version?: string;
    };
    const expectedId = String(manifest.id ?? "");
    const expectedVersion = String(manifest.version ?? "");

    const store = new FrontdoorStore(storePath);
    try {
      const result = await publishAppRelease({
        store,
        packageRoot: AIX_APP_ROOT,
        tarballPath,
        targetOs: "linux",
        targetArch: "x64",
      });

      expect(result.package_id).toBe(expectedId);
      expect(result.version).toBe(expectedVersion);

      const product = store.getProduct(expectedId);
      expect(product).not.toBeNull();
      expect(product?.displayName).toBe("AIX");

      const variant = store.getPackageReleaseVariant("app", expectedId, expectedVersion);
      expect(variant).not.toBeNull();
      expect(variant?.version).toBe(expectedVersion);
      expect(variant?.targetOs).toBe("linux");
      expect(variant?.targetArch).toBe("x64");
      expect(variant?.tarballPath).toBe(tarballPath);
    } finally {
      store.close();
    }
  });

  it("publishes Spike into package registry state and creates the default product plan", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "frontdoor-publish-spike-"));
    cleanupPaths.push(tempDir);
    const storePath = path.join(tempDir, "frontdoor.db");
    const tarballPath = path.join(tempDir, "app-spike-1.0.0.tar.gz");
    fs.writeFileSync(tarballPath, "spike-test-package\n", "utf8");

    const manifest = JSON.parse(fs.readFileSync(SPIKE_MANIFEST_PATH, "utf8")) as {
      id?: string;
      version?: string;
    };
    const expectedId = String(manifest.id ?? "");
    const expectedVersion = String(manifest.version ?? "");

    const store = new FrontdoorStore(storePath);
    try {
      const result = await publishAppRelease({
        store,
        packageRoot: SPIKE_APP_ROOT,
        tarballPath,
        targetOs: "linux",
        targetArch: "amd64",
      });

      expect(result.package_id).toBe(expectedId);
      expect(result.version).toBe(expectedVersion);

      const product = store.getProduct(expectedId);
      expect(product).not.toBeNull();
      expect(product?.displayName).toBe("Spike");
      expect(product?.tagline).toBe("AI-powered code intelligence for private repositories");

      const plan = store.getProductPlan("default");
      expect(plan).not.toBeNull();
      expect(plan?.productId).toBe(expectedId);
      expect(plan?.displayName).toBe("Free");

      const variant = store.getPackageReleaseVariant("app", expectedId, expectedVersion);
      expect(variant).not.toBeNull();
      expect(variant?.version).toBe(expectedVersion);
      expect(variant?.targetOs).toBe("linux");
      expect(variant?.targetArch).toBe("amd64");
      expect(variant?.tarballPath).toBe(tarballPath);
    } finally {
      store.close();
    }
  });

  it("extracts and stores app and adapter release dependencies from the manifest", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "frontdoor-publish-deps-"));
    cleanupPaths.push(tempDir);
    const storePath = path.join(tempDir, "frontdoor.db");
    const packageRoot = path.join(tempDir, "package");
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(
      path.join(packageRoot, "app.nexus.json"),
      JSON.stringify({
        id: "glowbot-admin",
        version: "1.0.0",
        displayName: "GlowBot Admin",
        requires: {
          apps: [{ id: "glowbot-hub", version: "^1.0.0" }],
          adapters: [{ id: "google", version: "^1.0.0" }],
        },
      }),
      "utf8",
    );
    const tarballPath = path.join(tempDir, "glowbot-admin-1.0.0.tar.gz");
    fs.writeFileSync(tarballPath, "glowbot-admin-package\n", "utf8");

    const store = new FrontdoorStore(storePath);
    try {
      const result = await publishAppRelease({
        store,
        packageRoot,
        tarballPath,
        targetOs: "linux",
        targetArch: "x64",
      });

      expect(result.package_id).toBe("glowbot-admin");
      expect(store.getPackage("glowbot-hub")?.kind).toBe("app");
      expect(store.getPackage("google")?.kind).toBe("adapter");
      expect(store.listPackageReleaseDependencies(result.release_id)).toEqual([
        {
          releaseId: result.release_id,
          dependencyClass: "app",
          dependencyPackageId: "glowbot-hub",
          versionConstraint: "^1.0.0",
          requiredForActivate: true,
          sortOrder: 0,
        },
        {
          releaseId: result.release_id,
          dependencyClass: "adapter",
          dependencyPackageId: "google",
          versionConstraint: "^1.0.0",
          requiredForActivate: true,
          sortOrder: 1,
        },
      ]);
    } finally {
      store.close();
    }
  });

  it("persists product visibility from the manifest", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "frontdoor-publish-visibility-"));
    cleanupPaths.push(tempDir);
    const storePath = path.join(tempDir, "frontdoor.db");
    const packageRoot = path.join(tempDir, "package");
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(
      path.join(packageRoot, "app.nexus.json"),
      JSON.stringify({
        id: "glowbot-admin",
        version: "1.0.0",
        displayName: "GlowBot Admin",
        product: {
          visibility: "operator",
          tagline: "Operator console",
        },
      }),
      "utf8",
    );
    const tarballPath = path.join(tempDir, "glowbot-admin-1.0.0.tar.gz");
    fs.writeFileSync(tarballPath, "glowbot-admin-package\n", "utf8");

    const store = new FrontdoorStore(storePath);
    try {
      await publishAppRelease({
        store,
        packageRoot,
        tarballPath,
        targetOs: "linux",
        targetArch: "x64",
      });
      expect(store.getProduct("glowbot-admin")?.visibility).toBe("operator");
    } finally {
      store.close();
    }
  });

  it("rejects invalid app hosting policy values", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "frontdoor-publish-invalid-app-hosting-"));
    cleanupPaths.push(tempDir);
    const storePath = path.join(tempDir, "frontdoor.db");
    const packageRoot = path.join(tempDir, "package");
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(
      path.join(packageRoot, "app.nexus.json"),
      JSON.stringify({
        id: "glowbot",
        version: "1.0.0",
        displayName: "GlowBot",
        hosting: {
          required_server_class: "hipaa",
        },
      }),
      "utf8",
    );
    const tarballPath = path.join(tempDir, "glowbot-1.0.0.tar.gz");
    fs.writeFileSync(tarballPath, "glowbot-package\n", "utf8");

    const store = new FrontdoorStore(storePath);
    try {
      await expect(
        publishAppRelease({
          store,
          packageRoot,
          tarballPath,
          targetOs: "linux",
          targetArch: "x64",
        }),
      ).rejects.toThrow(/invalid hosting\.required_server_class/i);
    } finally {
      store.close();
    }
  });
});

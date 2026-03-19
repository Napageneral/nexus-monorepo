import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { FrontdoorStore } from "./frontdoor-store.js";
import { publishAdapterRelease } from "./publish-adapter-release.js";

const GIT_ADAPTER_ROOT = "/Users/tyler/nexus/home/projects/nexus/packages/adapters/git";
const GIT_ADAPTER_MANIFEST_PATH = path.join(GIT_ADAPTER_ROOT, "adapter.nexus.json");

describe("publishAdapterRelease", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    while (cleanupPaths.length > 0) {
      const target = cleanupPaths.pop();
      if (target) {
        await rm(target, { recursive: true, force: true });
      }
    }
  });

  it("publishes the git adapter into package registry state", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "frontdoor-publish-git-adapter-"));
    cleanupPaths.push(tempDir);
    const storePath = path.join(tempDir, "frontdoor.db");
    const tarballPath = path.join(tempDir, "git-1.0.0.tar.gz");
    fs.writeFileSync(tarballPath, "git-adapter-test-package\n", "utf8");

    const manifest = JSON.parse(fs.readFileSync(GIT_ADAPTER_MANIFEST_PATH, "utf8")) as {
      id?: string;
      version?: string;
    };
    const expectedId = String(manifest.id ?? "");
    const expectedVersion = String(manifest.version ?? "");

    const store = new FrontdoorStore(storePath);
    try {
      const result = await publishAdapterRelease({
        store,
        packageRoot: GIT_ADAPTER_ROOT,
        tarballPath,
        targetOs: "linux",
        targetArch: "amd64",
      });

      expect(result.package_id).toBe(expectedId);
      expect(result.version).toBe(expectedVersion);

      const variant = store.getPackageReleaseVariant("adapter", expectedId, expectedVersion);
      expect(variant).not.toBeNull();
      expect(variant?.version).toBe(expectedVersion);
      expect(variant?.targetOs).toBe("linux");
      expect(variant?.targetArch).toBe("amd64");
      expect(variant?.tarballPath).toBe(tarballPath);
    } finally {
      store.close();
    }
  });

  it("rejects invalid adapter hosting policy values", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "frontdoor-publish-invalid-adapter-hosting-"));
    cleanupPaths.push(tempDir);
    const storePath = path.join(tempDir, "frontdoor.db");
    const packageRoot = path.join(tempDir, "package");
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(
      path.join(packageRoot, "adapter.nexus.json"),
      JSON.stringify({
        id: "zenoti-emr",
        version: "1.0.0",
        displayName: "Zenoti EMR",
        platform: "zenoti-emr",
        command: "./bin/zenoti-emr-adapter",
        skill: "./SKILL.md",
        hosting: {
          deployment_class: "clinic",
        },
      }),
      "utf8",
    );
    const tarballPath = path.join(tempDir, "zenoti-emr-1.0.0.tar.gz");
    fs.writeFileSync(tarballPath, "zenoti-emr-package\n", "utf8");

    const store = new FrontdoorStore(storePath);
    try {
      await expect(
        publishAdapterRelease({
          store,
          packageRoot,
          tarballPath,
          targetOs: "linux",
          targetArch: "amd64",
        }),
      ).rejects.toThrow(/invalid hosting\.deployment_class/i);
    } finally {
      store.close();
    }
  });
});

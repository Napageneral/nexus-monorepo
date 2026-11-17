import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mailchimpAdapter } from "./adapter.js";

describe("Mailchimp method contract", () => {
  it("exposes only read methods", async () => {
    const controller = new AbortController();
    const info = await mailchimpAdapter.operations["adapter.info"]!({
      signal: controller.signal,
      runtime: null,
      log: { debug() {}, info() {}, error() {} },
      stdout: process.stdout,
      stderr: process.stderr,
    });
    expect(info.methods?.length).toBe(10);
    for (const declaration of info.methods ?? []) {
      expect(declaration.action).toBe("read");
      expect(declaration.mutates_remote).toBe(false);
      expect(declaration.name).not.toMatch(/send|create|update|delete/iu);
    }
  });

  it("declares the staged backfill the runtime's worker path requires", async () => {
    const controller = new AbortController();
    const info = await mailchimpAdapter.operations["adapter.info"]!({
      signal: controller.signal,
      runtime: null,
      log: { debug() {}, info() {}, error() {} },
      stdout: process.stdout,
      stderr: process.stderr,
    });
    // The runtime's backfill job accepts an adapter for its worker path when adapter.info
    // lists records.backfill.stage among its operations or methods.
    expect(info.operations).toContain("records.backfill");
    expect(info.methods?.some((declaration) => declaration.name === "records.backfill.stage")).toBe(true);
    expect(mailchimpAdapter.operations.methods?.["records.backfill.stage"]).toBeTypeOf("function");
  });

  it("reports the manifest version in adapter.info", async () => {
    // 0.2.4 shipped with adapter.info still saying 0.2.3 (Track 4, 2026-09-08): the version the
    // runtime catalogs (adapter.nexus.json, package.json) and the version the process reports
    // must be one number.
    const manifest = JSON.parse(readFileSync(resolve("adapter.nexus.json"), "utf8")) as {
      version: string;
    };
    const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as { version: string };
    const controller = new AbortController();
    const info = await mailchimpAdapter.operations["adapter.info"]!({
      signal: controller.signal,
      runtime: null,
      log: { debug() {}, info() {}, error() {} },
      stdout: process.stdout,
      stderr: process.stderr,
    });
    expect(info.version).toBe(manifest.version);
    expect(pkg.version).toBe(manifest.version);
  });
});

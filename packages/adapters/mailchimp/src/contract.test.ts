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
});

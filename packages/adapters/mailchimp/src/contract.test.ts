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
    expect(info.methods?.length).toBe(6);
    for (const declaration of info.methods ?? []) {
      expect(declaration.action).toBe("read");
      expect(declaration.mutates_remote).toBe(false);
      expect(declaration.name).not.toMatch(/send|create|update|delete/iu);
    }
  });
});

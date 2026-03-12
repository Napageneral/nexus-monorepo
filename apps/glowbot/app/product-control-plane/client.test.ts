import { describe, expect, it, vi } from "vitest";
import { callGlowbotProductControlPlane } from "./client.js";

describe("callGlowbotProductControlPlane", () => {
  it("unwraps relayed product-control-plane result envelopes", async () => {
    const runtime = {
      callMethod: vi.fn(async () => ({
        result: {
          productFlags: [{ key: "syntheticRehearsal", value: true }],
        },
      })),
    };

    const result = await callGlowbotProductControlPlane<{ productFlags: Array<{ key: string }> }>(
      runtime,
      "glowbotHub.productFlags.list",
      {},
    );

    expect(runtime.callMethod).toHaveBeenCalledWith("productControlPlane.call", {
      operation: "glowbotHub.productFlags.list",
      payload: {},
    });
    expect(result.productFlags[0]?.key).toBe("syntheticRehearsal");
  });
});

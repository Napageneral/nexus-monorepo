import { describe, expect, it, vi } from "vitest";
import { callGlowbotHubOperation, createGlowbotHubProxyHandler, getGlowbotHubHealth } from "./_proxy.js";
import { handle as overviewGetHandler } from "./overview-get.js";

function createContext() {
  const callMethod = vi.fn();
  return {
    ctx: {
      params: {},
      user: {
        userId: "u-1",
        email: "owner@example.com",
        displayName: "Owner",
        role: "admin",
        accountId: "acct-1",
      },
      account: {
        accountId: "acct-1",
        displayName: "GlowBot Operator",
      },
      app: {
        id: "glowbot-admin",
        version: "1.0.0",
        dataDir: "/tmp/glowbot-admin",
        packageDir: "/tmp/glowbot-admin/pkg",
        config: {},
        service: vi.fn(),
      },
      nex: {
        runtime: {
          callMethod,
        },
      } as never,
    },
    callMethod,
  };
}

describe("glowbot admin hub proxy", () => {
  it("calls the co-installed hub app through runtime.callMethod", async () => {
    const { ctx, callMethod } = createContext();
    callMethod.mockResolvedValue({
      productFlags: [{ key: "benchmarks_enabled", value: true, updatedAtMs: 1 }],
    });

    const result = await callGlowbotHubOperation<{ productFlags: Array<{ key: string }> }>(
      ctx,
      "glowbotHub.productFlags.list",
      {},
    );

    expect(callMethod).toHaveBeenCalledWith("glowbotHub.productFlags.list", {});
    expect(result.productFlags[0]?.key).toBe("benchmarks_enabled");
  });

  it("throws when the runtime call fails", async () => {
    const { ctx, callMethod } = createContext();
    callMethod.mockRejectedValue(new Error("hub exploded"));

    await expect(
      callGlowbotHubOperation(ctx, "glowbotHub.productFlags.list", {}),
    ).rejects.toThrow("hub exploded");
  });

  it("reads hub health through the co-installed hub app methods", async () => {
    const { ctx, callMethod } = createContext();
    callMethod.mockResolvedValue({ status: "ok" });

    const result = await getGlowbotHubHealth(ctx);

    expect(callMethod).toHaveBeenCalledWith("glowbotHub.diagnostics.summary", {});
    expect(result.status).toBe("ok");
  });

  it("builds proxy handlers over the co-installed hub app methods", async () => {
    const { ctx, callMethod } = createContext();
    ctx.params = { includeArchived: true };
    callMethod.mockResolvedValue({ profiles: [] });

    const handler = createGlowbotHubProxyHandler<{ profiles: unknown[] }>(
      "glowbotHub.managedProfiles.list",
    );
    const result = await handler(ctx);

    expect(callMethod).toHaveBeenCalledWith("glowbotHub.managedProfiles.list", {
      includeArchived: true,
    });
    expect(result).toEqual({ profiles: [] });
  });

  it("assembles overview from co-installed hub app calls", async () => {
    const { ctx, callMethod } = createContext();
    callMethod.mockImplementation(async (method: string) => {
      if (method === "glowbotHub.diagnostics.summary") {
        return { status: "healthy" };
      }
      if (method === "glowbotHub.benchmarks.networkHealth") {
        return { cohortCount: 2 };
      }
      if (method === "glowbotHub.productFlags.list") {
        return { productFlags: [{ key: "benchmarks_enabled", value: true, updatedAtMs: 1 }] };
      }
      throw new Error(`unexpected method: ${method}`);
    });

    const result = (await overviewGetHandler(ctx)) as Record<string, unknown>;

    expect(result.hubHealth).toEqual({ status: "healthy" });
    expect(result.diagnostics).toEqual({ status: "healthy" });
    expect(result.benchmarkNetwork).toEqual({ cohortCount: 2 });
    expect(result.productFlags).toEqual({
      productFlags: [{ key: "benchmarks_enabled", value: true, updatedAtMs: 1 }],
    });
  });
});

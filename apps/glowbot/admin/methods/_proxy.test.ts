import { describe, expect, it, vi } from "vitest";
import { callGlowbotHubOperation, createGlowbotHubProxyHandler, getGlowbotHubHealth } from "./_proxy.js";
import { handle as overviewGetHandler } from "./overview-get.js";

function createContext() {
  const get = vi.fn();
  const post = vi.fn();
  const service = vi.fn(() => ({
    get,
    post,
    put: vi.fn(),
    delete: vi.fn(),
    isHealthy: () => true,
  }));
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
        service,
      },
      nex: {} as never,
    },
    service,
    get,
    post,
  };
}

describe("glowbot admin hub proxy", () => {
  it("calls the local hub service and unwraps result envelopes", async () => {
    const { ctx, service, post } = createContext();
    post.mockResolvedValue({
      result: {
        productFlags: [{ key: "benchmarks_enabled", value: true, updatedAtMs: 1 }],
      },
    });

    const result = await callGlowbotHubOperation<{ productFlags: Array<{ key: string }> }>(
      ctx,
      "glowbotHub.productFlags.list",
      {},
    );

    expect(service).toHaveBeenCalledWith("hub");
    expect(post).toHaveBeenCalledWith("/operations/glowbotHub.productFlags.list", {
      payload: {},
    });
    expect(result.productFlags[0]?.key).toBe("benchmarks_enabled");
  });

  it("throws when the hub returns an error envelope", async () => {
    const { ctx, post } = createContext();
    post.mockResolvedValue({
      error: {
        code: "INTERNAL_ERROR",
        message: "hub exploded",
      },
    });

    await expect(
      callGlowbotHubOperation(ctx, "glowbotHub.productFlags.list", {}),
    ).rejects.toThrow("hub exploded");
  });

  it("reads hub health through the local service client", async () => {
    const { ctx, get } = createContext();
    get.mockResolvedValue({ status: "ok" });

    const result = await getGlowbotHubHealth(ctx);

    expect(get).toHaveBeenCalledWith("/health");
    expect(result.status).toBe("ok");
  });

  it("builds proxy handlers over the local hub service", async () => {
    const { ctx, post } = createContext();
    ctx.params = { includeArchived: true };
    post.mockResolvedValue({
      result: {
        profiles: [],
      },
    });

    const handler = createGlowbotHubProxyHandler<{ profiles: unknown[] }>(
      "glowbotHub.managedProfiles.list",
    );
    const result = await handler(ctx);

    expect(post).toHaveBeenCalledWith("/operations/glowbotHub.managedProfiles.list", {
      payload: { includeArchived: true },
    });
    expect(result).toEqual({ profiles: [] });
  });

  it("assembles overview from local hub service calls", async () => {
    const { ctx, get, post } = createContext();
    get.mockResolvedValue({ status: "ok" });
    post.mockImplementation(async (path: string) => {
      if (path === "/operations/glowbotHub.diagnostics.summary") {
        return { result: { status: "healthy" } };
      }
      if (path === "/operations/glowbotHub.benchmarks.networkHealth") {
        return { result: { cohortCount: 2 } };
      }
      if (path === "/operations/glowbotHub.productFlags.list") {
        return { result: { productFlags: [{ key: "benchmarks_enabled", value: true, updatedAtMs: 1 }] } };
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const result = (await overviewGetHandler(ctx)) as Record<string, unknown>;

    expect(result.hubHealth).toEqual({ status: "ok" });
    expect(result.diagnostics).toEqual({ status: "healthy" });
    expect(result.benchmarkNetwork).toEqual({ cohortCount: 2 });
    expect(result.productFlags).toEqual({
      productFlags: [{ key: "benchmarks_enabled", value: true, updatedAtMs: 1 }],
    });
  });
});

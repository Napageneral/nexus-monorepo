import type { NexAppMethodContext, NexAppMethodHandler } from "../../../../nex/src/apps/context.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function callGlowbotHubOperation<T>(
  ctx: NexAppMethodContext,
  operation: string,
  payload: Record<string, unknown>,
): Promise<T> {
  return (await ctx.nex.runtime.callMethod(operation, payload)) as T;
}

export async function getGlowbotHubHealth(
  ctx: NexAppMethodContext,
): Promise<Record<string, unknown>> {
  return asRecord(await ctx.nex.runtime.callMethod("glowbotHub.diagnostics.summary", {}));
}

export function createGlowbotHubProxyHandler<T = Record<string, unknown>>(
  operation: string,
): NexAppMethodHandler {
  return async (ctx) => callGlowbotHubOperation<T>(ctx, operation, ctx.params);
}

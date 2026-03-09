import type { NexAppMethodContext, NexAppMethodHandler } from "../../../../nex/src/apps/context.js";

type GlowbotHubOperationEnvelope<T> = {
  result?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

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
  const response = (await ctx.app
    .service("hub")
    .post(`/operations/${operation}`, { payload })) as GlowbotHubOperationEnvelope<T>;
  if (response.error) {
    throw new Error(response.error.message ?? `GlowBot hub operation failed: ${operation}`);
  }
  return response.result as T;
}

export async function getGlowbotHubHealth(
  ctx: NexAppMethodContext,
): Promise<Record<string, unknown>> {
  return asRecord(await ctx.app.service("hub").get("/health"));
}

export function createGlowbotHubProxyHandler<T = Record<string, unknown>>(
  operation: string,
): NexAppMethodHandler {
  return async (ctx) => callGlowbotHubOperation<T>(ctx, operation, ctx.params);
}

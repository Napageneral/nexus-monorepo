type RuntimeMethodCaller = {
  callMethod: (method: string, params: unknown) => Promise<unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function callGlowbotProductControlPlane<T>(
  runtime: RuntimeMethodCaller,
  operation: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const result = asRecord(
    await runtime.callMethod("productControlPlane.call", {
      operation,
      payload,
    }),
  );
  return result as T;
}

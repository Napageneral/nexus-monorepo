import { z } from "zod";
import { writeJSONLine } from "./io.js";
import type { AdapterRuntimeContext } from "./runtime-context.js";

/**
 * Adapter checkpoints (P-9.2): the runtime owns the durable cursor rows; an adapter reads them
 * from `ctx.runtime.checkpoints` and hands new values back either as a `{"nex":"checkpoint"}`
 * stdout line (monitors and backfills, after the records it completes) or as a `checkpoint` field
 * in a method result. The runtime persists a line only once every record before it was
 * acknowledged, fences every put with its authority epoch, and injects the row back next spawn.
 */
export const ADAPTER_CHECKPOINT_LINE_KIND = "checkpoint";

export type AdapterCheckpoint = {
  scope: string;
  key: string;
  value: unknown;
  /** Optional same-epoch compare-and-set; the runtime fills it from the version it injected. */
  expected_version?: number;
};

export type AdapterCheckpointLine = AdapterCheckpoint & { nex: typeof ADAPTER_CHECKPOINT_LINE_KIND };

export const AdapterCheckpointSchema: z.ZodType<AdapterCheckpoint> = z
  .object({
    scope: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u),
    key: z
      .string()
      .min(1)
      .max(256)
      .refine((value) => ![...value].some((ch) => (ch.codePointAt(0) ?? 0) < 0x20 || ch === "\u007f"), {
        message: "checkpoint key must be printable",
      }),
    value: z.unknown().refine((value) => value !== undefined, { message: "checkpoint requires a value" }),
    expected_version: z.number().int().nonnegative().optional(),
  })
  .strict();

export const AdapterCheckpointLineSchema: z.ZodType<AdapterCheckpointLine> = z
  .object({
    nex: z.literal(ADAPTER_CHECKPOINT_LINE_KIND),
    scope: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u),
    key: z
      .string()
      .min(1)
      .max(256)
      .refine((value) => ![...value].some((ch) => (ch.codePointAt(0) ?? 0) < 0x20 || ch === "\u007f"), {
        message: "checkpoint key must be printable",
      }),
    value: z.unknown().refine((value) => value !== undefined, { message: "checkpoint requires a value" }),
    expected_version: z.number().int().nonnegative().optional(),
  })
  .strict();

export function checkpointContextKey(scope: string, key: string): string {
  return `${scope}/${key}`;
}

/** Whether the runtime owns this adapter's checkpoints (runtime context version 2). */
export function hasManagedCheckpoints(runtime: AdapterRuntimeContext | null | undefined): boolean {
  return Boolean(runtime?.checkpoints);
}

/** The stored value for scope/key, or undefined on a cold start (or a version 1 runtime). */
export function readAdapterCheckpoint<T = unknown>(
  runtime: AdapterRuntimeContext | null | undefined,
  scope: string,
  key: string,
): T | undefined {
  const value = runtime?.checkpoints?.[checkpointContextKey(scope, key)];
  return value === undefined ? undefined : (value as T);
}

/** Validates and writes the checkpoint line to stdout, behind the records already written. */
export function emitAdapterCheckpoint(
  checkpoint: AdapterCheckpoint,
  stdout: NodeJS.WriteStream = process.stdout,
): void {
  const line = AdapterCheckpointLineSchema.parse({ nex: ADAPTER_CHECKPOINT_LINE_KIND, ...checkpoint });
  writeJSONLine(stdout, line);
}

/** Attaches the `checkpoint` field the runtime persists before it answers a method call. */
export function withAdapterCheckpoint<T extends Record<string, unknown>>(
  result: T,
  ...checkpoints: AdapterCheckpoint[]
): T & { checkpoint?: AdapterCheckpoint[] } {
  if (checkpoints.length === 0) {
    return result;
  }
  return { ...result, checkpoint: checkpoints.map((entry) => AdapterCheckpointSchema.parse(entry)) };
}

import { AdapterLogger } from "./logger.js";
import { readJSONLines, writeJSONLine } from "./io.js";
import {
  AdapterStreamStatusSchema,
  StreamEventSchema,
  type AdapterStreamStatus,
  type StreamEvent,
} from "./protocol.js";
import type { AdapterContext } from "./run.js";

export type StreamHandlers = {
  onStart?: (ctx: AdapterContext, event: Extract<StreamEvent, { type: "stream_start" }>) => void | Promise<void>;
  onToken?: (ctx: AdapterContext, event: Extract<StreamEvent, { type: "token" }>) => void | Promise<void>;
  onToolStatus?: (
    ctx: AdapterContext,
    event: Extract<StreamEvent, { type: "tool_status" }>,
  ) => void | Promise<void>;
  onReasoning?: (
    ctx: AdapterContext,
    event: Extract<StreamEvent, { type: "reasoning" }>,
  ) => void | Promise<void>;
  onEnd?: (ctx: AdapterContext, event: Extract<StreamEvent, { type: "stream_end" }>) => void | Promise<void>;
  onError?: (
    ctx: AdapterContext,
    event: Extract<StreamEvent, { type: "stream_error" }>,
  ) => void | Promise<void>;
};

export function emitStreamStatus(
  status: AdapterStreamStatus,
  stdout: NodeJS.WriteStream = process.stdout,
  validate = true,
): void {
  const payload = validate ? AdapterStreamStatusSchema.parse(status) : status;
  writeJSONLine(stdout, payload);
}

export async function handleStream(opts: {
  ctx: AdapterContext;
  handlers: StreamHandlers;
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WriteStream;
  validate?: boolean;
}): Promise<void> {
  const stdin = opts.stdin ?? process.stdin;
  const stdout = opts.stdout ?? process.stdout;
  const validate = opts.validate ?? true;
  const ctx = opts.ctx;
  const handlers = opts.handlers;

  const dispatchError = async (log: AdapterLogger, message: string) => {
    log.error("%s", message);
    emitStreamStatus({ type: "delivery_error", error: message }, stdout, validate);
  };

  for await (const raw of readJSONLines(stdin)) {
    if (ctx.signal.aborted) {
      ctx.log.info("stream shutting down (signal aborted)");
      return;
    }

    let event: StreamEvent;
    try {
      event = validate ? StreamEventSchema.parse(raw) : (raw as StreamEvent);
    } catch (err) {
      await dispatchError(ctx.log, `stream: failed to parse event: ${errorToString(err)}`);
      continue;
    }

    try {
      switch (event.type) {
        case "stream_start":
          if (handlers.onStart) {
            await handlers.onStart(ctx, event);
          }
          break;
        case "token":
          if (handlers.onToken) {
            await handlers.onToken(ctx, event);
          }
          break;
        case "tool_status":
          if (handlers.onToolStatus) {
            await handlers.onToolStatus(ctx, event);
          }
          break;
        case "reasoning":
          if (handlers.onReasoning) {
            await handlers.onReasoning(ctx, event);
          }
          break;
        case "stream_end":
          if (handlers.onEnd) {
            await handlers.onEnd(ctx, event);
          }
          break;
        case "stream_error":
          if (handlers.onError) {
            await handlers.onError(ctx, event);
          }
          break;
        default:
          ctx.log.debug("stream: unknown event type: %s", (event as { type: string }).type);
      }
    } catch (err) {
      await dispatchError(ctx.log, `stream handler error for ${event.type}: ${errorToString(err)}`);
    }
  }
}

function errorToString(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}


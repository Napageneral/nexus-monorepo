import { readJSONLines, writeJSONLine } from "./io.js";
import {
  AdapterServeEndpointSchema,
  AdapterServeInputFrameSchema,
  AdapterServeInvokeCancelFrameSchema,
  AdapterServeInvokeErrorSchema,
  AdapterServeInvokeRequestFrameSchema,
  AdapterServeOutputFrameSchema,
  type AdapterServeEndpoint,
  type AdapterServeInputFrame,
  type AdapterServeInvokeCancelFrame,
  type AdapterServeInvokeError,
  type AdapterServeRecordIngestFrame,
  type AdapterServeInvokeRequestFrame,
  type AdapterServeOutputFrame,
} from "./protocol.js";

type ServeSessionLogger = {
  warn?: (message: string, ...args: unknown[]) => void;
  info?: (message: string, ...args: unknown[]) => void;
};

export type AdapterServeInvokeReply = {
  ok: boolean;
  payload?: unknown;
  error?: AdapterServeInvokeError | string | null;
};

export type AdapterServeHandlers = {
  onInvoke?: (
    frame: AdapterServeInvokeRequestFrame,
  ) => AdapterServeInvokeReply | Promise<AdapterServeInvokeReply> | void | Promise<void>;
  onCancel?: (frame: AdapterServeInvokeCancelFrame) => void | Promise<void>;
};

export type AdapterServeSessionOptions = {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WriteStream;
  signal?: AbortSignal;
  validateFrames?: boolean;
  log?: ServeSessionLogger;
};

export class AdapterServeEndpointRegistry {
  private readonly endpoints = new Map<string, AdapterServeEndpoint>();
  private readonly session: AdapterServeSession;

  constructor(session: AdapterServeSession) {
    this.session = session;
  }

  async upsert(endpoint: AdapterServeEndpoint): Promise<void> {
    const parsed = AdapterServeEndpointSchema.parse(endpoint);
    this.endpoints.set(parsed.endpoint_id, { ...parsed });
    await this.session.upsertEndpoint(parsed);
  }

  async remove(endpointId: string): Promise<void> {
    const parsed = endpointId.trim();
    if (!parsed) {
      throw new Error("endpointId is required");
    }
    this.endpoints.delete(parsed);
    await this.session.removeEndpoint(parsed);
  }

  get(endpointId: string): AdapterServeEndpoint | undefined {
    const parsed = endpointId.trim();
    if (!parsed) {
      return undefined;
    }
    const value = this.endpoints.get(parsed);
    return value ? { ...value } : undefined;
  }

  list(): AdapterServeEndpoint[] {
    return [...this.endpoints.values()]
      .map((value) => ({ ...value }))
      .toSorted((a, b) => a.endpoint_id.localeCompare(b.endpoint_id));
  }
}

export class AdapterServeSession {
  private readonly stdin: NodeJS.ReadableStream;
  private readonly stdout: NodeJS.WriteStream;
  private readonly signal?: AbortSignal;
  private readonly validateFrames: boolean;
  private readonly log?: ServeSessionLogger;

  constructor(opts: AdapterServeSessionOptions) {
    this.stdin = opts.stdin;
    this.stdout = opts.stdout;
    this.signal = opts.signal;
    this.validateFrames = opts.validateFrames ?? true;
    this.log = opts.log;
  }

  createEndpointRegistry(): AdapterServeEndpointRegistry {
    return new AdapterServeEndpointRegistry(this);
  }

  async send(frame: AdapterServeOutputFrame): Promise<void> {
    const payload = this.validateFrames ? AdapterServeOutputFrameSchema.parse(frame) : frame;
    writeJSONLine(this.stdout, payload);
  }

  async upsertEndpoint(endpoint: AdapterServeEndpoint): Promise<void> {
    await this.send({
      type: "endpoint.upsert",
      endpoint_id: endpoint.endpoint_id,
      display_name: endpoint.display_name,
      platform: endpoint.platform,
      caps: endpoint.caps,
      commands: endpoint.commands,
      permissions: endpoint.permissions,
    });
  }

  async removeEndpoint(endpointId: string): Promise<void> {
    const parsed = endpointId.trim();
    if (!parsed) {
      throw new Error("endpointId is required");
    }
    await this.send({
      type: "endpoint.remove",
      endpoint_id: parsed,
    });
  }

  async emitRecordIngest(record: Record<string, unknown>): Promise<void> {
    const frame: AdapterServeRecordIngestFrame = {
      type: "record.ingest",
      record,
    };
    await this.send(frame);
  }

  async respondInvokeResult(params: {
    request_id: string;
    ok: boolean;
    payload?: unknown;
    error?: AdapterServeInvokeError | string | null;
  }): Promise<void> {
    const requestID = params.request_id.trim();
    if (!requestID) {
      throw new Error("request_id is required");
    }
    const frame: AdapterServeOutputFrame = {
      type: "invoke.result",
      request_id: requestID,
      ok: params.ok === true,
      payload: params.payload,
      error: normalizeInvokeError(params.error),
    };
    await this.send(frame);
  }

  async serve(handlers: AdapterServeHandlers): Promise<void> {
    for await (const raw of readJSONLines(this.stdin)) {
      if (this.signal?.aborted) {
        return;
      }
      const frame = this.parseInputFrame(raw);
      if (!frame) {
        continue;
      }
      if (frame.type === "invoke.cancel") {
        await handlers.onCancel?.(frame);
        continue;
      }
      if (frame.type === "invoke.request") {
        if (!handlers.onInvoke) {
          continue;
        }
        try {
          const result = await handlers.onInvoke(frame);
          if (result === undefined) {
            continue;
          }
          await this.respondInvokeResult({
            request_id: frame.request_id,
            ok: result.ok,
            payload: result.payload,
            error: result.error,
          });
        } catch (error) {
          await this.respondInvokeResult({
            request_id: frame.request_id,
            ok: false,
            error: { message: errorToString(error) },
          });
        }
      }
    }
  }

  private parseInputFrame(raw: unknown): AdapterServeInputFrame | null {
    if (!this.validateFrames) {
      const candidate = raw as AdapterServeInputFrame;
      if (
        candidate &&
        typeof candidate === "object" &&
        "type" in candidate &&
        (candidate.type === "invoke.request" || candidate.type === "invoke.cancel")
      ) {
        return candidate;
      }
      logServeWarning(this.log, "serve session ignored malformed frame");
      return null;
    }
    try {
      return AdapterServeInputFrameSchema.parse(raw);
    } catch (error) {
      logServeWarning(this.log, `serve session ignored malformed frame: ${errorToString(error)}`);
      return null;
    }
  }
}

export function createAdapterServeSession(opts: AdapterServeSessionOptions): AdapterServeSession {
  return new AdapterServeSession(opts);
}

function normalizeInvokeError(
  value: AdapterServeInvokeError | string | null | undefined,
): AdapterServeInvokeError | string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  return AdapterServeInvokeErrorSchema.parse(value);
}

function errorToString(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function logServeWarning(log: ServeSessionLogger | undefined, message: string): void {
  if (!log) {
    return;
  }
  if (typeof log.warn === "function") {
    log.warn(message);
    return;
  }
  log.info?.(message);
}

export {
  AdapterServeInvokeRequestFrameSchema,
  AdapterServeInvokeCancelFrameSchema,
  AdapterServeInputFrameSchema,
  AdapterServeOutputFrameSchema,
};

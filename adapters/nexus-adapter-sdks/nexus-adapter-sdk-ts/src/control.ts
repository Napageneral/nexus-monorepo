import { readJSONLines, writeJSONLine } from "./io.js";
import {
  AdapterControlEndpointSchema,
  AdapterControlInputFrameSchema,
  AdapterControlInvokeCancelFrameSchema,
  AdapterControlInvokeErrorSchema,
  AdapterControlInvokeRequestFrameSchema,
  AdapterControlOutputFrameSchema,
  type AdapterControlEndpoint,
  type AdapterControlInputFrame,
  type AdapterControlInvokeCancelFrame,
  type AdapterControlInvokeError,
  type AdapterControlRecordIngestFrame,
  type AdapterControlInvokeRequestFrame,
  type AdapterControlOutputFrame,
} from "./protocol.js";

type ControlSessionLogger = {
  warn?: (message: string, ...args: unknown[]) => void;
  info?: (message: string, ...args: unknown[]) => void;
};

export type AdapterControlInvokeReply = {
  ok: boolean;
  payload?: unknown;
  error?: AdapterControlInvokeError | string | null;
};

export type AdapterControlServeHandlers = {
  onInvoke?: (
    frame: AdapterControlInvokeRequestFrame,
  ) => AdapterControlInvokeReply | Promise<AdapterControlInvokeReply> | void | Promise<void>;
  onCancel?: (frame: AdapterControlInvokeCancelFrame) => void | Promise<void>;
};

export type AdapterControlSessionOptions = {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WriteStream;
  signal?: AbortSignal;
  validateFrames?: boolean;
  log?: ControlSessionLogger;
};

export class AdapterControlEndpointRegistry {
  private readonly endpoints = new Map<string, AdapterControlEndpoint>();
  private readonly session: AdapterControlSession;

  constructor(session: AdapterControlSession) {
    this.session = session;
  }

  async upsert(endpoint: AdapterControlEndpoint): Promise<void> {
    const parsed = AdapterControlEndpointSchema.parse(endpoint);
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

  get(endpointId: string): AdapterControlEndpoint | undefined {
    const parsed = endpointId.trim();
    if (!parsed) {
      return undefined;
    }
    const value = this.endpoints.get(parsed);
    return value ? { ...value } : undefined;
  }

  list(): AdapterControlEndpoint[] {
    return [...this.endpoints.values()]
      .map((value) => ({ ...value }))
      .toSorted((a, b) => a.endpoint_id.localeCompare(b.endpoint_id));
  }
}

export class AdapterControlSession {
  private readonly stdin: NodeJS.ReadableStream;
  private readonly stdout: NodeJS.WriteStream;
  private readonly signal?: AbortSignal;
  private readonly validateFrames: boolean;
  private readonly log?: ControlSessionLogger;

  constructor(opts: AdapterControlSessionOptions) {
    this.stdin = opts.stdin;
    this.stdout = opts.stdout;
    this.signal = opts.signal;
    this.validateFrames = opts.validateFrames ?? true;
    this.log = opts.log;
  }

  createEndpointRegistry(): AdapterControlEndpointRegistry {
    return new AdapterControlEndpointRegistry(this);
  }

  async send(frame: AdapterControlOutputFrame): Promise<void> {
    const payload = this.validateFrames ? AdapterControlOutputFrameSchema.parse(frame) : frame;
    writeJSONLine(this.stdout, payload);
  }

  async upsertEndpoint(endpoint: AdapterControlEndpoint): Promise<void> {
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
    const frame: AdapterControlRecordIngestFrame = {
      type: "record.ingest",
      record,
    };
    await this.send(frame);
  }

  async respondInvokeResult(params: {
    request_id: string;
    ok: boolean;
    payload?: unknown;
    error?: AdapterControlInvokeError | string | null;
  }): Promise<void> {
    const requestID = params.request_id.trim();
    if (!requestID) {
      throw new Error("request_id is required");
    }
    const frame: AdapterControlOutputFrame = {
      type: "invoke.result",
      request_id: requestID,
      ok: params.ok === true,
      payload: params.payload,
      error: normalizeInvokeError(params.error),
    };
    await this.send(frame);
  }

  async serve(handlers: AdapterControlServeHandlers): Promise<void> {
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

  private parseInputFrame(raw: unknown): AdapterControlInputFrame | null {
    if (!this.validateFrames) {
      const candidate = raw as AdapterControlInputFrame;
      if (
        candidate &&
        typeof candidate === "object" &&
        "type" in candidate &&
        (candidate.type === "invoke.request" || candidate.type === "invoke.cancel")
      ) {
        return candidate;
      }
      logControlWarning(this.log, "control session ignored malformed frame");
      return null;
    }
    try {
      return AdapterControlInputFrameSchema.parse(raw);
    } catch (error) {
      logControlWarning(this.log, `control session ignored malformed frame: ${errorToString(error)}`);
      return null;
    }
  }
}

export function createAdapterControlSession(opts: AdapterControlSessionOptions): AdapterControlSession {
  return new AdapterControlSession(opts);
}

function normalizeInvokeError(
  value: AdapterControlInvokeError | string | null | undefined,
): AdapterControlInvokeError | string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  return AdapterControlInvokeErrorSchema.parse(value);
}

function errorToString(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function logControlWarning(log: ControlSessionLogger | undefined, message: string): void {
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
  AdapterControlInvokeRequestFrameSchema,
  AdapterControlInvokeCancelFrameSchema,
  AdapterControlInputFrameSchema,
  AdapterControlOutputFrameSchema,
};

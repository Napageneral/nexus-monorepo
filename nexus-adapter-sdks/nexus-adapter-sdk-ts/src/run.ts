import { createAdapterLogger, patchConsoleToStderr, type AdapterLogger } from "./logger.js";
import { writeJSONLine } from "./io.js";
import {
  AdapterAccountSchema,
  AdapterHealthSchema,
  AdapterInfoSchema,
  DeliveryResultSchema,
  NexusEventSchema,
  SendRequestSchema,
  type AdapterAccount,
  type AdapterHealth,
  type AdapterInfo,
  type DeliveryResult,
  type NexusEvent,
  type SendRequest,
} from "./protocol.js";
import {
  loadAdapterRuntimeContext,
  requireAdapterRuntimeContext,
  type AdapterRuntimeContext,
} from "./runtime-context.js";
import { handleStream, type StreamHandlers } from "./stream.js";

export type AdapterContext = {
  signal: AbortSignal;
  runtime: AdapterRuntimeContext | null;
  log: AdapterLogger;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
};

export type AdapterDefinition = {
  info: () => AdapterInfo | Promise<AdapterInfo>;
  monitor?: (ctx: AdapterContext, args: { account: string }, emit: (e: NexusEvent) => void) => void | Promise<void>;
  backfill?: (
    ctx: AdapterContext,
    args: { account: string; since: Date },
    emit: (e: NexusEvent) => void,
  ) => void | Promise<void>;
  send?: (ctx: AdapterContext, req: SendRequest) => DeliveryResult | Promise<DeliveryResult>;
  health?: (ctx: AdapterContext, args: { account: string }) => AdapterHealth | Promise<AdapterHealth>;
  accounts?: (ctx: AdapterContext) => AdapterAccount[] | Promise<AdapterAccount[]>;
  stream?: StreamHandlers;
};

export type RunAdapterOptions = {
  argv?: string[];
  env?: NodeJS.ProcessEnv;
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WriteStream;
  stderr?: NodeJS.WriteStream;
  requireRuntimeContext?: boolean;
  validateOutput?: boolean;
  patchConsole?: boolean;
  installSignalHandlers?: boolean;
};

export async function runAdapter(adapter: AdapterDefinition, opts: RunAdapterOptions = {}): Promise<number> {
  const argv = opts.argv ?? process.argv;
  const env = opts.env ?? process.env;
  const stdin = opts.stdin ?? process.stdin;
  const stdout = opts.stdout ?? process.stdout;
  const stderr = opts.stderr ?? process.stderr;
  const requireRuntimeContext = opts.requireRuntimeContext ?? true;
  const validateOutput = opts.validateOutput ?? true;
  const doPatchConsole = opts.patchConsole ?? true;
  const installSignalHandlers = opts.installSignalHandlers ?? true;

  const command = String(argv[2] ?? "").trim();
  const args = argv.slice(3);

  const verbose = args.includes("--verbose") || args.includes("-v");
  const log = createAdapterLogger({ verbose, stderr });

  if (doPatchConsole) {
    patchConsoleToStderr(log);
  }

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage(argv[1] ?? "adapter", stderr);
    return command ? 0 : 1;
  }

  // Filter out global flags from args passed to subcommands.
  const filteredArgs = args.filter((a) => a !== "--verbose" && a !== "-v");

  const controller = new AbortController();
  if (installSignalHandlers) {
    const onSignal = () => controller.abort();
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  }

  let runtime: AdapterRuntimeContext | null = null;
  if (command !== "info") {
    try {
      runtime = requireRuntimeContext ? requireAdapterRuntimeContext(env) : loadAdapterRuntimeContext(env);
    } catch (err) {
      log.error("%s", errorToString(err));
      return 1;
    }
  }

  const ctx: AdapterContext = {
    signal: controller.signal,
    runtime,
    log,
    stdout,
    stderr,
  };

  try {
    switch (command) {
      case "info": {
        const info = await adapter.info();
        writeJSONLine(stdout, validateOutput ? AdapterInfoSchema.parse(info) : info);
        return 0;
      }
      case "monitor": {
        if (!adapter.monitor) {
          throw new Error("monitor not supported by this adapter");
        }
        const account = requireFlag(filteredArgs, "--account");
        const emit = (event: NexusEvent) => {
          const payload = validateOutput ? NexusEventSchema.parse(event) : event;
          writeJSONLine(stdout, payload);
        };
        ctx.log.info("monitor starting for account %s", JSON.stringify(account));
        await adapter.monitor(ctx, { account }, emit);
        ctx.log.info("monitor stopped cleanly");
        return 0;
      }
      case "backfill": {
        if (!adapter.backfill) {
          throw new Error("backfill not supported by this adapter");
        }
        const account = requireFlag(filteredArgs, "--account");
        const sinceRaw = requireFlag(filteredArgs, "--since");
        const since = parseDate(sinceRaw);
        const emit = (event: NexusEvent) => {
          const payload = validateOutput ? NexusEventSchema.parse(event) : event;
          writeJSONLine(stdout, payload);
        };
        ctx.log.info(
          "backfill starting for account %s since %s",
          JSON.stringify(account),
          since.toISOString(),
        );
        await adapter.backfill(ctx, { account, since }, emit);
        ctx.log.info("backfill completed");
        return 0;
      }
      case "send": {
        if (!adapter.send) {
          throw new Error("send not supported by this adapter");
        }
        const account = requireFlag(filteredArgs, "--account");
        const to = requireFlag(filteredArgs, "--to");
        const text = readFlag(filteredArgs, "--text");
        const media = readFlag(filteredArgs, "--media");
        const caption = readFlag(filteredArgs, "--caption");
        const replyTo = readFlag(filteredArgs, "--reply-to");
        const threadID = readFlag(filteredArgs, "--thread");

        if (!text && !media) {
          throw new Error("send requires --text or --media");
        }
        if (text && media) {
          throw new Error("send must not specify both --text and --media");
        }
        if (caption && !media) {
          throw new Error("send --caption requires --media");
        }

        const req: SendRequest = {
          account,
          to,
          ...(text ? { text } : {}),
          ...(media ? { media } : {}),
          ...(caption ? { caption } : {}),
          ...(replyTo ? { reply_to_id: replyTo } : {}),
          ...(threadID ? { thread_id: threadID } : {}),
        };
        const parsedReq = validateOutput ? SendRequestSchema.parse(req) : req;

        try {
          const result = await adapter.send(ctx, parsedReq);
          writeJSONLine(stdout, validateOutput ? DeliveryResultSchema.parse(result) : result);
          return 0;
        } catch (err) {
          const failure: DeliveryResult = {
            success: false,
            message_ids: [],
            chunks_sent: 0,
            error: {
              type: "unknown",
              message: errorToString(err),
              retry: false,
            },
          };
          writeJSONLine(stdout, validateOutput ? DeliveryResultSchema.parse(failure) : failure);
          return 0;
        }
      }
      case "health": {
        if (!adapter.health) {
          throw new Error("health not supported by this adapter");
        }
        const account = requireFlag(filteredArgs, "--account");
        try {
          const health = await adapter.health(ctx, { account });
          writeJSONLine(stdout, validateOutput ? AdapterHealthSchema.parse(health) : health);
          return 0;
        } catch (err) {
          const health: AdapterHealth = {
            connected: false,
            account,
            error: errorToString(err),
          };
          writeJSONLine(stdout, validateOutput ? AdapterHealthSchema.parse(health) : health);
          return 0;
        }
      }
      case "accounts": {
        if (!adapter.accounts) {
          throw new Error("accounts not supported by this adapter");
        }

        const subcmd = readSubcommand(filteredArgs) ?? "list";
        switch (subcmd) {
          case "list": {
            const accounts = await adapter.accounts(ctx);
            const payload = validateOutput ? zArray(AdapterAccountSchema).parse(accounts) : accounts;
            writeJSONLine(stdout, payload);
            return 0;
          }
          default:
            throw new Error(`unknown accounts subcommand: ${subcmd} (expected: list)`);
        }
      }
      case "stream": {
        if (!adapter.stream) {
          throw new Error("stream not supported by this adapter");
        }
        // `--account` is part of the protocol, but stream_start.target carries the canonical account_id.
        // We still parse/validate it to keep the CLI contract consistent.
        void requireFlag(filteredArgs, "--account");
        ctx.log.info("stream handler starting");
        await handleStream({ ctx, handlers: adapter.stream, stdin, stdout, validate: validateOutput });
        ctx.log.info("stream handler stopped cleanly");
        return 0;
      }
      default:
        stderr.write(`unknown command: ${command}\n`);
        printUsage(argv[1] ?? "adapter", stderr);
        return 1;
    }
  } catch (err) {
    log.error("%s", errorToString(err));
    return 1;
  }
}

function printUsage(name: string, stderr: NodeJS.WriteStream): void {
  stderr.write(`Usage: ${name} <command> [flags]\n\n`);
  stderr.write("Commands:\n");
  stderr.write("  info                              Self-describe this adapter\n");
  stderr.write("  monitor  --account <id>           Stream live events (JSONL)\n");
  stderr.write("  send     --account <id> --to <target> --text \"...\"\n");
  stderr.write("  backfill --account <id> --since <date>\n");
  stderr.write("  health   --account <id>           Check connection status\n");
  stderr.write("  accounts list                     List configured accounts\n");
  stderr.write("  stream   --account <id>           Streaming delivery (stdin/stdout)\n\n");
  stderr.write("Global flags:\n");
  stderr.write("  --verbose, -v                     Enable debug logging\n");
}

function readFlag(args: string[], name: string): string | undefined {
  // Support both: --flag value and --flag=value
  const eqPrefix = `${name}=`;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === name) {
      const v = args[i + 1];
      return typeof v === "string" ? v : undefined;
    }
    if (a.startsWith(eqPrefix)) {
      return a.slice(eqPrefix.length);
    }
  }
  return undefined;
}

function requireFlag(args: string[], name: string): string {
  const v = readFlag(args, name);
  if (!v || !v.trim()) {
    throw new Error(`Missing required flag: ${name}`);
  }
  return v;
}

function readSubcommand(args: string[]): string | undefined {
  for (const a of args) {
    if (!a) {
      continue;
    }
    if (a.startsWith("-")) {
      continue;
    }
    return a;
  }
  return undefined;
}

function parseDate(s: string): Date {
  const trimmed = s.trim();
  if (!trimmed) {
    throw new Error("date is required");
  }

  // Try common formats (mirrors Go SDK behavior).
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed);
  }

  // YYYY-MM-DD (Date.parse handles this in most runtimes, but keep explicit).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(trimmed);
  if (m) {
    return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  }

  throw new Error("unrecognized date format (expected ISO 8601 or YYYY-MM-DD)");
}

function errorToString(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function zArray<T>(schema: { parse: (value: unknown) => T }): { parse: (value: unknown) => T[] } {
  return {
    parse: (value: unknown) => {
      if (!Array.isArray(value)) {
        throw new Error("expected array");
      }
      return value.map((v) => schema.parse(v));
    },
  };
}

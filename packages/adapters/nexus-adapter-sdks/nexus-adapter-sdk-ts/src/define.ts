import type {
  AdapterConnectionIdentity,
  AdapterAuthManifest,
  AdapterHealth,
  AdapterInboundRecord,
  AdapterInfo,
  AdapterMethod,
  AdapterMethodCatalog,
  AdapterMethodContextHints,
  AdapterOperation,
  AdapterSetupResult,
  ChannelCapabilities,
} from "./protocol.js";
import type {
  AdapterContext,
  AdapterDefinition,
  AdapterMethodInvokeRequest,
  AdapterOperations,
  AdapterSetupRequest,
} from "./run.js";

type MaybePromise<T> = T | Promise<T>;

export type DefinedAdapterContext<TClient> = AdapterContext & {
  connectionId?: string;
  client: TClient | undefined;
};

export type DeclaredAdapterMethod<TClient> = {
  description?: string | null;
  action?: "read" | "write";
  params?: Record<string, unknown> | null;
  response?: Record<string, unknown> | null;
  connection_required?: boolean;
  mutates_remote?: boolean;
  context_hints?: AdapterMethodContextHints;
  handler: (
    ctx: DefinedAdapterContext<TClient>,
    req: AdapterMethodInvokeRequest,
  ) => MaybePromise<unknown>;
};

export type DefineAdapterConfig<TClient> = {
  platform: string;
  name: string;
  version: string;
  multi_account?: boolean;
  credential_service?: string;
  auth?: AdapterAuthManifest;
  capabilities: ChannelCapabilities;
  methodCatalog?: AdapterMethodCatalog;
  client?: {
    create?: (args: { ctx: AdapterContext; connectionId?: string }) => MaybePromise<TClient>;
  };
  connection?: {
    connections?: (ctx: DefinedAdapterContext<TClient>) => MaybePromise<AdapterConnectionIdentity[]>;
    health?: (ctx: DefinedAdapterContext<TClient>) => MaybePromise<Omit<AdapterHealth, "connection_id">>;
  };
  ingest?: {
    monitor?: (
      ctx: DefinedAdapterContext<TClient>,
      emit: (record: AdapterInboundRecord) => void,
    ) => MaybePromise<void>;
    backfill?: (
      ctx: DefinedAdapterContext<TClient>,
      args: { since: Date },
      emit: (record: AdapterInboundRecord) => void,
    ) => MaybePromise<void>;
  };
  setup?: {
    start?: (
      ctx: DefinedAdapterContext<TClient>,
      req: AdapterSetupRequest,
    ) => MaybePromise<AdapterSetupResult>;
    submit?: (
      ctx: DefinedAdapterContext<TClient>,
      req: AdapterSetupRequest,
    ) => MaybePromise<AdapterSetupResult>;
    status?: (
      ctx: DefinedAdapterContext<TClient>,
      req: AdapterSetupRequest,
    ) => MaybePromise<AdapterSetupResult>;
    cancel?: (
      ctx: DefinedAdapterContext<TClient>,
      req: AdapterSetupRequest,
    ) => MaybePromise<AdapterSetupResult>;
  };
  serve?: AdapterOperations["adapter.serve.start"];
  methods?: Record<string, DeclaredAdapterMethod<TClient>>;
};

export function method<TClient>(
  declaration: DeclaredAdapterMethod<TClient>,
): DeclaredAdapterMethod<TClient> {
  return declaration;
}

export function defineAdapter<TClient = unknown>(
  config: DefineAdapterConfig<TClient>,
): AdapterDefinition {
  const methodDefinitions = config.methods ?? {};

  const operations: AdapterOperations = {
    "adapter.info": async () => buildAdapterInfo(config, methodDefinitions),
    "adapter.connections.list": async (ctx) => {
      const definedCtx = await createDefinedContext(config, ctx, ctx.runtime?.connection_id);
      if (config.connection?.connections) {
        return await config.connection.connections(definedCtx);
      }
      return defaultConnections(ctx);
    },
    "adapter.health": async (ctx, args) => {
      const definedCtx = await createDefinedContext(config, ctx, args.connection_id);
      if (config.connection?.health) {
        const result = await config.connection.health(definedCtx);
        return {
          ...result,
          connection_id: args.connection_id,
        };
      }
      return {
        connected: true,
        connection_id: args.connection_id,
      };
    },
    methods: buildMethodHandlers(config, methodDefinitions),
  };

  if (config.ingest?.monitor) {
    operations["adapter.monitor.start"] = async (ctx, args, emit) => {
      const definedCtx = await createDefinedContext(config, ctx, args.connection_id);
      await config.ingest!.monitor!(definedCtx, emit);
    };
  }

  if (config.ingest?.backfill) {
    operations["records.backfill"] = async (ctx, args, emit) => {
      const definedCtx = await createDefinedContext(config, ctx, args.connection_id);
      await config.ingest!.backfill!(definedCtx, { since: args.since }, emit);
    };
  }

  if (config.setup?.start) {
    operations["adapter.setup.start"] = async (ctx, req) => {
      const definedCtx = await createDefinedContext(config, ctx, req.connection_id);
      return await config.setup!.start!(definedCtx, req);
    };
  }
  if (config.setup?.submit) {
    operations["adapter.setup.submit"] = async (ctx, req) => {
      const definedCtx = await createDefinedContext(config, ctx, req.connection_id);
      return await config.setup!.submit!(definedCtx, req);
    };
  }
  if (config.setup?.status) {
    operations["adapter.setup.status"] = async (ctx, req) => {
      const definedCtx = await createDefinedContext(config, ctx, req.connection_id);
      return await config.setup!.status!(definedCtx, req);
    };
  }
  if (config.setup?.cancel) {
    operations["adapter.setup.cancel"] = async (ctx, req) => {
      const definedCtx = await createDefinedContext(config, ctx, req.connection_id);
      return await config.setup!.cancel!(definedCtx, req);
    };
  }

  if (config.serve) {
    operations["adapter.serve.start"] = config.serve;
  }

  return { operations };
}

async function createDefinedContext<TClient>(
  config: DefineAdapterConfig<TClient>,
  ctx: AdapterContext,
  connectionId?: string,
): Promise<DefinedAdapterContext<TClient>> {
  const client = config.client?.create ? await config.client.create({ ctx, connectionId }) : undefined;
  return {
    ...ctx,
    connectionId,
    client,
  };
}

function defaultConnections(ctx: AdapterContext): AdapterConnectionIdentity[] {
  const connectionId = ctx.runtime?.connection_id?.trim();
  if (!connectionId) {
    return [];
  }
  return [
    {
      id: connectionId,
      status: "ready",
      ...(ctx.runtime?.credential?.ref ? { credential_ref: ctx.runtime.credential.ref } : {}),
    },
  ];
}

function buildMethodHandlers<TClient>(
  config: DefineAdapterConfig<TClient>,
  methods: Record<string, DeclaredAdapterMethod<TClient>>,
): AdapterOperations["methods"] {
  if (Object.keys(methods).length === 0) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(methods).map(([name, declaration]) => [
      name,
      async (ctx: AdapterContext, req: AdapterMethodInvokeRequest) => {
        const definedCtx = await createDefinedContext(config, ctx, req.connection_id);
        return await declaration.handler(definedCtx, req);
      },
    ]),
  );
}

function buildAdapterInfo<TClient>(
  config: DefineAdapterConfig<TClient>,
  methods: Record<string, DeclaredAdapterMethod<TClient>>,
): AdapterInfo {
  const operations: AdapterOperation[] = [
    "adapter.info",
    "adapter.connections.list",
    "adapter.health",
    ...(config.ingest?.monitor ? (["adapter.monitor.start"] as const) : []),
    ...(config.ingest?.backfill ? (["records.backfill"] as const) : []),
    ...(config.setup?.start ? (["adapter.setup.start"] as const) : []),
    ...(config.setup?.submit ? (["adapter.setup.submit"] as const) : []),
    ...(config.setup?.status ? (["adapter.setup.status"] as const) : []),
    ...(config.setup?.cancel ? (["adapter.setup.cancel"] as const) : []),
    ...(config.serve ? (["adapter.serve.start"] as const) : []),
  ];

  const methodDescriptors = Object.entries(methods).map(([name, declaration]) =>
    buildMethodDescriptor(config, name, declaration),
  );

  return {
    platform: config.platform,
    name: config.name,
    version: config.version,
    operations,
    methods: methodDescriptors,
    ...(config.credential_service ? { credential_service: config.credential_service } : {}),
    multi_account: config.multi_account ?? false,
    platform_capabilities: config.capabilities,
    ...(config.auth ? { auth: config.auth } : {}),
    ...(methodDescriptors.length > 0
      ? {
          methodCatalog: config.methodCatalog ?? {
            source: "manifest",
            namespace: config.platform,
          },
        }
      : config.methodCatalog
        ? { methodCatalog: config.methodCatalog }
        : {}),
  };
}

function buildMethodDescriptor<TClient>(
  config: DefineAdapterConfig<TClient>,
  name: string,
  declaration: DeclaredAdapterMethod<TClient>,
): AdapterMethod {
  return {
    name,
    ...(declaration.description !== undefined ? { description: declaration.description } : {}),
    ...(declaration.action ? { action: declaration.action } : {}),
    ...(declaration.params ? { params: declaration.params } : {}),
    ...(declaration.response ? { response: declaration.response } : {}),
    connection_required: declaration.connection_required ?? true,
    mutates_remote:
      typeof declaration.mutates_remote === "boolean"
        ? declaration.mutates_remote
        : declaration.action === "write",
    context_hints: declaration.context_hints ?? { params: {} },
    origin: {
      package_kind: "adapter",
      package_id: config.platform,
      package_version: config.version,
      declaration_mode: "manifest",
      declaration_source: "package declaration",
      namespace: config.platform,
    },
  } as AdapterMethod;
}

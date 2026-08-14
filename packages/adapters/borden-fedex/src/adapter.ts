import {
  type AdapterBackfillWindow,
  type AdapterContext,
  type AdapterHealth,
  type AdapterInboundRecord,
  defineAdapter,
} from "@nexus-project/adapter-sdk-ts";

type UnknownRecord = Record<string, unknown>;

type BordenFedexRuntimeConfig = {
  account_id: string;
  account_label: string;
  source_contract: string;
  source_custody_ref: string;
};

type RuntimeContextLike = Pick<AdapterContext, "runtime" | "signal"> & {
  connectionId?: string;
};

const PLATFORM = "fedex_billing_online";
const SERVICE = "fedex-billing-online";
const CONFIRMATION = "REGISTER_BORDEN_FEDEX_EXTERNAL_CAPTURE_READ_ONLY";
const ACCOUNT_ID = /^[a-z0-9][a-z0-9._-]{1,127}$/;

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as UnknownRecord;
}

function textValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function requireText(payload: UnknownRecord, name: string, maxLength = 256): string {
  const value = textValue(payload[name]);
  if (!value || value.length > maxLength || /[\r\n]/.test(value)) {
    throw new Error(`Borden FedEx setup requires ${name}`);
  }
  return value;
}

function setupFields() {
  return [
    {
      name: "account_id",
      label: "Stable Borden FedEx account id",
      type: "text" as const,
      required: true,
    },
    {
      name: "account_label",
      label: "Account label",
      type: "text" as const,
      required: true,
    },
    {
      name: "source_custody_ref",
      label: "Private external source custody reference",
      type: "text" as const,
      required: true,
    },
    {
      name: "confirm_read_only_source",
      label: "Confirm external read-only source",
      type: "select" as const,
      required: true,
      options: [{ label: "Register read-only source", value: CONFIRMATION }],
    },
  ];
}

function setupConfig(payloadValue: unknown): BordenFedexRuntimeConfig {
  const payload = asRecord(payloadValue);
  const allowed = new Set([
    "account_id",
    "account_label",
    "source_custody_ref",
    "confirm_read_only_source",
  ]);
  const unexpected = Object.keys(payload).filter((name) => !allowed.has(name));
  if (unexpected.length > 0) {
    throw new Error(`Borden FedEx setup contains unexpected fields: ${unexpected.join(",")}`);
  }
  if (payload.confirm_read_only_source !== CONFIRMATION) {
    throw new Error("Borden FedEx read-only confirmation is invalid");
  }
  const accountId = requireText(payload, "account_id", 128).toLowerCase();
  if (!ACCOUNT_ID.test(accountId)) throw new Error("Borden FedEx account_id is invalid");
  const sourceCustodyRef = requireText(payload, "source_custody_ref", 512);
  if (!sourceCustodyRef.startsWith("private://borden-fedex/")) {
    throw new Error("Borden FedEx source_custody_ref is invalid");
  }
  return {
    account_id: accountId,
    account_label: requireText(payload, "account_label", 200),
    source_contract: "moonsleep.borden_fedex_source_capture_receipt.v1",
    source_custody_ref: sourceCustodyRef,
  };
}

function readRuntimeConfig(ctx: RuntimeContextLike): BordenFedexRuntimeConfig {
  const config = asRecord(ctx.runtime?.config);
  const accountId = textValue(config.account_id)?.toLowerCase();
  const accountLabel = textValue(config.account_label);
  const sourceContract = textValue(config.source_contract);
  const sourceCustodyRef = textValue(config.source_custody_ref);
  if (!accountId || !ACCOUNT_ID.test(accountId) || !accountLabel || !sourceContract || !sourceCustodyRef) {
    throw new Error("Borden FedEx adapter configuration is invalid");
  }
  return {
    account_id: accountId,
    account_label: accountLabel,
    source_contract: sourceContract,
    source_custody_ref: sourceCustodyRef,
  };
}

function connectionId(ctx: RuntimeContextLike, config: BordenFedexRuntimeConfig): string {
  return textValue(ctx.connectionId) ?? textValue(ctx.runtime?.connection_id) ?? config.account_id;
}

function health(config: BordenFedexRuntimeConfig): Omit<AdapterHealth, "connection_id"> {
  return {
    connected: true,
    details: {
      adapter: PLATFORM,
      mode: "external_read_only_capture",
      source_contract: config.source_contract,
      source_custody_ref: config.source_custody_ref,
      provider_credentials_received: false,
      provider_write_authority: false,
      source_registration_authority: false,
      dispatch_write_authority: false,
      finance_write_authority: false,
      claims_write_authority: false,
    },
  };
}

async function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolvePromise) => {
    signal.addEventListener("abort", () => resolvePromise(), { once: true });
  });
}

async function backfill(
  _ctx: RuntimeContextLike,
  _args: Omit<AdapterBackfillWindow, "connection_id">,
  _emit: (record: AdapterInboundRecord) => void,
): Promise<void> {}

async function monitor(
  ctx: RuntimeContextLike,
  _emit: (record: AdapterInboundRecord) => void,
): Promise<void> {
  await waitForAbort(ctx.signal);
}

export const __test__ = { health, readRuntimeConfig, setupConfig, setupFields };

export const bordenFedexAdapter = defineAdapter({
  platform: PLATFORM,
  name: "borden-fedex-billing-adapter",
  version: "0.1.0",
  multi_account: true,
  auth: {
    methods: [
      {
        id: "borden_fedex_external_capture",
        type: "custom_flow",
        label: "Register Borden FedEx external capture",
        icon: "browser",
        service: SERVICE,
        fields: setupFields(),
      },
    ],
    setupGuide:
      "Register the existing root-owned Borden FedEx browser collector as an external read-only source. Provider credentials remain in Nex vault custody and are never submitted to this adapter package.",
  },
  capabilities: {
    text_limit: 0,
    supports_markdown: false,
    supports_tables: false,
    supports_code_blocks: false,
    supports_embeds: false,
    supports_threads: false,
    supports_reactions: false,
    supports_polls: false,
    supports_buttons: false,
    supports_edit: false,
    supports_delete: false,
    supports_media: false,
    supports_voice_notes: false,
  },
  connection: {
    connections: async (ctx) => {
      const config = readRuntimeConfig(ctx);
      return [{ id: connectionId(ctx, config), display_name: config.account_label, status: "ready" }];
    },
    health: async (ctx) => health(readRuntimeConfig(ctx)),
  },
  setup: {
    start: async (_ctx, request) => ({
      status: "requires_input",
      ...(request.session_id ? { session_id: request.session_id } : {}),
      ...(request.connection_id ? { connection_id: request.connection_id } : {}),
      service: SERVICE,
      message: "Register the existing Borden FedEx collector as an external read-only source.",
      instructions:
        "Provide only a stable non-secret account id, label, private custody reference, and the explicit read-only confirmation. Do not provide FedEx credentials here.",
      fields: setupFields(),
    }),
    submit: async (_ctx, request) => {
      const config = setupConfig(request.payload);
      return {
        status: "completed",
        ...(request.session_id ? { session_id: request.session_id } : {}),
        connection_id: config.account_id,
        service: SERVICE,
        account: config.account_id,
        account_contact: {
          platform: PLATFORM,
          space_id: config.account_id,
          contact_id: config.account_id,
        },
        message: "Borden FedEx external read-only source registered.",
        metadata: {
          adapter_config: config,
          provider_credentials_received: false,
          provider_write_authority: false,
          source_registration_authority: false,
          dispatch_write_authority: false,
          finance_write_authority: false,
          claims_write_authority: false,
        },
      };
    },
  },
  ingest: { backfill, monitor },
});

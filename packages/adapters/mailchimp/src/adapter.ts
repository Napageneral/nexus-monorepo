import { createHash } from "node:crypto";
import {
  defineAdapter,
  method,
  requireCredential,
  type AdapterBackfillWindow,
  type AdapterContext,
  type AdapterInboundRecord,
  type DefinedAdapterContext,
} from "@nexus-project/adapter-sdk-ts";

type UnknownRecord = Record<string, unknown>;

type MailchimpClient = {
  connectionId: string;
  accountLabel: string;
  marketingApiKey: string;
  transactionalApiKey: string;
  marketingBaseUrl: string;
  transactionalBaseUrl: string;
  fetchFn: typeof fetch;
};

const PLATFORM = "mailchimp";
const DEFAULT_ACCOUNT_LABEL = "MoonSleep Mailchimp";
const DEFAULT_CONNECTION_ID = "moonsleep-mailchimp";
const DEFAULT_MARKETING_DATACENTER = "us20";
const DEFAULT_TRANSACTIONAL_BASE_URL = "https://mandrillapp.com/api/1.0";
const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MONITOR_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_OVERLAP_MS = 72 * 60 * 60 * 1000;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function integerValue(value: unknown, fallback: number, maximum = MAX_PAGE_SIZE): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(parsed)));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as UnknownRecord;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function normalizedEmailHash(value: unknown): string | undefined {
  const email = textValue(value)?.toLowerCase();
  return email ? sha256(email) : undefined;
}

function withoutFields(record: UnknownRecord, fields: readonly string[]): UnknownRecord {
  const copy = { ...record };
  for (const field of fields) delete copy[field];
  return copy;
}

function runtimeConfig(ctx: AdapterContext): UnknownRecord {
  return asRecord(ctx.runtime?.config);
}

function configText(ctx: AdapterContext, name: string): string | undefined {
  return textValue(runtimeConfig(ctx)[name]);
}

function marketingDatacenter(apiKey: string, configured?: string): string {
  if (configured) return configured;
  const suffix = apiKey.match(/-([a-z0-9]+)$/iu)?.[1];
  return suffix ?? DEFAULT_MARKETING_DATACENTER;
}

function buildClient(ctx: AdapterContext, connectionId?: string): MailchimpClient {
  const marketingApiKey = requireCredential(ctx, {
    label: "Mailchimp Marketing API key",
    fields: ["marketing_api_key", "marketingApiKey"],
    env: ["MAILCHIMP_API_KEY"],
  });
  const transactionalApiKey = requireCredential(ctx, {
    label: "Mailchimp Transactional API key",
    fields: ["transactional_api_key", "transactionalApiKey"],
    env: ["MAILCHIMP_TRANSACTIONAL_API_KEY"],
  });
  const datacenter = marketingDatacenter(
    marketingApiKey,
    configText(ctx, "marketing_datacenter"),
  );
  return {
    connectionId: connectionId ?? ctx.runtime?.connection_id ?? DEFAULT_CONNECTION_ID,
    accountLabel: configText(ctx, "account_label") ?? DEFAULT_ACCOUNT_LABEL,
    marketingApiKey,
    transactionalApiKey,
    marketingBaseUrl:
      configText(ctx, "marketing_base_url") ?? `https://${datacenter}.api.mailchimp.com/3.0`,
    transactionalBaseUrl:
      configText(ctx, "transactional_base_url") ?? DEFAULT_TRANSACTIONAL_BASE_URL,
    fetchFn: fetch,
  };
}

async function responseJson(response: Response): Promise<unknown> {
  const body = await response.text();
  const parsed = body ? JSON.parse(body) as unknown : null;
  if (!response.ok) {
    const detail = textValue(asRecord(parsed).detail)
      ?? textValue(asRecord(parsed).message)
      ?? `HTTP ${response.status}`;
    throw new Error(`Mailchimp read failed: ${detail}`);
  }
  return parsed;
}

async function marketingGet(
  client: MailchimpClient,
  path: string,
  query: Record<string, string | number | undefined> = {},
): Promise<unknown> {
  const url = new URL(path.replace(/^\//u, ""), `${client.marketingBaseUrl.replace(/\/$/u, "")}/`);
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  const authorization = Buffer.from(`nex:${client.marketingApiKey}`, "utf8").toString("base64");
  const response = await client.fetchFn(url, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Basic ${authorization}` },
  });
  return await responseJson(response);
}

async function transactionalPost(
  client: MailchimpClient,
  path: string,
  payload: UnknownRecord = {},
): Promise<unknown> {
  const url = new URL(path.replace(/^\//u, ""), `${client.transactionalBaseUrl.replace(/\/$/u, "")}/`);
  const response = await client.fetchFn(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ key: client.transactionalApiKey, ...payload }),
  });
  return await responseJson(response);
}

function requireClient(ctx: DefinedAdapterContext<MailchimpClient>): MailchimpClient {
  if (!ctx.client) throw new Error("Mailchimp connection client is unavailable");
  return ctx.client;
}

function payloadRecord(value: { payload?: UnknownRecord }): UnknownRecord {
  return value.payload ?? {};
}

function campaignTimestamp(campaign: UnknownRecord): number {
  const source = textValue(campaign.send_time) ?? textValue(campaign.create_time);
  const parsed = source ? Date.parse(source) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function messageTimestamp(message: UnknownRecord): number {
  const raw = message.ts;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.floor(raw * 1000);
  const sentAt = textValue(message.sent_at);
  const parsed = sentAt ? Date.parse(sentAt) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function marketingRecord(
  client: MailchimpClient,
  campaign: UnknownRecord,
  activity: UnknownRecord,
  content: UnknownRecord,
): AdapterInboundRecord {
  const campaignId = textValue(campaign.id) ?? "unknown-campaign";
  const emailId = textValue(activity.email_id) ?? normalizedEmailHash(activity.email_address) ?? "unknown-recipient";
  const timestamp = campaignTimestamp(campaign);
  const subject = textValue(asRecord(campaign.settings).subject_line) ?? "Mailchimp campaign";
  const recipientHash = normalizedEmailHash(activity.email_address);
  const providerPayload = {
    campaign,
    activity: withoutFields(activity, ["email_address"]),
    content,
  };
  const revisionHash = sha256(stableJson(providerPayload));
  return {
    operation: "record.ingest",
    routing: {
      adapter: PLATFORM,
      platform: PLATFORM,
      connection_id: client.connectionId,
      sender_id: client.connectionId,
      sender_name: client.accountLabel,
      receiver_id: client.connectionId,
      receiver_name: client.accountLabel,
      space_id: client.connectionId,
      space_name: client.accountLabel,
      container_kind: "group",
      container_id: `marketing:${campaignId}`,
      container_name: subject,
      thread_id: `marketing:${campaignId}:${emailId}`,
      metadata: {
        source_channel: "mailchimp_marketing",
        recipient_email_sha256: recipientHash ?? null,
      },
    },
    payload: {
      external_record_id: `mailchimp:${client.connectionId}:marketing:${campaignId}:${emailId}`,
      timestamp,
      content: `${subject}\n\n${textValue(content.plain_text) ?? textValue(content.html) ?? "[Campaign content unavailable]"}`,
      content_type: "text",
      recipients: recipientHash ? [`email-sha256:${recipientHash}`] : [],
      payload: providerPayload,
      metadata: {
        source_channel: "mailchimp_marketing",
        provider_campaign_id: campaignId,
        provider_recipient_id: emailId,
        recipient_email_sha256: recipientHash ?? null,
        delivery_state: "provider_activity_observed",
        direction: "moonsleep_to_customer",
        revision_hash: revisionHash,
        read_only_source: true,
      },
    },
  };
}

function transactionalRecord(
  client: MailchimpClient,
  message: UnknownRecord,
): AdapterInboundRecord {
  const messageId = textValue(message._id) ?? sha256(stableJson(message));
  const recipientHash = normalizedEmailHash(message.email);
  const subject = textValue(message.subject) ?? "Mailchimp Transactional message";
  const state = textValue(message.state) ?? "unknown";
  const providerMessage = withoutFields(message, ["email"]);
  return {
    operation: "record.ingest",
    routing: {
      adapter: PLATFORM,
      platform: PLATFORM,
      connection_id: client.connectionId,
      sender_id: client.connectionId,
      sender_name: client.accountLabel,
      receiver_id: client.connectionId,
      receiver_name: client.accountLabel,
      space_id: client.connectionId,
      space_name: client.accountLabel,
      container_kind: "direct",
      container_id: `transactional:${messageId}`,
      container_name: subject,
      thread_id: `transactional:${messageId}`,
      metadata: {
        source_channel: "mailchimp_transactional",
        recipient_email_sha256: recipientHash ?? null,
      },
    },
    payload: {
      external_record_id: `mailchimp:${client.connectionId}:transactional:${messageId}`,
      timestamp: messageTimestamp(message),
      content: subject,
      content_type: "text",
      recipients: recipientHash ? [`email-sha256:${recipientHash}`] : [],
      payload: { provider_message: providerMessage },
      metadata: {
        source_channel: "mailchimp_transactional",
        provider_message_id: messageId,
        recipient_email_sha256: recipientHash ?? null,
        delivery_state: state,
        direction: "moonsleep_to_customer",
        revision_hash: sha256(stableJson(providerMessage)),
        read_only_source: true,
      },
    },
  };
}

async function listAllCampaigns(
  client: MailchimpClient,
  since: Date,
  to?: Date,
): Promise<UnknownRecord[]> {
  const rows: UnknownRecord[] = [];
  for (let offset = 0; ; offset += MAX_PAGE_SIZE) {
    const page = asRecord(await marketingGet(client, "/campaigns", {
      count: MAX_PAGE_SIZE,
      offset,
      since_send_time: since.toISOString(),
      before_send_time: to?.toISOString(),
      status: "sent",
    }));
    const campaigns = asArray(page.campaigns).map(asRecord);
    rows.push(...campaigns);
    if (campaigns.length < MAX_PAGE_SIZE) break;
  }
  return rows;
}

async function campaignActivity(
  client: MailchimpClient,
  campaignId: string,
): Promise<UnknownRecord[]> {
  const rows: UnknownRecord[] = [];
  for (let offset = 0; ; offset += MAX_PAGE_SIZE) {
    const page = asRecord(await marketingGet(
      client,
      `/reports/${encodeURIComponent(campaignId)}/email-activity`,
      { count: MAX_PAGE_SIZE, offset },
    ));
    const emails = asArray(page.emails).map(asRecord);
    rows.push(...emails);
    if (emails.length < MAX_PAGE_SIZE) break;
  }
  return rows;
}

async function ingestWindow(
  client: MailchimpClient,
  args: Omit<AdapterBackfillWindow, "connection_id">,
  emit: (record: AdapterInboundRecord) => void,
): Promise<void> {
  const campaigns = await listAllCampaigns(client, args.since, args.to);
  for (const campaign of campaigns) {
    const campaignId = textValue(campaign.id);
    if (!campaignId) continue;
    const [content, activities] = await Promise.all([
      marketingGet(client, `/campaigns/${encodeURIComponent(campaignId)}/content`).then(asRecord),
      campaignActivity(client, campaignId),
    ]);
    for (const activity of activities) emit(marketingRecord(client, campaign, activity, content));
  }

  const transactional = asArray(await transactionalPost(client, "/messages/search.json", {
    date_from: args.since.toISOString().slice(0, 10),
    date_to: (args.to ?? new Date()).toISOString().slice(0, 10),
    limit: 1000,
  })).map(asRecord);
  for (const message of transactional) emit(transactionalRecord(client, message));
}

async function monitor(
  ctx: DefinedAdapterContext<MailchimpClient>,
  emit: (record: AdapterInboundRecord) => void,
): Promise<void> {
  const client = requireClient(ctx);
  while (!ctx.signal.aborted) {
    const to = new Date();
    const since = new Date(to.getTime() - DEFAULT_OVERLAP_MS);
    await ingestWindow(client, { since, to }, emit);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, DEFAULT_MONITOR_INTERVAL_MS);
      ctx.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }
}

async function health(client: MailchimpClient): Promise<{ connected: boolean; details?: UnknownRecord; error?: string }> {
  try {
    const [marketing, transactional] = await Promise.all([
      marketingGet(client, "/ping"),
      transactionalPost(client, "/users/ping2.json"),
    ]);
    return {
      connected: true,
      details: {
        marketing: asRecord(marketing),
        transactional: asRecord(transactional),
        read_only: true,
      },
    };
  } catch (error) {
    return { connected: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export const __test__ = {
  normalizedEmailHash,
  marketingDatacenter,
  marketingRecord,
  transactionalRecord,
};

export const mailchimpAdapter = defineAdapter<MailchimpClient>({
  platform: PLATFORM,
  name: "nexus-mailchimp-readonly-adapter",
  version: "0.1.0",
  multi_account: true,
  credential_service: "mailchimp",
  auth: {
    methods: [
      {
        id: "mailchimp_api_keys",
        type: "api_key",
        label: "Connect Mailchimp read-only history",
        icon: "key",
        service: "mailchimp",
        fields: [
          { name: "marketing_api_key", label: "Marketing API key", type: "secret", required: true },
          { name: "transactional_api_key", label: "Transactional API key", type: "secret", required: true },
        ],
      },
    ],
    setupGuide: "Provide Marketing and Transactional API keys. This package exposes read methods and ingestion only; it contains no send or remote-mutation method.",
  },
  capabilities: {
    text_limit: 0,
    supports_markdown: false,
    supports_tables: false,
    supports_code_blocks: false,
    supports_embeds: false,
    supports_threads: true,
    supports_reactions: false,
    supports_polls: false,
    supports_buttons: false,
    supports_edit: false,
    supports_delete: false,
    supports_media: false,
    supports_voice_notes: false,
  },
  client: {
    create: ({ ctx, connectionId }) => buildClient(ctx, connectionId),
  },
  connection: {
    connections: async (ctx) => {
      const client = requireClient(ctx);
      return [{ id: client.connectionId, display_name: client.accountLabel, status: "ready" }];
    },
    health: async (ctx) => await health(requireClient(ctx)),
  },
  ingest: {
    backfill: async (ctx, args, emit) => await ingestWindow(requireClient(ctx), args, emit),
    monitor,
  },
  methods: {
    "mailchimp.marketing.campaigns.list": method({
      description: "List sent Mailchimp Marketing campaigns without mutating provider state.",
      action: "read",
      connection_required: true,
      mutates_remote: false,
      params: { count: "Page size", offset: "Page offset", since_send_time: "ISO lower bound" },
      response: { campaigns: "Provider campaign response" },
      handler: async (ctx, req) => {
        const payload = payloadRecord(req);
        return await marketingGet(requireClient(ctx), "/campaigns", {
          count: integerValue(payload.count, DEFAULT_PAGE_SIZE),
          offset: Math.max(0, Number(payload.offset) || 0),
          since_send_time: textValue(payload.since_send_time),
          status: "sent",
        });
      },
    }),
    "mailchimp.marketing.campaign.content.get": method({
      description: "Read the exact stored content for one Marketing campaign.",
      action: "read",
      connection_required: true,
      mutates_remote: false,
      params: { campaign_id: "Mailchimp campaign id" },
      response: { content: "Provider campaign content" },
      handler: async (ctx, req) => {
        const campaignId = textValue(payloadRecord(req).campaign_id);
        if (!campaignId) throw new Error("campaign_id is required");
        return await marketingGet(requireClient(ctx), `/campaigns/${encodeURIComponent(campaignId)}/content`);
      },
    }),
    "mailchimp.marketing.campaign.recipients.list": method({
      description: "List recipient activity for one Marketing campaign.",
      action: "read",
      connection_required: true,
      mutates_remote: false,
      params: { campaign_id: "Mailchimp campaign id", count: "Page size", offset: "Page offset" },
      response: { emails: "Recipient activity rows" },
      handler: async (ctx, req) => {
        const payload = payloadRecord(req);
        const campaignId = textValue(payload.campaign_id);
        if (!campaignId) throw new Error("campaign_id is required");
        return await marketingGet(
          requireClient(ctx),
          `/reports/${encodeURIComponent(campaignId)}/email-activity`,
          { count: integerValue(payload.count, DEFAULT_PAGE_SIZE), offset: Math.max(0, Number(payload.offset) || 0) },
        );
      },
    }),
    "mailchimp.transactional.messages.search": method({
      description: "Search Mailchimp Transactional delivery history in a bounded date window.",
      action: "read",
      connection_required: true,
      mutates_remote: false,
      params: { date_from: "YYYY-MM-DD", date_to: "YYYY-MM-DD", limit: "Maximum results" },
      response: { messages: "Provider message rows" },
      handler: async (ctx, req) => {
        const payload = payloadRecord(req);
        return {
          messages: await transactionalPost(requireClient(ctx), "/messages/search.json", {
            date_from: textValue(payload.date_from),
            date_to: textValue(payload.date_to),
            limit: integerValue(payload.limit, 100, 1000),
          }),
        };
      },
    }),
    "mailchimp.transactional.message.info": method({
      description: "Read provider delivery metadata for one Transactional message.",
      action: "read",
      connection_required: true,
      mutates_remote: false,
      params: { message_id: "Transactional message id" },
      response: { message: "Provider message metadata" },
      handler: async (ctx, req) => {
        const messageId = textValue(payloadRecord(req).message_id);
        if (!messageId) throw new Error("message_id is required");
        return { message: await transactionalPost(requireClient(ctx), "/messages/info.json", { id: messageId }) };
      },
    }),
    "mailchimp.transactional.templates.list": method({
      description: "List Mailchimp Transactional templates without changing them.",
      action: "read",
      connection_required: true,
      mutates_remote: false,
      params: { label: "Optional template label" },
      response: { templates: "Provider template rows" },
      handler: async (ctx, req) => ({
        templates: await transactionalPost(requireClient(ctx), "/templates/list.json", {
          label: textValue(payloadRecord(req).label),
        }),
      }),
    }),
  },
});

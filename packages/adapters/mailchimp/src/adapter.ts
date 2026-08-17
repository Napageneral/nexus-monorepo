import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { unzipSync } from "fflate";
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
  runtimeConfig: UnknownRecord;
};

const PLATFORM = "mailchimp";
const DEFAULT_ACCOUNT_LABEL = "MoonSleep Mailchimp";
const DEFAULT_CONNECTION_ID = "moonsleep-mailchimp";
const DEFAULT_MARKETING_DATACENTER = "us20";
const DEFAULT_TRANSACTIONAL_BASE_URL = "https://mandrillapp.com/api/1.0";
const MAX_PAGE_SIZE = 1000;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MONITOR_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_OVERLAP_MS = 48 * 60 * 60 * 1000;
const DEFAULT_CURSOR_OVERLAP_MS = 5 * 60 * 1000;
const DEFAULT_EXPORT_CLOSE_LAG_MS = 2 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;
const DEFAULT_EXPORT_POLL_MS = 5_000;
const DEFAULT_EXPORT_WAIT_MS = 15 * 60 * 1000;
const MAX_EXPORT_BYTES = 512 * 1024 * 1024;
const TRANSACTIONAL_SEARCH_LIMIT = 1000;
const MAX_RETRIES = 5;

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

function positiveNumber(value: unknown, fallback: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(maximum, Math.floor(parsed));
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

function adapterStateDir(): string | undefined {
  const value = textValue(process.env.NEXUS_ADAPTER_STATE_DIR);
  if (!value) return undefined;
  const absolute = resolve(value);
  if (!existsSync(absolute)) mkdirSync(absolute, { recursive: true, mode: 0o700 });
  chmodSync(absolute, 0o700);
  return absolute;
}

function requiredAdapterStateDir(): string {
  const stateDir = adapterStateDir();
  if (!stateDir) {
    throw new Error("Mailchimp ingestion requires NEXUS_ADAPTER_STATE_DIR for durable checkpoints and receipts");
  }
  return stateDir;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function retryDelay(attempt: number, retryAfter: string | null): number {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(60_000, seconds * 1000);
  return Math.min(30_000, 500 * (2 ** attempt));
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
    runtimeConfig: runtimeConfig(ctx),
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

async function providerFetchJson(
  client: MailchimpClient,
  url: URL,
  init: RequestInit,
): Promise<unknown> {
  const configuredTimeout = positiveNumber(
    runtimeConfigFromClient(client).request_timeout_ms,
    DEFAULT_REQUEST_TIMEOUT_MS,
    120_000,
  );
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), configuredTimeout);
    try {
      const response = await client.fetchFn(url, { ...init, signal: controller.signal });
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        const delay = retryDelay(attempt, response.headers.get("retry-after"));
        await response.arrayBuffer();
        await sleep(delay);
        continue;
      }
      return await responseJson(response);
    } catch (error) {
      if (attempt >= MAX_RETRIES) throw error;
      await sleep(retryDelay(attempt, null));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Mailchimp read retries exhausted");
}

function runtimeConfigFromClient(client: MailchimpClient): UnknownRecord {
  return client.runtimeConfig;
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
  return await providerFetchJson(client, url, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Basic ${authorization}` },
  });
}

async function transactionalPost(
  client: MailchimpClient,
  path: string,
  payload: UnknownRecord = {},
): Promise<unknown> {
  const url = new URL(path.replace(/^\//u, ""), `${client.transactionalBaseUrl.replace(/\/$/u, "")}/`);
  return await providerFetchJson(client, url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ key: client.transactionalApiKey, ...payload }),
  });
}

function requireClient(ctx: DefinedAdapterContext<MailchimpClient>): MailchimpClient {
  if (!ctx.client) throw new Error("Mailchimp connection client is unavailable");
  return ctx.client;
}

function connectionIdentity(client: MailchimpClient) {
  return {
    id: client.connectionId,
    display_name: client.accountLabel,
    account: client.accountLabel,
    account_contact: {
      platform: PLATFORM,
      space_id: client.connectionId,
      contact_id: client.connectionId,
    },
    status: "ready" as const,
  };
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

function marketingCampaignRecord(
  client: MailchimpClient,
  campaign: UnknownRecord,
  content: UnknownRecord,
): AdapterInboundRecord {
  const campaignId = textValue(campaign.id) ?? "unknown-campaign";
  const subject = textValue(asRecord(campaign.settings).subject_line) ?? "Mailchimp campaign";
  const providerPayload = { campaign, content };
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
      thread_id: `marketing:${campaignId}`,
      metadata: { source_channel: "mailchimp_marketing_campaign" },
    },
    payload: {
      external_record_id: `mailchimp:${client.connectionId}:marketing-campaign:${campaignId}`,
      timestamp: campaignTimestamp(campaign),
      content: `${subject}\n\n${textValue(content.plain_text) ?? textValue(content.html) ?? "[Campaign content unavailable]"}`,
      content_type: "text",
      recipients: [],
      payload: providerPayload,
      metadata: {
        source_channel: "mailchimp_marketing_campaign",
        provider_campaign_id: campaignId,
        direction: "moonsleep_to_customer",
        revision_hash: sha256(stableJson(providerPayload)),
        read_only_source: true,
      },
    },
  };
}

function marketingRecipientRecord(
  client: MailchimpClient,
  campaign: UnknownRecord,
  activity: UnknownRecord,
): AdapterInboundRecord {
  const campaignId = textValue(campaign.id) ?? "unknown-campaign";
  const emailId = textValue(activity.email_id) ?? normalizedEmailHash(activity.email_address) ?? "unknown-recipient";
  const timestamp = campaignTimestamp(campaign);
  const subject = textValue(asRecord(campaign.settings).subject_line) ?? "Mailchimp campaign";
  const recipientHash = normalizedEmailHash(activity.email_address);
  const providerPayload = {
    campaign,
    activity: withoutFields(activity, ["email_address"]),
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
      content: subject,
      content_type: "text",
      recipients: recipientHash ? [`email-sha256:${recipientHash}`] : [],
      payload: providerPayload,
      metadata: {
        source_channel: "mailchimp_marketing",
        provider_campaign_id: campaignId,
        provider_recipient_id: emailId,
        campaign_record_ref: `mailchimp:${client.connectionId}:marketing-campaign:${campaignId}`,
        recipient_email_sha256: recipientHash ?? null,
        delivery_state: marketingDeliveryState(activity, campaign),
        direction: "moonsleep_to_customer",
        revision_hash: revisionHash,
        read_only_source: true,
      },
    },
  };
}

function marketingDeliveryState(activity: UnknownRecord, campaign: UnknownRecord = {}): string {
  const actions = asArray(activity.activity)
    .map(asRecord)
    .map((row) => textValue(row.action)?.toLowerCase())
    .filter((value): value is string => Boolean(value));
  if (actions.some((value) => value.includes("bounce") || value === "abuse")) {
    return "verified_not_delivered";
  }
  const campaignDelivery = textValue(asRecord(campaign.delivery_status).status)?.toLowerCase();
  return actions.includes("sent") || campaignDelivery === "delivered"
    ? "verified_delivered"
    : "uncertain";
}

function transactionalRecord(
  client: MailchimpClient,
  message: UnknownRecord,
): AdapterInboundRecord {
  const messageId = textValue(message._id) ?? sha256(stableJson(message));
  const recipientHash = normalizedEmailHash(message.email);
  const subject = textValue(message.subject) ?? "Mailchimp Transactional message";
  const state = transactionalDeliveryState(message.state);
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

function transactionalDeliveryState(value: unknown): string {
  const state = textValue(value)?.toLowerCase() ?? "unknown";
  if (["sent", "delivered"].includes(state)) return "verified_delivered";
  if (["bounced", "rejected", "spam", "unsub"].includes(state)) return "verified_not_delivered";
  if (["queued", "scheduled"].includes(state)) return "attempted";
  return "uncertain";
}

function exportTimestamp(row: UnknownRecord): number {
  const source = textValue(row.Date) ?? textValue(row.date);
  if (!source) return Date.now();
  const utc = /(?:Z|[+-]\d\d:?\d\d)$/u.test(source) ? source : `${source.replace(" ", "T")}Z`;
  const parsed = Date.parse(utc);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function transactionalExportRecord(
  client: MailchimpClient,
  row: UnknownRecord,
  exportId: string,
  duplicateOrdinal: number,
): AdapterInboundRecord {
  const email = textValue(row["Email Address"]) ?? textValue(row.email);
  const recipientHash = normalizedEmailHash(email);
  const sanitized = withoutFields(row, ["Email Address", "email"]);
  const stableIdentity = transactionalExportStableIdentity(
    row,
    recipientHash,
    duplicateOrdinal,
  );
  const subject = textValue(row.Subject) ?? textValue(row.subject) ?? "Mailchimp Transactional message";
  const providerMessageRef = `export:${stableIdentity}`;
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
      container_id: `transactional:${providerMessageRef}`,
      container_name: subject,
      thread_id: `transactional:${providerMessageRef}`,
      metadata: {
        source_channel: "mailchimp_transactional",
        recipient_email_sha256: recipientHash ?? null,
      },
    },
    payload: {
      external_record_id: `mailchimp:${client.connectionId}:transactional:${providerMessageRef}`,
      timestamp: exportTimestamp(row),
      content: subject,
      content_type: "text",
      recipients: recipientHash ? [`email-sha256:${recipientHash}`] : [],
      payload: { provider_export_row: sanitized },
      metadata: {
        source_channel: "mailchimp_transactional",
        provider_message_id: providerMessageRef,
        provider_export_id: exportId,
        recipient_email_sha256: recipientHash ?? null,
        delivery_state: transactionalDeliveryState(row.Status ?? row.status),
        direction: "moonsleep_to_customer",
        revision_hash: sha256(stableJson(sanitized)),
        read_only_source: true,
      },
    },
  };
}

function transactionalExportStableIdentity(
  row: UnknownRecord,
  recipientHash: string | undefined,
  duplicateOrdinal: number,
): string {
  const providerMessageId = [
    row["Message ID"], row["Message Id"], row.message_id, row._id, row.id,
  ].map(textValue).find(Boolean);
  if (providerMessageId) {
    return sha256(stableJson({ providerMessageId }));
  }
  const metadata = asRecord(row.Metadata ?? row.metadata ?? row["Custom Metadata"]);
  const moonSleepMessageRef = [
    metadata.moonsleep_message_ref,
    metadata.moonsleep_communication_ref,
    metadata.message_ref,
  ].map(textValue).find(Boolean);
  if (moonSleepMessageRef) {
    return sha256(stableJson({ moonSleepMessageRef }));
  }
  // Historical exports may not carry a provider id. Exclude mutable delivery
  // fields so sent/delivered/bounced revisions converge on one record identity.
  const identity = {
    timestamp: textValue(row.Date) ?? textValue(row.date) ?? null,
    recipientHash: recipientHash ?? null,
    subject: textValue(row.Subject) ?? textValue(row.subject) ?? null,
    sender: textValue(row.Sender) ?? textValue(row.sender) ?? textValue(row.From) ?? null,
    template: textValue(row.Template) ?? textValue(row.template) ?? null,
    tags: row.Tags ?? row.tags ?? null,
    duplicateOrdinal,
  };
  return sha256(stableJson(identity));
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
      fields: "campaigns.id,campaigns.type,campaigns.create_time,campaigns.send_time,campaigns.status,campaigns.emails_sent,campaigns.recipients.list_id,campaigns.recipients.recipient_count,campaigns.settings.subject_line,campaigns.settings.preview_text,campaigns.settings.title,campaigns.settings.from_name,campaigns.settings.reply_to,campaigns.delivery_status,total_items",
    }));
    const campaigns = asArray(page.campaigns).map(asRecord);
    rows.push(...campaigns);
    if (campaigns.length < MAX_PAGE_SIZE) break;
  }
  return rows;
}

async function emitCampaignActivity(
  client: MailchimpClient,
  campaignId: string,
  emit: (activity: UnknownRecord) => void,
): Promise<void> {
  for (let offset = 0; ; offset += MAX_PAGE_SIZE) {
    const page = asRecord(await marketingGet(
      client,
      `/reports/${encodeURIComponent(campaignId)}/email-activity`,
      { count: MAX_PAGE_SIZE, offset, fields: "emails.email_id,emails.email_address,emails.activity,total_items" },
    ));
    const emails = asArray(page.emails).map(asRecord);
    for (const email of emails) emit(email);
    if (emails.length < MAX_PAGE_SIZE) break;
  }
}

type ExportCheckpoint = {
  export_id: string;
  since: string;
  to: string;
};

function exportCheckpointPath(client: MailchimpClient, since: Date, to: Date): string {
  const stateDir = requiredAdapterStateDir();
  const name = sha256(`${client.connectionId}\n${since.toISOString()}\n${to.toISOString()}`);
  return join(stateDir, `transactional-export-${name}.json`);
}

function readExportCheckpoint(path: string | undefined): ExportCheckpoint | undefined {
  if (!path || !existsSync(path)) return undefined;
  try {
    const parsed = asRecord(JSON.parse(readFileSync(path, "utf8")));
    const exportId = textValue(parsed.export_id);
    const since = textValue(parsed.since);
    const to = textValue(parsed.to);
    return exportId && since && to ? { export_id: exportId, since, to } : undefined;
  } catch {
    return undefined;
  }
}

function writeExportCheckpoint(path: string | undefined, checkpoint: ExportCheckpoint): void {
  if (!path) return;
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${stableJson(checkpoint)}\n`, { mode: 0o600, flag: "wx" });
  renameSync(temporary, path);
  chmodSync(path, 0o600);
}

async function fetchBoundedBytes(client: MailchimpClient, rawUrl: string): Promise<Uint8Array> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Mailchimp export URL must use HTTPS");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await client.fetchFn(url, { method: "GET", signal: controller.signal });
    if (!response.ok) throw new Error(`Mailchimp export download failed: HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_EXPORT_BYTES) {
      throw new Error("Mailchimp export exceeds the configured byte bound");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_EXPORT_BYTES) throw new Error("Mailchimp export exceeds the configured byte bound");
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}

async function exportTransactionalHistory(
  client: MailchimpClient,
  since: Date,
  to: Date,
  emit: (record: AdapterInboundRecord) => void,
): Promise<{ exportId: string; candidateCount: number; emittedCount: number; deduplicatedCount: number }> {
  const checkpointPath = exportCheckpointPath(client, since, to);
  let checkpoint = readExportCheckpoint(checkpointPath);
  if (!checkpoint) {
    const started = asRecord(await transactionalPost(client, "/exports/activity.json", {
      date_from: since.toISOString().replace("T", " ").replace(/\.\d{3}Z$/u, ""),
      date_to: to.toISOString().replace("T", " ").replace(/\.\d{3}Z$/u, ""),
    }));
    const exportId = textValue(started.id);
    if (!exportId) throw new Error("Mailchimp Transactional export did not return an id");
    checkpoint = { export_id: exportId, since: since.toISOString(), to: to.toISOString() };
    writeExportCheckpoint(checkpointPath, checkpoint);
  }

  const waitMs = positiveNumber(
    runtimeConfigFromClient(client).transactional_export_wait_ms,
    DEFAULT_EXPORT_WAIT_MS,
    60 * 60 * 1000,
  );
  const pollMs = positiveNumber(
    runtimeConfigFromClient(client).transactional_export_poll_ms,
    DEFAULT_EXPORT_POLL_MS,
    60_000,
  );
  const deadline = Date.now() + waitMs;
  let info: UnknownRecord = {};
  while (Date.now() < deadline) {
    info = asRecord(await transactionalPost(client, "/exports/info.json", { id: checkpoint.export_id }));
    const state = textValue(info.state)?.toLowerCase();
    if (state === "complete") break;
    if (state === "error" || state === "failed") throw new Error("Mailchimp Transactional export failed");
    await sleep(pollMs);
  }
  if (textValue(info.state)?.toLowerCase() !== "complete") {
    throw new Error(`Mailchimp Transactional export is still pending: ${checkpoint.export_id}`);
  }
  const resultUrl = textValue(info.result_url);
  if (!resultUrl) throw new Error("Mailchimp Transactional export result URL is missing");
  const archive = await fetchBoundedBytes(client, resultUrl);
  const files = unzipSync(archive);
  const csvEntry = Object.entries(files).find(([name]) => name.endsWith("activity.csv"));
  if (!csvEntry) throw new Error("Mailchimp Transactional export did not contain activity.csv");
  const rows = parseCsv(Buffer.from(csvEntry[1]), {
    columns: true,
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as UnknownRecord[];
  const duplicateCounts = new Map<string, number>();
  const emittedRevisions = new Set<string>();
  let emittedCount = 0;
  let deduplicatedCount = 0;
  for (const row of rows) {
    const sanitized = withoutFields(asRecord(row), ["Email Address", "email"]);
    const identity = stableJson({ sanitized, recipientHash: normalizedEmailHash(row["Email Address"] ?? row.email) });
    const ordinal = duplicateCounts.get(identity) ?? 0;
    duplicateCounts.set(identity, ordinal + 1);
    const record = transactionalExportRecord(
      client,
      asRecord(row),
      checkpoint.export_id,
      ordinal,
    );
    const revisionKey = stableJson([
      record.payload.external_record_id,
      record.payload.metadata?.revision_hash ?? null,
    ]);
    if (emittedRevisions.has(revisionKey)) {
      deduplicatedCount += 1;
      continue;
    }
    emittedRevisions.add(revisionKey);
    emit(record);
    emittedCount += 1;
  }
  return {
    exportId: checkpoint.export_id,
    candidateCount: rows.length,
    emittedCount,
    deduplicatedCount,
  };
}

type TransactionalSearchStats = {
  capObserved: boolean;
  continuityProven: boolean;
  historicalGapDetected: boolean;
  candidateCount: number;
  emittedCount: number;
  deduplicatedCount: number;
  oldestMessageAt: string | null;
  newestMessageAt: string | null;
};

async function searchTransactionalTail(
  client: MailchimpClient,
  since: Date,
  to: Date,
  emit: (record: AdapterInboundRecord) => void,
  continuityFloor?: Date,
  allowIncompleteBootstrap = false,
): Promise<TransactionalSearchStats> {
  if (to.getTime() <= since.getTime()) {
    throw new Error("Mailchimp Transactional search window must have positive duration");
  }
  const messages = asArray(await transactionalPost(client, "/messages/search.json", {
    // Mailchimp documents these as dates, not timestamps. The provider ignores
    // sub-day precision, so current-tail safety comes from overlap continuity,
    // not from pretending a capped day can be subdivided.
    date_from: since.toISOString().slice(0, 10),
    date_to: to.toISOString().slice(0, 10),
    limit: TRANSACTIONAL_SEARCH_LIMIT,
  })).map(asRecord);
  const records = new Map<string, AdapterInboundRecord>();
  const timestamps: number[] = [];
  for (const message of messages) {
    const record = transactionalRecord(client, message);
    timestamps.push(record.payload.timestamp);
    const identity = stableJson([
      record.payload.external_record_id,
      record.payload.metadata?.revision_hash ?? null,
    ]);
    records.set(identity, record);
  }
  const capObserved = messages.length >= TRANSACTIONAL_SEARCH_LIMIT;
  const oldestTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : null;
  const newestTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : null;
  let continuityProven = !capObserved;
  let historicalGapDetected = false;
  if (capObserved) {
    if (continuityFloor) {
      continuityProven = oldestTimestamp !== null
        && oldestTimestamp <= continuityFloor.getTime();
      if (!continuityProven) {
        throw new Error("Mailchimp Transactional capped tail no longer overlaps the durable cursor");
      }
    } else if (allowIncompleteBootstrap) {
      // Establish a current high-water without misrepresenting the inaccessible
      // portion of the seven-day provider window as complete. A later export
      // or webhook-backed replay can close this explicitly recorded debt.
      historicalGapDetected = true;
    } else {
      throw new Error("Mailchimp Transactional backfill reached its 1000-message completeness cap");
    }
  }

  for (const record of records.values()) emit(record);
  return {
    capObserved,
    continuityProven,
    historicalGapDetected,
    candidateCount: messages.length,
    emittedCount: records.size,
    deduplicatedCount: messages.length - records.size,
    oldestMessageAt: oldestTimestamp === null ? null : new Date(oldestTimestamp).toISOString(),
    newestMessageAt: newestTimestamp === null ? null : new Date(newestTimestamp).toISOString(),
  };
}

function writeSanitizedIngestReceipt(
  client: MailchimpClient,
  payload: UnknownRecord,
): void {
  const stateDir = requiredAdapterStateDir();
  const historyRoot = join(stateDir, "ingestion-run-history");
  if (!existsSync(historyRoot)) mkdirSync(historyRoot, { recursive: true, mode: 0o700 });
  chmodSync(historyRoot, 0o700);
  const encoded = `${stableJson(payload)}\n`;
  const digest = sha256(encoded);
  const startedAt = textValue(payload.started_at) ?? new Date().toISOString();
  const timestamp = startedAt.replace(/[^0-9]/gu, "").slice(0, 17);
  const path = join(
    historyRoot,
    `${timestamp}-${client.connectionId.replace(/[^A-Za-z0-9._-]/gu, "_")}-${digest}.json`,
  );
  writeFileSync(path, encoded, { mode: 0o400, flag: "wx" });
  chmodSync(path, 0o400);
}

function monitorCursorPath(client: MailchimpClient): string {
  return join(
    requiredAdapterStateDir(),
    `transactional-monitor-${sha256(client.connectionId)}.json`,
  );
}

function readMonitorCursor(client: MailchimpClient): Date | undefined {
  const path = monitorCursorPath(client);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = asRecord(JSON.parse(readFileSync(path, "utf8")));
    const through = textValue(parsed.completed_through);
    if (!through) return undefined;
    const timestamp = Date.parse(through);
    return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
  } catch {
    return undefined;
  }
}

function writeMonitorCursor(client: MailchimpClient, completedThrough: Date): void {
  const path = monitorCursorPath(client);
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(
    temporary,
    `${stableJson({ completed_through: completedThrough.toISOString() })}\n`,
    { mode: 0o600, flag: "wx" },
  );
  renameSync(temporary, path);
  chmodSync(path, 0o600);
}

async function ingestWindow(
  client: MailchimpClient,
  args: Omit<AdapterBackfillWindow, "connection_id">,
  emit: (record: AdapterInboundRecord) => void,
  options: { continuityFloor?: Date; allowIncompleteBootstrap?: boolean } = {},
): Promise<void> {
  // Establish durable state custody before contacting either provider API. A
  // run without checkpoint/cursor/receipt storage is not an admissible ingest.
  requiredAdapterStateDir();
  const startedAt = new Date().toISOString();
  const to = args.to ?? new Date();
  const outputIdentities: string[] = [];
  let emittedCount = 0;
  let searchStats: TransactionalSearchStats | undefined;
  const trackedEmit = (record: AdapterInboundRecord) => {
    outputIdentities.push(stableJson([
      record.payload.external_record_id,
      record.payload.metadata?.revision_hash ?? null,
    ]));
    emittedCount += 1;
    emit(record);
  };
  try {
    const campaigns = await listAllCampaigns(client, args.since, to);
    for (const campaign of campaigns) {
      const campaignId = textValue(campaign.id);
      if (!campaignId) continue;
      const content = asRecord(await marketingGet(client, `/campaigns/${encodeURIComponent(campaignId)}/content`));
      trackedEmit(marketingCampaignRecord(client, campaign, content));
      await emitCampaignActivity(client, campaignId, (activity) => {
        trackedEmit(marketingRecipientRecord(client, campaign, activity));
      });
    }
    // Mailchimp's recent search is day-granular and capped. The monitor admits
    // a capped tail only when it overlaps its prior durable cursor; explicit
    // backfills remain fail-closed because they promise historical coverage.
    searchStats = await searchTransactionalTail(
      client,
      args.since,
      to,
      trackedEmit,
      options.continuityFloor,
      options.allowIncompleteBootstrap,
    );
    writeSanitizedIngestReceipt(client, {
      contract_version: "nexus_mailchimp_ingestion_run_v2",
      result: "succeeded",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      window_since: args.since.toISOString(),
      window_through: to.toISOString(),
      transactional_search_cap_observed: searchStats.capObserved,
      transactional_tail_continuity_proven: searchStats.continuityProven,
      transactional_historical_gap_detected: searchStats.historicalGapDetected,
      transactional_oldest_message_at: searchStats.oldestMessageAt,
      transactional_newest_message_at: searchStats.newestMessageAt,
      transactional_candidate_count: searchStats.candidateCount,
      transactional_emitted_count: searchStats.emittedCount,
      transactional_deduplicated_count: searchStats.deduplicatedCount,
      total_emitted_count: emittedCount,
      recent_search_cap_hit: false,
      output_digest: sha256(stableJson(outputIdentities.sort())),
    });
  } catch (error) {
    writeSanitizedIngestReceipt(client, {
      contract_version: "nexus_mailchimp_ingestion_run_v2",
      result: "failed",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      window_since: args.since.toISOString(),
      window_through: to.toISOString(),
      transactional_search_cap_observed: searchStats?.capObserved ?? false,
      transactional_tail_continuity_proven: searchStats?.continuityProven ?? false,
      transactional_historical_gap_detected: searchStats?.historicalGapDetected ?? false,
      transactional_oldest_message_at: searchStats?.oldestMessageAt ?? null,
      transactional_newest_message_at: searchStats?.newestMessageAt ?? null,
      transactional_candidate_count: searchStats?.candidateCount ?? 0,
      transactional_emitted_count: searchStats?.emittedCount ?? 0,
      transactional_deduplicated_count: searchStats?.deduplicatedCount ?? 0,
      total_emitted_count: emittedCount,
      recent_search_cap_hit: true,
      error_class: error instanceof Error ? error.name : "UnknownError",
      output_digest: sha256(stableJson(outputIdentities.sort())),
    });
    throw error;
  }
}

async function monitor(
  ctx: DefinedAdapterContext<MailchimpClient>,
  emit: (record: AdapterInboundRecord) => void,
): Promise<void> {
  const client = requireClient(ctx);
  while (!ctx.signal.aborted) {
    const closedHead = new Date(Date.now() - DEFAULT_EXPORT_CLOSE_LAG_MS);
    const cursor = readMonitorCursor(client);
    const since = cursor
      ? new Date(cursor.getTime() - DEFAULT_CURSOR_OVERLAP_MS)
      : new Date(closedHead.getTime() - DEFAULT_OVERLAP_MS);
    const to = cursor
      ? new Date(Math.min(closedHead.getTime(), cursor.getTime() + 24 * 60 * 60 * 1000))
      : closedHead;
    await ingestWindow(client, { since, to }, emit, {
      continuityFloor: cursor ? since : undefined,
      allowIncompleteBootstrap: !cursor,
    });
    writeMonitorCursor(client, to);
    if (to.getTime() < closedHead.getTime()) continue;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, DEFAULT_MONITOR_INTERVAL_MS);
      ctx.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }
}

async function health(client: MailchimpClient) {
  try {
    const [marketing, transactional] = await Promise.all([
      marketingGet(client, "/ping"),
      transactionalPost(client, "/users/ping2.json"),
    ]);
    return {
      connected: true,
      connection_id: client.connectionId,
      account: client.accountLabel,
      account_contact: connectionIdentity(client).account_contact,
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
  marketingCampaignRecord,
  marketingRecipientRecord,
  marketingDeliveryState,
  transactionalRecord,
  transactionalExportRecord,
  transactionalExportStableIdentity,
  transactionalDeliveryState,
  searchTransactionalTail,
  connectionIdentity,
  health,
};

export const mailchimpAdapter = defineAdapter<MailchimpClient>({
  platform: PLATFORM,
  name: "nexus-mailchimp-readonly-adapter",
  version: "0.2.1",
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
      return [connectionIdentity(client)];
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
    "mailchimp.transactional.exports.list": method({
      description: "List read-side Mailchimp Transactional activity exports.",
      action: "read",
      connection_required: true,
      mutates_remote: false,
      params: {},
      response: { exports: "Provider export jobs" },
      handler: async (ctx) => ({
        exports: await transactionalPost(requireClient(ctx), "/exports/list.json"),
      }),
    }),
    "mailchimp.transactional.export.info": method({
      description: "Read the status of one Mailchimp Transactional activity export.",
      action: "read",
      connection_required: true,
      mutates_remote: false,
      params: { export_id: "Transactional export id" },
      response: { export: "Provider export job" },
      handler: async (ctx, req) => {
        const exportId = textValue(payloadRecord(req).export_id);
        if (!exportId) throw new Error("export_id is required");
        return { export: await transactionalPost(requireClient(ctx), "/exports/info.json", { id: exportId }) };
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

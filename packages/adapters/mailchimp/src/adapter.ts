import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
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
// Mailchimp documents messages/search as a recent-message read (its default window is the
// last seven days). Older windows must come from the activity export; the horizon is
// configurable per connection (transactional_search_horizon_days) and deliberately short.
const DEFAULT_TRANSACTIONAL_SEARCH_HORIZON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RETRIES = 5;
// records.backfill.stage writes this many records per JSONL chunk file (backfill_stage_chunk_records).
const DEFAULT_STAGE_CHUNK_RECORDS = 1000;
const MAX_STAGE_CHUNK_RECORDS = 5000;

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

// Mailchimp Transactional answers every application error (unknown export, invalid
// key, validation) with HTTP 500 and {status: "error", name, message}; those are not
// transient and must not be retried.
function providerErrorName(parsed: unknown): string | undefined {
  const record = asRecord(parsed);
  return record.status === "error" ? textValue(record.name) : undefined;
}

function providerReadError(status: number, parsed: unknown): Error {
  const record = asRecord(parsed);
  const message = textValue(record.detail) ?? textValue(record.message);
  const name = providerErrorName(parsed);
  const detail = name && message ? `${name}: ${message}` : (name ?? message ?? `HTTP ${status}`);
  return new Error(`Mailchimp read failed: ${detail}`);
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
      const body = await response.text();
      const parsed = body ? JSON.parse(body) as unknown : null;
      if (response.ok) return parsed;
      const transient = response.status === 429 || (response.status >= 500 && !providerErrorName(parsed));
      if (transient && attempt < MAX_RETRIES) {
        await sleep(retryDelay(attempt, response.headers.get("retry-after")));
        continue;
      }
      throw providerReadError(response.status, parsed);
    } catch (error) {
      if (attempt >= MAX_RETRIES || (error instanceof Error && error.message.startsWith("Mailchimp read failed"))) {
        throw error;
      }
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

function transactionalMessageId(message: UnknownRecord): string {
  return textValue(message._id) ?? sha256(stableJson(message));
}

function transactionalRecord(
  client: MailchimpClient,
  message: UnknownRecord,
): AdapterInboundRecord {
  const messageId = transactionalMessageId(message);
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

function exportRowRecipientHash(row: UnknownRecord): string | undefined {
  return normalizedEmailHash(row["Email Address"] ?? row.email);
}

function exportRowSubject(row: UnknownRecord): string | undefined {
  return textValue(row.Subject) ?? textValue(row.subject);
}

// A search message and an export row describe the same provider message, but the export
// CSV carries no provider id. Correlate them the way the activity view does: the send
// second, the recipient, and the subject.
function transactionalCorrelationKey(
  timestampMs: number,
  recipientHash: string | undefined,
  subject: string | undefined,
): string {
  return stableJson([Math.floor(timestampMs / 1000), recipientHash ?? null, subject ?? null]);
}

function transactionalExportRecord(
  client: MailchimpClient,
  row: UnknownRecord,
  exportId: string,
  providerMessageRef: string,
): AdapterInboundRecord {
  const recipientHash = exportRowRecipientHash(row);
  const sanitized = withoutFields(row, ["Email Address", "email"]);
  const subject = exportRowSubject(row) ?? "Mailchimp Transactional message";
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

// The provider message ref an export row lands under. A row that carries the provider
// message id shares its identity with the search path (transactional:<id>), so the two
// reads dedupe by provider record id; rows without one get a stable export identity.
function transactionalExportMessageRef(
  row: UnknownRecord,
  recipientHash: string | undefined,
  duplicateOrdinal: number,
): string {
  const providerMessageId = [
    row["Message ID"], row["Message Id"], row.message_id, row._id, row.id,
  ].map(textValue).find(Boolean);
  if (providerMessageId) return providerMessageId;
  const metadata = asRecord(row.Metadata ?? row.metadata ?? row["Custom Metadata"]);
  const moonSleepMessageRef = [
    metadata.moonsleep_message_ref,
    metadata.moonsleep_communication_ref,
    metadata.message_ref,
  ].map(textValue).find(Boolean);
  if (moonSleepMessageRef) {
    return `export:${sha256(stableJson({ moonSleepMessageRef }))}`;
  }
  // Historical exports may not carry a provider id. Exclude mutable delivery
  // fields so sent/delivered/bounced revisions converge on one record identity.
  const identity = {
    timestamp: textValue(row.Date) ?? textValue(row.date) ?? null,
    recipientHash: recipientHash ?? null,
    subject: exportRowSubject(row) ?? null,
    sender: textValue(row.Sender) ?? textValue(row.sender) ?? textValue(row.From) ?? null,
    template: textValue(row.Template) ?? textValue(row.template) ?? null,
    tags: row.Tags ?? row.tags ?? null,
    duplicateOrdinal,
  };
  return `export:${sha256(stableJson(identity))}`;
}

function compareCampaigns(left: UnknownRecord, right: UnknownRecord): number {
  return campaignTimestamp(left) - campaignTimestamp(right)
    || (textValue(left.id) ?? "").localeCompare(textValue(right.id) ?? "");
}

// Sent campaigns in the window, oldest first. The listing starts one second early:
// Mailchimp send times are second-precise and a resumed run passes the last imported
// record's timestamp as `since`, so a campaign whose send second equals it is read
// again (its records dedupe by identity) instead of being lost to an exclusive bound.
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
      since_send_time: new Date(since.getTime() - 1000).toISOString(),
      before_send_time: to?.toISOString(),
      status: "sent",
      fields: "campaigns.id,campaigns.type,campaigns.create_time,campaigns.send_time,campaigns.status,campaigns.emails_sent,campaigns.recipients.list_id,campaigns.recipients.recipient_count,campaigns.settings.subject_line,campaigns.settings.preview_text,campaigns.settings.title,campaigns.settings.from_name,campaigns.settings.reply_to,campaigns.delivery_status,total_items",
    }));
    const campaigns = asArray(page.campaigns).map(asRecord);
    rows.push(...campaigns);
    if (campaigns.length < MAX_PAGE_SIZE) break;
  }
  return rows.sort(compareCampaigns);
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

type ExportDateBounds = { date_from: string; date_to: string };

// The export takes second-precision UTC bounds; align them to the whole days the
// day-granular search covers so both reads describe one provider window.
function exportDateBounds(since: Date, to: Date): ExportDateBounds {
  return {
    date_from: `${since.toISOString().slice(0, 10)} 00:00:00`,
    date_to: `${to.toISOString().slice(0, 10)} 23:59:59`,
  };
}

function exportCheckpointPath(client: MailchimpClient, bounds: ExportDateBounds): string {
  const stateDir = requiredAdapterStateDir();
  const name = sha256(`${client.connectionId}\n${bounds.date_from}\n${bounds.date_to}`);
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
  const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("Mailchimp export URL must use HTTPS");
  }
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

type TransactionalExportStats = {
  exportId: string;
  rowCount: number;
  emittedCount: number;
  deduplicatedCount: number;
  searchMatchedCount: number;
  oldestRowAt: string | null;
  newestRowAt: string | null;
};

// Pull the provider's activity export for the window and emit one record per row.
// `searchIds` maps correlation keys to the provider message ids a search of the same
// window returned, so rows the search also saw land under the search identity; every
// emitted provider record id is added to `emittedIds` and never emitted twice.
async function exportTransactionalHistory(
  client: MailchimpClient,
  since: Date,
  to: Date,
  emit: (record: AdapterInboundRecord) => void,
  options: { searchIds?: Map<string, string[]>; emittedIds?: Set<string>; coverage?: { minimumRows: number; reason: string } } = {},
): Promise<TransactionalExportStats> {
  const bounds = exportDateBounds(since, to);
  const checkpointPath = exportCheckpointPath(client, bounds);
  const startExport = async (): Promise<ExportCheckpoint> => {
    const started = asRecord(await transactionalPost(client, "/exports/activity.json", bounds));
    const exportId = textValue(started.id);
    if (!exportId) throw new Error("Mailchimp Transactional export did not return an id");
    const checkpoint = { export_id: exportId, since: bounds.date_from, to: bounds.date_to };
    writeExportCheckpoint(checkpointPath, checkpoint);
    return checkpoint;
  };
  let checkpoint = readExportCheckpoint(checkpointPath);
  if (checkpoint) {
    // A checkpointed export the provider no longer knows (expired or purged) would
    // otherwise block this window forever; start one fresh export in its place.
    try {
      await transactionalPost(client, "/exports/info.json", { id: checkpoint.export_id });
    } catch (error) {
      if (!(error instanceof Error && error.message.includes("Unknown_Export"))) throw error;
      unlinkSync(checkpointPath);
      checkpoint = undefined;
    }
  }
  checkpoint ??= await startExport();

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
  if (options.coverage && rows.length < options.coverage.minimumRows) {
    throw new Error(
      `Mailchimp Transactional export does not cover the window (${options.coverage.reason}): the export returned ${rows.length} rows but the search found ${options.coverage.minimumRows} messages, so the provider's export retention no longer reaches this window`,
    );
  }
  const searchIds = new Map([...(options.searchIds ?? [])].map(([key, ids]) => [key, [...ids]]));
  const emittedIds = options.emittedIds ?? new Set<string>();
  const duplicateCounts = new Map<string, number>();
  const timestamps: number[] = [];
  let emittedCount = 0;
  let deduplicatedCount = 0;
  let searchMatchedCount = 0;
  for (const raw of rows) {
    const row = asRecord(raw);
    const recipientHash = exportRowRecipientHash(row);
    const timestamp = exportTimestamp(row);
    timestamps.push(timestamp);
    const correlated = searchIds
      .get(transactionalCorrelationKey(timestamp, recipientHash, exportRowSubject(row)))
      ?.shift();
    if (correlated) searchMatchedCount += 1;
    const identity = stableJson({ sanitized: withoutFields(row, ["Email Address", "email"]), recipientHash });
    const ordinal = duplicateCounts.get(identity) ?? 0;
    duplicateCounts.set(identity, ordinal + 1);
    const record = transactionalExportRecord(
      client,
      row,
      checkpoint.export_id,
      correlated ?? transactionalExportMessageRef(row, recipientHash, ordinal),
    );
    if (emittedIds.has(record.payload.external_record_id)) {
      deduplicatedCount += 1;
      continue;
    }
    emittedIds.add(record.payload.external_record_id);
    emit(record);
    emittedCount += 1;
  }
  return {
    exportId: checkpoint.export_id,
    rowCount: rows.length,
    emittedCount,
    deduplicatedCount,
    searchMatchedCount,
    oldestRowAt: timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : null,
    newestRowAt: timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null,
  };
}

type TransactionalSearch = {
  records: Map<string, AdapterInboundRecord>;
  correlationIds: Map<string, string[]>;
  candidateCount: number;
  capObserved: boolean;
  oldestMessageAt: string | null;
  newestMessageAt: string | null;
};

// One capped, day-granular read of messages/search. Records are keyed by provider
// record id; `correlationIds` lets an export of the same window reuse these identities.
async function searchTransactional(
  client: MailchimpClient,
  since: Date,
  to: Date,
): Promise<TransactionalSearch> {
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
  const correlationIds = new Map<string, string[]>();
  const timestamps: number[] = [];
  for (const message of messages) {
    const record = transactionalRecord(client, message);
    timestamps.push(record.payload.timestamp);
    records.set(record.payload.external_record_id, record);
    const key = transactionalCorrelationKey(
      record.payload.timestamp,
      normalizedEmailHash(message.email),
      textValue(message.subject),
    );
    correlationIds.set(key, [...(correlationIds.get(key) ?? []), transactionalMessageId(message)]);
  }
  return {
    records,
    correlationIds,
    candidateCount: messages.length,
    capObserved: messages.length >= TRANSACTIONAL_SEARCH_LIMIT,
    oldestMessageAt: timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : null,
    newestMessageAt: timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null,
  };
}

type TransactionalIngestStats = {
  source: "search" | "export";
  exportReason: "search_cap" | "beyond_search_horizon" | null;
  exportId: string | null;
  capObserved: boolean;
  continuityProven: boolean;
  historicalGapDetected: boolean;
  searchCandidateCount: number;
  exportRowCount: number;
  exportSearchMatchedCount: number;
  emittedCount: number;
  deduplicatedCount: number;
  oldestMessageAt: string | null;
  newestMessageAt: string | null;
};

function searchIngestStats(
  search: TransactionalSearch,
  flags: { continuityProven: boolean; historicalGapDetected: boolean },
): TransactionalIngestStats {
  return {
    source: "search",
    exportReason: null,
    exportId: null,
    capObserved: search.capObserved,
    ...flags,
    searchCandidateCount: search.candidateCount,
    exportRowCount: 0,
    exportSearchMatchedCount: 0,
    emittedCount: search.records.size,
    deduplicatedCount: search.candidateCount - search.records.size,
    oldestMessageAt: search.oldestMessageAt,
    newestMessageAt: search.newestMessageAt,
  };
}

// The monitor's current tail. A capped read is admitted only when it still overlaps
// the durable cursor; a first run without a cursor records the inaccessible portion
// of the provider window as historical debt instead of claiming completeness.
async function searchTransactionalTail(
  client: MailchimpClient,
  since: Date,
  to: Date,
  emit: (record: AdapterInboundRecord) => void,
  continuityFloor?: Date,
): Promise<TransactionalIngestStats> {
  const search = await searchTransactional(client, since, to);
  const oldest = search.oldestMessageAt === null ? null : Date.parse(search.oldestMessageAt);
  let continuityProven = !search.capObserved;
  let historicalGapDetected = false;
  if (search.capObserved && continuityFloor) {
    continuityProven = oldest !== null && oldest <= continuityFloor.getTime();
    if (!continuityProven) {
      throw new Error("Mailchimp Transactional capped tail no longer overlaps the durable cursor");
    }
  } else if (search.capObserved) {
    historicalGapDetected = true;
  }
  for (const record of search.records.values()) emit(record);
  return searchIngestStats(search, { continuityProven, historicalGapDetected });
}

function transactionalSearchHorizonDays(client: MailchimpClient): number {
  return positiveNumber(
    runtimeConfigFromClient(client).transactional_search_horizon_days,
    DEFAULT_TRANSACTIONAL_SEARCH_HORIZON_DAYS,
    90,
  );
}

function withinTransactionalSearchHorizon(client: MailchimpClient, since: Date): boolean {
  return since.getTime() >= Date.now() - transactionalSearchHorizonDays(client) * DAY_MS;
}

// An explicit backfill promises historical coverage. The search vouches for a window
// only when it is uncapped and inside the search horizon; otherwise the activity export
// is the authority, and a window the export cannot cover fails closed before any
// export row is emitted.
async function ingestTransactionalHistory(
  client: MailchimpClient,
  since: Date,
  to: Date,
  emit: (record: AdapterInboundRecord) => void,
  emittedIds: Set<string>,
): Promise<TransactionalIngestStats> {
  const search = await searchTransactional(client, since, to);
  if (!search.capObserved && withinTransactionalSearchHorizon(client, since)) {
    for (const record of search.records.values()) {
      emittedIds.add(record.payload.external_record_id);
      emit(record);
    }
    return searchIngestStats(search, { continuityProven: true, historicalGapDetected: false });
  }
  const exportReason = search.capObserved ? "search_cap" : "beyond_search_horizon";
  // Nothing from the export is emitted unless it covers at least what the search saw.
  const exported = await exportTransactionalHistory(client, since, to, emit, {
    searchIds: search.correlationIds,
    emittedIds,
    coverage: { minimumRows: search.candidateCount, reason: exportReason },
  });
  return {
    source: "export",
    exportReason,
    exportId: exported.exportId,
    capObserved: search.capObserved,
    continuityProven: true,
    historicalGapDetected: false,
    searchCandidateCount: search.candidateCount,
    exportRowCount: exported.rowCount,
    exportSearchMatchedCount: exported.searchMatchedCount,
    emittedCount: exported.emittedCount,
    deduplicatedCount: exported.deduplicatedCount,
    oldestMessageAt: exported.oldestRowAt,
    newestMessageAt: exported.newestRowAt,
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

type IngestMode =
  | { kind: "backfill"; transport?: "stream" | "staged"; receiptFields?: () => UnknownRecord }
  | { kind: "monitor"; continuityFloor?: Date };

function transactionalReceiptFields(
  client: MailchimpClient,
  stats: TransactionalIngestStats | undefined,
): UnknownRecord {
  return {
    transactional_source: stats?.source ?? null,
    transactional_export_reason: stats?.exportReason ?? null,
    transactional_export_id: stats?.exportId ?? null,
    transactional_search_horizon_days: transactionalSearchHorizonDays(client),
    transactional_search_cap_observed: stats?.capObserved ?? false,
    transactional_tail_continuity_proven: stats?.continuityProven ?? false,
    transactional_historical_gap_detected: stats?.historicalGapDetected ?? false,
    transactional_search_candidate_count: stats?.searchCandidateCount ?? 0,
    transactional_export_row_count: stats?.exportRowCount ?? 0,
    transactional_export_search_matched_count: stats?.exportSearchMatchedCount ?? 0,
    transactional_oldest_message_at: stats?.oldestMessageAt ?? null,
    transactional_newest_message_at: stats?.newestMessageAt ?? null,
    transactional_emitted_count: stats?.emittedCount ?? 0,
    transactional_deduplicated_count: stats?.deduplicatedCount ?? 0,
  };
}

async function ingestWindow(
  client: MailchimpClient,
  args: Omit<AdapterBackfillWindow, "connection_id">,
  emit: (record: AdapterInboundRecord) => void,
  mode: IngestMode,
): Promise<void> {
  // Establish durable state custody before contacting either provider API. A
  // run without checkpoint/cursor/receipt storage is not an admissible ingest.
  requiredAdapterStateDir();
  const startedAt = new Date().toISOString();
  const to = args.to ?? new Date();
  const outputIdentities: string[] = [];
  const counts = { campaigns: 0, campaign_records: 0, recipient_records: 0, total: 0 };
  let transactional: TransactionalIngestStats | undefined;
  const trackedEmit = (record: AdapterInboundRecord) => {
    outputIdentities.push(stableJson([
      record.payload.external_record_id,
      record.payload.metadata?.revision_hash ?? null,
    ]));
    counts.total += 1;
    emit(record);
  };
  const receipt = (result: "succeeded" | "failed", extra: UnknownRecord = {}) =>
    writeSanitizedIngestReceipt(client, {
      contract_version: "nexus_mailchimp_ingestion_run_v3",
      result,
      mode: mode.kind,
      transport: mode.kind === "backfill" && mode.transport === "staged" ? "staged" : "stream",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      window_since: args.since.toISOString(),
      window_through: to.toISOString(),
      campaign_count: counts.campaigns,
      campaign_record_count: counts.campaign_records,
      recipient_record_count: counts.recipient_records,
      ...transactionalReceiptFields(client, transactional),
      total_emitted_count: counts.total,
      output_digest: sha256(stableJson(outputIdentities.sort())),
      ...(mode.kind === "backfill" ? mode.receiptFields?.() ?? {} : {}),
      ...extra,
    });
  try {
    // Records leave in non-decreasing timestamp order: the Transactional history is read
    // first (it fails closed before anything is emitted when the export cannot cover the
    // window) and merged into the campaigns, oldest first, so a run the runtime resumes
    // from the last imported record's timestamp continues exactly where it stopped.
    const transactionalRecords: AdapterInboundRecord[] = [];
    const collect = (record: AdapterInboundRecord) => {
      transactionalRecords.push(record);
    };
    transactional = mode.kind === "monitor"
      ? await searchTransactionalTail(client, args.since, to, collect, mode.continuityFloor)
      : await ingestTransactionalHistory(client, args.since, to, collect, new Set());
    transactionalRecords.sort((left, right) => left.payload.timestamp - right.payload.timestamp);
    let nextTransactional = 0;
    const emitTransactionalThrough = (timestamp: number) => {
      while (
        nextTransactional < transactionalRecords.length
        && transactionalRecords[nextTransactional]!.payload.timestamp <= timestamp
      ) {
        trackedEmit(transactionalRecords[nextTransactional]!);
        nextTransactional += 1;
      }
    };
    const campaigns = await listAllCampaigns(client, args.since, to);
    for (const campaign of campaigns) {
      const campaignId = textValue(campaign.id);
      if (!campaignId) continue;
      emitTransactionalThrough(campaignTimestamp(campaign));
      counts.campaigns += 1;
      const content = asRecord(await marketingGet(client, `/campaigns/${encodeURIComponent(campaignId)}/content`));
      trackedEmit(marketingCampaignRecord(client, campaign, content));
      counts.campaign_records += 1;
      await emitCampaignActivity(client, campaignId, (activity) => {
        trackedEmit(marketingRecipientRecord(client, campaign, activity));
        counts.recipient_records += 1;
      });
    }
    emitTransactionalThrough(Number.POSITIVE_INFINITY);
    receipt("succeeded");
  } catch (error) {
    receipt("failed", { error_class: error instanceof Error ? error.name : "UnknownError" });
    throw error;
  }
}

type StagedChunk = {
  path: string;
  records: number;
  first_record_id: string | null;
  last_record_id: string | null;
  first_timestamp_ms: number | null;
  last_timestamp_ms: number | null;
};

// The runtime's staged backfill manifest (version 1, `jsonl_files`): chunk files of the
// JSON lines records.backfill streams, imported chunk by chunk by the runtime's worker.
// `mailchimp` is this adapter's progress cursor for operators and is ignored by the runtime.
type StagedManifest = {
  version: 1;
  format: "jsonl_files";
  stage_dir: string;
  manifest_path: string;
  chunks: StagedChunk[];
  totals: { records: number };
  mailchimp: {
    window: { since: string; to: string };
    chunk_records: number;
    complete: boolean;
    cursor: { last_record_id: string | null; last_timestamp_ms: number | null; campaign_id: string | null };
  };
};

// Writes a window's records as JSONL chunk files under the stage directory and keeps
// manifest.json current. A chunk is listed only once it is closed, so the runtime can
// import chunks while the rest of the window is still being staged; every manifest
// write is atomic (temporary file, rename).
class StagedChunkWriter {
  private readonly manifest: StagedManifest;
  private descriptor: number | null = null;
  private openChunk: StagedChunk | null = null;
  private chunkIndex = 0;

  constructor(stageDir: string, window: { since: Date; to: Date }, private readonly chunkRecords: number) {
    this.manifest = {
      version: 1,
      format: "jsonl_files",
      stage_dir: stageDir,
      manifest_path: join(stageDir, "manifest.json"),
      chunks: [],
      totals: { records: 0 },
      mailchimp: {
        window: { since: window.since.toISOString(), to: window.to.toISOString() },
        chunk_records: chunkRecords,
        complete: false,
        cursor: { last_record_id: null, last_timestamp_ms: null, campaign_id: null },
      },
    };
  }

  readonly write = (record: AdapterInboundRecord): void => {
    if (this.descriptor === null) {
      const path = join(this.manifest.stage_dir, `chunk-${String(this.chunkIndex).padStart(5, "0")}.jsonl`);
      this.chunkIndex += 1;
      this.descriptor = openSync(path, "wx", 0o600);
      this.openChunk = {
        path,
        records: 0,
        first_record_id: null,
        last_record_id: null,
        first_timestamp_ms: null,
        last_timestamp_ms: null,
      };
    }
    writeSync(this.descriptor, `${JSON.stringify(record)}\n`);
    const chunk = this.openChunk!;
    const recordId = record.payload.external_record_id;
    const timestamp = record.payload.timestamp;
    chunk.records += 1;
    chunk.first_record_id ??= recordId;
    chunk.last_record_id = recordId;
    chunk.first_timestamp_ms = chunk.first_timestamp_ms === null ? timestamp : Math.min(chunk.first_timestamp_ms, timestamp);
    chunk.last_timestamp_ms = chunk.last_timestamp_ms === null ? timestamp : Math.max(chunk.last_timestamp_ms, timestamp);
    this.manifest.mailchimp.cursor = {
      last_record_id: recordId,
      last_timestamp_ms: timestamp,
      campaign_id: textValue(record.payload.metadata?.provider_campaign_id) ?? null,
    };
    if (chunk.records >= this.chunkRecords) this.closeChunk();
  };

  chunkCount(): number {
    return this.manifest.chunks.length + (this.openChunk ? 1 : 0);
  }

  // Closes the open chunk and writes the final manifest.
  finish(): StagedManifest {
    this.closeChunk();
    this.manifest.mailchimp.complete = true;
    this.writeManifest();
    return this.manifest;
  }

  // A failed window keeps the manifest truthful: the chunks it closed stay listed (the
  // runtime may have imported them already; a rerun dedupes by identity) and the partial
  // chunk is closed but never listed.
  abandon(): void {
    if (this.descriptor !== null) {
      closeSync(this.descriptor);
      this.descriptor = null;
      this.openChunk = null;
    }
    this.writeManifest();
  }

  private closeChunk(): void {
    if (this.descriptor === null || !this.openChunk) return;
    closeSync(this.descriptor);
    this.descriptor = null;
    this.manifest.chunks.push(this.openChunk);
    this.openChunk = null;
    this.writeManifest();
  }

  private writeManifest(): void {
    this.manifest.totals.records = this.manifest.chunks.reduce((total, chunk) => total + chunk.records, 0);
    const temporary = `${this.manifest.manifest_path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(this.manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    renameSync(temporary, this.manifest.manifest_path);
  }
}

function resolveStageDir(value: unknown): string {
  const configured = textValue(value);
  if (!configured) return mkdtempSync(join(tmpdir(), "mailchimp-backfill-stage-"));
  const stageDir = resolve(configured);
  mkdirSync(stageDir, { recursive: true, mode: 0o700 });
  if (readdirSync(stageDir).length > 0) throw new Error("stage_dir must be an empty directory");
  return stageDir;
}

// records.backfill.stage: the records an explicit backfill window would stream, written
// as chunk files with a manifest for the runtime's worker-side historical import. Same
// reads, identities, order and receipt as records.backfill; the manifest is the result.
async function stageBackfillWindow(client: MailchimpClient, payload: UnknownRecord): Promise<StagedManifest> {
  const since = parseIsoDate(payload.since, "since");
  const to = payload.to === undefined ? new Date() : parseIsoDate(payload.to, "to");
  if (to.getTime() <= since.getTime()) throw new Error("to must be later than since");
  const chunkRecords = positiveNumber(
    runtimeConfigFromClient(client).backfill_stage_chunk_records,
    DEFAULT_STAGE_CHUNK_RECORDS,
    MAX_STAGE_CHUNK_RECORDS,
  );
  const writer = new StagedChunkWriter(resolveStageDir(payload.stage_dir), { since, to }, chunkRecords);
  try {
    await ingestWindow(client, { since, to }, writer.write, {
      kind: "backfill",
      transport: "staged",
      receiptFields: () => ({ stage_chunk_records: chunkRecords, stage_chunk_count: writer.chunkCount() }),
    });
  } catch (error) {
    writer.abandon();
    throw error;
  }
  return writer.finish();
}

function parseIsoDate(value: unknown, name: string): Date {
  const parsed = Date.parse(textValue(value) ?? "");
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be an ISO 8601 date`);
  return new Date(parsed);
}

// Read-only plan for an explicit backfill window: the sent campaigns, the record and
// read-call estimates, and the Transactional path the window would take. It never
// creates an export and writes no state.
async function planBackfillWindow(client: MailchimpClient, payload: UnknownRecord): Promise<UnknownRecord> {
  const since = parseIsoDate(payload.since, "since");
  const to = payload.to === undefined ? new Date() : parseIsoDate(payload.to, "to");
  if (to.getTime() <= since.getTime()) throw new Error("to must be later than since");
  const campaigns = (await listAllCampaigns(client, since, to)).map((campaign) => {
    const emailsSent = Math.max(
      0,
      Math.floor(Number(campaign.emails_sent) || Number(asRecord(campaign.recipients).recipient_count) || 0),
    );
    return {
      id: textValue(campaign.id) ?? "unknown-campaign",
      send_time: textValue(campaign.send_time) ?? null,
      subject: textValue(asRecord(campaign.settings).subject_line) ?? null,
      emails_sent: emailsSent,
      record_count: 1 + emailsSent,
      read_calls: 1 + Math.max(1, Math.ceil(emailsSent / MAX_PAGE_SIZE)),
    };
  });
  const search = await searchTransactional(client, since, to);
  const withinHorizon = withinTransactionalSearchHorizon(client, since);
  const useExport = search.capObserved || !withinHorizon;
  const sum = (key: "record_count" | "read_calls") =>
    campaigns.reduce((total, campaign) => total + campaign[key], 0);
  return {
    window: { since: since.toISOString(), to: to.toISOString() },
    campaign_count: campaigns.length,
    campaigns,
    estimated_record_count: sum("record_count") + search.records.size,
    estimated_read_calls:
      Math.max(1, Math.ceil(campaigns.length / MAX_PAGE_SIZE)) + sum("read_calls") + 1 + (useExport ? 3 : 0),
    transactional: {
      path: useExport ? "export" : "search",
      export_reason: useExport ? (search.capObserved ? "search_cap" : "beyond_search_horizon") : null,
      search_candidate_count: search.candidateCount,
      search_cap_observed: search.capObserved,
      search_horizon_days: transactionalSearchHorizonDays(client),
      within_search_horizon: withinHorizon,
      oldest_message_at: search.oldestMessageAt,
      newest_message_at: search.newestMessageAt,
      export_window: useExport ? exportDateBounds(since, to) : null,
      export_requested: false,
    },
    mutates_remote: false,
  };
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
      kind: "monitor",
      ...(cursor ? { continuityFloor: since } : {}),
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
  transactionalExportMessageRef,
  transactionalDeliveryState,
  searchTransactional,
  searchTransactionalTail,
  exportTransactionalHistory,
  exportDateBounds,
  ingestWindow,
  planBackfillWindow,
  stageBackfillWindow,
  connectionIdentity,
  health,
};

export const mailchimpAdapter = defineAdapter<MailchimpClient>({
  platform: PLATFORM,
  name: "nexus-mailchimp-readonly-adapter",
  version: "0.2.3",
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
    backfill: async (ctx, args, emit) =>
      await ingestWindow(requireClient(ctx), args, emit, { kind: "backfill" }),
    monitor,
  },
  methods: {
    "records.backfill.stage": method({
      description: "Stage an explicit backfill window for the runtime's worker-side historical import: the records records.backfill would stream, written as JSONL chunk files with a manifest under stage_dir. Same reads, identities and receipt; creates the Transactional export when the window needs it.",
      action: "read",
      connection_required: true,
      mutates_remote: false,
      params: {
        since: "ISO lower bound (campaign send time)",
        to: "ISO upper bound; defaults to now",
        stage_dir: "Empty directory for the chunk files and manifest.json; a temporary directory when omitted",
      },
      response: { manifest: "The staged backfill manifest (version 1, jsonl_files): chunks, totals, and the mailchimp progress cursor" },
      handler: async (ctx, req) => await stageBackfillWindow(requireClient(ctx), payloadRecord(req)),
    }),
    "mailchimp.backfill.plan": method({
      description: "Plan an explicit backfill window without pulling records: the sent campaigns, the record and read-call estimates, and whether Transactional history would come from the recent search or the activity export.",
      action: "read",
      connection_required: true,
      mutates_remote: false,
      params: { since: "ISO lower bound (campaign send time)", to: "ISO upper bound; defaults to now" },
      response: { campaigns: "Sent campaigns in the window", transactional: "Transactional path decision" },
      handler: async (ctx, req) => await planBackfillWindow(requireClient(ctx), payloadRecord(req)),
    }),
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

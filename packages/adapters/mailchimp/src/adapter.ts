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
const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;
const DEFAULT_EXPORT_POLL_MS = 5_000;
const DEFAULT_EXPORT_WAIT_MS = 15 * 60 * 1000;
const MAX_EXPORT_BYTES = 512 * 1024 * 1024;
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
  const stableIdentity = sha256(stableJson({ row: sanitized, recipientHash, duplicateOrdinal }));
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

function exportCheckpointPath(client: MailchimpClient, since: Date, to: Date): string | undefined {
  const stateDir = adapterStateDir();
  if (!stateDir) return undefined;
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
): Promise<void> {
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
  for (const row of rows) {
    const sanitized = withoutFields(asRecord(row), ["Email Address", "email"]);
    const identity = stableJson({ sanitized, recipientHash: normalizedEmailHash(row["Email Address"] ?? row.email) });
    const ordinal = duplicateCounts.get(identity) ?? 0;
    duplicateCounts.set(identity, ordinal + 1);
    emit(transactionalExportRecord(client, asRecord(row), checkpoint.export_id, ordinal));
  }
}

async function searchRecentTransactional(
  client: MailchimpClient,
  since: Date,
  to: Date,
  emit: (record: AdapterInboundRecord) => void,
): Promise<void> {
  const messages = asArray(await transactionalPost(client, "/messages/search.json", {
    date_from: since.toISOString().slice(0, 10),
    date_to: to.toISOString().slice(0, 10),
    limit: 1000,
  })).map(asRecord);
  if (messages.length >= 1000) {
    throw new Error("Mailchimp Transactional recent search reached its 1000-message completeness cap");
  }
  for (const message of messages) emit(transactionalRecord(client, message));
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
    const content = asRecord(await marketingGet(client, `/campaigns/${encodeURIComponent(campaignId)}/content`));
    emit(marketingCampaignRecord(client, campaign, content));
    await emitCampaignActivity(client, campaignId, (activity) => {
      emit(marketingRecipientRecord(client, campaign, activity));
    });
  }
  const to = args.to ?? new Date();
  const useExport = to.getTime() - args.since.getTime() > 7 * 24 * 60 * 60 * 1000;
  if (useExport) {
    // Mailchimp's recent-search surface carries the provider message id while
    // activity exports do not. Keep the newest seven days on recent search so
    // the periodic overlap monitor reuses the same stable identity instead of
    // producing a second observation for an exported row.
    const recentBoundary = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    await exportTransactionalHistory(client, args.since, recentBoundary, emit);
    await searchRecentTransactional(client, recentBoundary, to, emit);
  } else {
    await searchRecentTransactional(client, args.since, to, emit);
  }
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
  marketingCampaignRecord,
  marketingRecipientRecord,
  marketingDeliveryState,
  transactionalRecord,
  transactionalExportRecord,
  transactionalDeliveryState,
};

export const mailchimpAdapter = defineAdapter<MailchimpClient>({
  platform: PLATFORM,
  name: "nexus-mailchimp-readonly-adapter",
  version: "0.2.0",
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

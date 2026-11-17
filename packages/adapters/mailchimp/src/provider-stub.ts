// A recorded-fixture stand-in for the Mailchimp Marketing and Transactional APIs. It
// serves exactly the reads the adapter makes (campaign list, content, recipient
// activity, message search, activity export) so ingestion can be proven end to end
// without credentials. Used by the unit tests and, as a standalone process, by lab
// rehearsals; it is not part of the shipped bundle.
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";
import { strToU8, zipSync } from "fflate";

export type StubCampaign = {
  id: string;
  send_time: string;
  subject: string;
  create_time?: string;
  content?: { plain_text?: string; html?: string };
  recipients: Array<{ email_id: string; email_address: string; activity?: unknown[] }>;
};

export type StubMessage = Record<string, unknown> & {
  _id: string;
  ts: number;
  email: string;
  subject: string;
  state: string;
};

export type StubFixture = {
  campaigns: StubCampaign[];
  messages: StubMessage[];
  // messages/search only sees messages newer than this many days (undefined = all).
  search?: { horizon_days?: number };
  export?: {
    // Add a "Message ID" column to activity.csv (Mailchimp's documented export has none).
    message_id_column?: boolean;
    // Keep only the newest N rows in the export, simulating expired retention.
    retained_rows?: number;
    // Report the export as pending for this many info polls before completing.
    pending_polls?: number;
  };
};

export type ProviderStub = {
  marketingBaseUrl: string;
  transactionalBaseUrl: string;
  calls: string[];
  close: () => Promise<void>;
};

const DAY_SECONDS = 24 * 60 * 60;

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      resolve(text ? (JSON.parse(text) as Record<string, unknown>) : {});
    });
  });
}

function campaignObject(campaign: StubCampaign) {
  return {
    id: campaign.id,
    type: "regular",
    status: "sent",
    create_time: campaign.create_time ?? campaign.send_time,
    send_time: campaign.send_time,
    emails_sent: campaign.recipients.length,
    recipients: { list_id: "stub-list", recipient_count: campaign.recipients.length },
    settings: {
      subject_line: campaign.subject,
      title: campaign.subject,
      from_name: "Casey at MoonSleep",
      reply_to: "casey@moonsleep.co",
    },
    delivery_status: { status: "delivered", enabled: true, can_cancel: false },
  };
}

function page<T>(rows: T[], query: URLSearchParams): T[] {
  const count = Math.max(1, Number(query.get("count")) || 10);
  const offset = Math.max(0, Number(query.get("offset")) || 0);
  return rows.slice(offset, offset + count);
}

function dayBounds(from: unknown, to: unknown): { from: number; to: number } {
  const parse = (value: unknown, fallback: number) => {
    const text = String(value ?? "").trim();
    if (!text) return fallback;
    const iso = /^\d{4}-\d{2}-\d{2}$/u.test(text) ? `${text}T00:00:00Z` : `${text.replace(" ", "T")}Z`;
    const parsed = Date.parse(iso);
    return Number.isFinite(parsed) ? parsed / 1000 : fallback;
  };
  const fromSeconds = parse(from, 0);
  const toText = String(to ?? "").trim();
  const toSeconds = /^\d{4}-\d{2}-\d{2}$/u.test(toText)
    ? parse(toText, Number.MAX_SAFE_INTEGER) + DAY_SECONDS - 1
    : parse(to, Number.MAX_SAFE_INTEGER);
  return { from: fromSeconds, to: toSeconds };
}

// Mailchimp Transactional reports application errors as HTTP 500 with this body.
function mandrillError(name: string, message: string) {
  return { status: "error", code: -1, name, message };
}

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function activityCsv(messages: StubMessage[], withMessageId: boolean): string {
  const header = [
    ...(withMessageId ? ["Message ID"] : []),
    "Date", "Email Address", "Sender", "Subject", "Status", "Tags", "Opens", "Clicks", "Bounce Detail",
  ];
  const rows = messages.map((message) => [
    ...(withMessageId ? [message._id] : []),
    new Date(message.ts * 1000).toISOString().replace("T", " ").slice(0, 19),
    message.email,
    message.sender ?? "casey@moonsleep.co",
    message.subject,
    message.state,
    Array.isArray(message.tags) ? message.tags.join(", ") : "",
    message.opens ?? 0,
    message.clicks ?? 0,
    message.bounce_detail ?? "",
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export async function startProviderStub(fixture: StubFixture, port = 0): Promise<ProviderStub> {
  const calls: string[] = [];
  const exports = new Map<string, { from: number; to: number; polls: number }>();
  let origin = "";
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", origin);
    const method = request.method ?? "GET";
    calls.push(`${method} ${url.pathname}`);
    const marketing = url.pathname.match(/^\/3\.0\/(.*)$/u)?.[1];
    const transactional = url.pathname.match(/^\/api\/1\.0\/(.*)$/u)?.[1];
    try {
      if (method === "GET" && marketing === "ping") return json(response, 200, { health_status: "Everything's Chimpy!" });
      if (method === "GET" && marketing === "campaigns") {
        const since = Date.parse(url.searchParams.get("since_send_time") ?? "") || 0;
        const before = Date.parse(url.searchParams.get("before_send_time") ?? "") || Number.MAX_SAFE_INTEGER;
        const rows = fixture.campaigns
          .filter((campaign) => Date.parse(campaign.send_time) >= since && Date.parse(campaign.send_time) < before)
          .sort((left, right) => Date.parse(left.send_time) - Date.parse(right.send_time))
          .map(campaignObject);
        return json(response, 200, { campaigns: page(rows, url.searchParams), total_items: rows.length });
      }
      const content = marketing?.match(/^campaigns\/([^/]+)\/content$/u)?.[1];
      if (method === "GET" && content) {
        const campaign = fixture.campaigns.find((row) => row.id === decodeURIComponent(content));
        if (!campaign) return json(response, 404, { detail: "campaign not found" });
        return json(response, 200, {
          plain_text: campaign.content?.plain_text ?? `Campaign ${campaign.id} plain text`,
          html: campaign.content?.html ?? `<p>Campaign ${campaign.id}</p>`,
        });
      }
      const activity = marketing?.match(/^reports\/([^/]+)\/email-activity$/u)?.[1];
      if (method === "GET" && activity) {
        const campaign = fixture.campaigns.find((row) => row.id === decodeURIComponent(activity));
        if (!campaign) return json(response, 404, { detail: "campaign not found" });
        const rows = campaign.recipients.map((recipient) => ({
          email_id: recipient.email_id,
          email_address: recipient.email_address,
          activity: recipient.activity ?? [{ action: "sent", timestamp: campaign.send_time }],
        }));
        return json(response, 200, { emails: page(rows, url.searchParams), total_items: rows.length });
      }
      if (method === "POST" && transactional === "users/ping2.json") return json(response, 200, { PING: "PONG!" });
      if (method === "POST" && transactional === "messages/search.json") {
        const body = await readBody(request);
        const bounds = dayBounds(body.date_from, body.date_to);
        const horizonDays = fixture.search?.horizon_days;
        const floor = horizonDays === undefined ? 0 : Date.now() / 1000 - horizonDays * DAY_SECONDS;
        const rows = fixture.messages
          .filter((message) => message.ts >= bounds.from && message.ts <= bounds.to && message.ts >= floor)
          .sort((left, right) => right.ts - left.ts)
          .slice(0, Math.max(1, Number(body.limit) || 100));
        return json(response, 200, rows);
      }
      if (method === "POST" && transactional === "exports/activity.json") {
        const body = await readBody(request);
        const id = `export-${exports.size + 1}`;
        exports.set(id, { ...dayBounds(body.date_from, body.date_to), polls: 0 });
        return json(response, 200, { id, created_at: new Date().toISOString(), type: "activity", state: "waiting" });
      }
      if (method === "POST" && transactional === "exports/info.json") {
        const body = await readBody(request);
        const job = exports.get(String(body.id));
        if (!job) return json(response, 500, mandrillError("Unknown_Export", `No export exists with the id '${String(body.id)}'`));
        job.polls += 1;
        const complete = job.polls > (fixture.export?.pending_polls ?? 0);
        return json(response, 200, {
          id: body.id,
          type: "activity",
          state: complete ? "complete" : "working",
          result_url: complete ? `${origin}/api/1.0/exports/${String(body.id)}/activity.zip` : null,
        });
      }
      const download = transactional?.match(/^exports\/([^/]+)\/activity\.zip$/u)?.[1];
      if (method === "GET" && download) {
        const job = exports.get(download);
        if (!job) return json(response, 500, mandrillError("Unknown_Export", `No export exists with the id '${download}'`));
        const rows = fixture.messages
          .filter((message) => message.ts >= job.from && message.ts <= job.to)
          .sort((left, right) => right.ts - left.ts)
          .slice(0, fixture.export?.retained_rows ?? fixture.messages.length);
        const archive = zipSync({ "activity.csv": strToU8(activityCsv(rows, fixture.export?.message_id_column === true)) });
        response.writeHead(200, { "Content-Type": "application/zip", "Content-Length": String(archive.byteLength) });
        return response.end(Buffer.from(archive));
      }
      return json(response, 404, { detail: `unhandled ${method} ${url.pathname}` });
    } catch (error) {
      return json(response, 500, { message: error instanceof Error ? error.message : String(error) });
    }
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    marketingBaseUrl: `${origin}/3.0`,
    transactionalBaseUrl: `${origin}/api/1.0`,
    calls,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flag = (name: string) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
  };
  const fixturePath = flag("--fixture");
  if (!fixturePath) throw new Error("usage: provider-stub --fixture <fixture.json> [--port <port>]");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as StubFixture;
  const stub = await startProviderStub(fixture, Number(flag("--port") ?? 0));
  process.stdout.write(`${JSON.stringify({
    marketing_base_url: stub.marketingBaseUrl,
    transactional_base_url: stub.transactionalBaseUrl,
    campaigns: fixture.campaigns.length,
    recipients: fixture.campaigns.reduce((total, campaign) => total + campaign.recipients.length, 0),
    messages: fixture.messages.length,
  })}\n`);
}

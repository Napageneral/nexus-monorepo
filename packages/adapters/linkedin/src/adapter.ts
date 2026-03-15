import fs from "node:fs/promises";
import path from "node:path";
import {
  defineAdapter,
  method,
  requireCredential,
  type AdapterContext,
  type DeliveryResult,
  type DeliveryTarget,
} from "@nexus-project/adapter-sdk-ts";

type UnknownRecord = Record<string, unknown>;
type UnknownArray = unknown[];
type FetchLike = typeof fetch;

type LinkedInClient = {
  accessToken: string;
  apiBase: string;
  version: string;
  fetchFn: FetchLike;
};

type LinkedInOrganizationSummary = {
  organizationUrn: string;
  organizationId: string;
  localizedName?: string;
  vanityName?: string;
  role?: string;
  state?: string;
  raw: UnknownRecord;
};

const LINKEDIN_DEFAULT_VERSION = "202601";
const LINKEDIN_DEFAULT_API_BASE = "https://api.linkedin.com/rest";
const LINKEDIN_IMAGE_READY_ATTEMPTS = 10;
const LINKEDIN_IMAGE_READY_DELAY_MS = 1000;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

function asArray(value: unknown): UnknownArray {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asPositiveInt(value: unknown): number | undefined {
  const parsed = asNumber(value);
  if (parsed === undefined) {
    return undefined;
  }
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : undefined;
}

function requireObjectPayload(ctx: { payload?: UnknownRecord }): UnknownRecord {
  return ctx.payload ?? {};
}

function readRuntimeConfig(ctx: AdapterContext): UnknownRecord {
  return asRecord(ctx.runtime?.config) ?? {};
}

function configString(ctx: AdapterContext, name: string): string | undefined {
  return asString(readRuntimeConfig(ctx)[name]);
}

function configValue(versionOverride: string | undefined, fallback: string): string {
  return versionOverride?.trim() ? versionOverride.trim() : fallback;
}

export function normalizeLinkedInOrganizationUrn(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("organization URN is required");
  }
  const urnMatch = /^urn:li:organization:(\d+)$/u.exec(trimmed);
  if (urnMatch) {
    return `urn:li:organization:${urnMatch[1]}`;
  }
  const id = trimmed.replace(/[^\d]/gu, "");
  if (!id) {
    throw new Error(`invalid LinkedIn organization identifier: ${raw}`);
  }
  return `urn:li:organization:${id}`;
}

function normalizeEntityUrn(raw: string, label: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  if (!trimmed.startsWith("urn:li:")) {
    throw new Error(`${label} must be a LinkedIn URN`);
  }
  return trimmed;
}

function organizationIdFromUrn(organizationUrn: string): string {
  const match = /^urn:li:organization:(\d+)$/u.exec(organizationUrn.trim());
  if (!match) {
    throw new Error(`invalid LinkedIn organization URN: ${organizationUrn}`);
  }
  return match[1]!;
}

function mimeTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".jpg":
    case ".jpeg":
    default:
      return "image/jpeg";
  }
}

function localizedText(record: UnknownRecord | undefined): string | undefined {
  if (!record) {
    return undefined;
  }
  const localizedName = asString(record.localizedName);
  if (localizedName) {
    return localizedName;
  }
  const name = asRecord(record.name);
  const localized = asRecord(name?.localized);
  if (!localized) {
    return undefined;
  }
  for (const value of Object.values(localized)) {
    const text = asString(value);
    if (text) {
      return text;
    }
  }
  return undefined;
}

export function resolveLinkedInOrganizationInput(params: {
  payloadOrganizationUrn?: string;
  targetContainerId?: string;
  configOrganizationUrn?: string;
}): string {
  const direct =
    params.payloadOrganizationUrn ??
    params.targetContainerId ??
    params.configOrganizationUrn;
  if (!direct) {
    throw new Error("organizationUrn is required or target.channel.container_id must be set");
  }
  return normalizeLinkedInOrganizationUrn(direct);
}

function resolveOrganizationUrn(
  ctx: AdapterContext,
  payload?: UnknownRecord,
  target?: DeliveryTarget,
): string {
  return resolveLinkedInOrganizationInput({
    payloadOrganizationUrn: asString(payload?.organizationUrn),
    targetContainerId: asString(target?.channel?.container_id),
    configOrganizationUrn: configString(ctx, "organizationUrn"),
  });
}

function buildClient(ctx: AdapterContext): LinkedInClient {
  return {
    accessToken: requireCredential(ctx, {
      label: "LinkedIn access token",
      fields: ["accessToken", "access_token", "token"],
      env: ["LINKEDIN_ACCESS_TOKEN"],
    }),
    apiBase: configValue(
      process.env.NEXUS_LINKEDIN_API_BASE ?? configString(ctx, "apiBase"),
      LINKEDIN_DEFAULT_API_BASE,
    ),
    version: configValue(
      process.env.NEXUS_LINKEDIN_VERSION ?? configString(ctx, "apiVersion"),
      LINKEDIN_DEFAULT_VERSION,
    ),
    fetchFn: fetch,
  };
}

function headersForLinkedIn(client: LinkedInClient, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Authorization", `Bearer ${client.accessToken}`);
  headers.set("Linkedin-Version", client.version);
  headers.set("X-Restli-Protocol-Version", "2.0.0");
  headers.set("Accept", "application/json");
  return headers;
}

function requestUrl(client: LinkedInClient, input: string, query?: Record<string, string | number | undefined>): URL {
  const url = input.startsWith("http://") || input.startsWith("https://")
    ? new URL(input)
    : new URL(input.replace(/^\//u, ""), `${client.apiBase.replace(/\/$/u, "")}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
}

async function requestLinkedIn(
  client: LinkedInClient,
  input: string,
  options: {
    method?: string;
    query?: Record<string, string | number | undefined>;
    body?: unknown;
    headers?: HeadersInit;
  } = {},
): Promise<{ response: Response; data: unknown }> {
  const headers = headersForLinkedIn(client, options.headers);
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (
      typeof options.body === "string" ||
      options.body instanceof ArrayBuffer ||
      ArrayBuffer.isView(options.body) ||
      options.body instanceof Blob ||
      options.body instanceof FormData ||
      options.body instanceof URLSearchParams
    ) {
      body = options.body as BodyInit;
    } else {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.body);
    }
  }

  const response = await client.fetchFn(requestUrl(client, input, options.query).toString(), {
    method: options.method ?? "GET",
    headers,
    body,
  });
  const data = await parseResponseBody(response);
  if (!response.ok) {
    const details =
      asString(asRecord(data)?.message) ??
      asString(asRecord(data)?.error) ??
      JSON.stringify(data);
    throw new Error(`${options.method ?? "GET"} ${input} failed with HTTP ${response.status}: ${details}`);
  }
  return { response, data };
}

async function uploadBinary(uploadUrl: string, body: Uint8Array, mimeType: string): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
    },
    body: Buffer.from(body),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`LinkedIn image upload failed with HTTP ${response.status}: ${details}`);
  }
}

function normalizeOrganizationSummary(
  acl: UnknownRecord,
  organization: UnknownRecord | undefined,
): LinkedInOrganizationSummary {
  const organizationUrn = normalizeLinkedInOrganizationUrn(
    asString(acl.organizationTarget) ??
      asString(acl.organization) ??
      asString(organization?.$URN) ??
      String(organization?.id ?? ""),
  );
  return {
    organizationUrn,
    organizationId: organizationIdFromUrn(organizationUrn),
    localizedName: localizedText(organization),
    vanityName: asString(organization?.vanityName),
    role: asString(acl.role),
    state: asString(acl.state),
    raw: {
      acl,
      ...(organization ? { organization } : {}),
    },
  };
}

async function listAdministeredOrganizations(client: LinkedInClient): Promise<LinkedInOrganizationSummary[]> {
  const { data: aclData } = await requestLinkedIn(client, "/organizationAcls", {
    query: {
      q: "roleAssignee",
      state: "APPROVED",
      count: 100,
      start: 0,
    },
  });
  const aclElements = asArray(asRecord(aclData)?.elements)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is UnknownRecord => Boolean(entry));

  const uniqueIDs = [...new Set(
    aclElements
      .map((entry) =>
        asString(entry.organizationTarget) ?? asString(entry.organization),
      )
      .filter((entry): entry is string => Boolean(entry))
      .map((entry) => organizationIdFromUrn(normalizeLinkedInOrganizationUrn(entry))),
  )];

  let organizationByID = new Map<string, UnknownRecord>();
  if (uniqueIDs.length > 0) {
    const { data: orgData } = await requestLinkedIn(client, "/organizations", {
      query: {
        ids: `List(${uniqueIDs.join(",")})`,
      },
    });
    const results = asRecord(asRecord(orgData)?.results);
    if (results) {
      for (const [key, value] of Object.entries(results)) {
        const record = asRecord(value);
        if (record) {
          organizationByID.set(key, record);
        }
      }
    }
  }

  return aclElements.map((acl) => {
    const organizationUrn = normalizeLinkedInOrganizationUrn(
      asString(acl.organizationTarget) ?? asString(acl.organization) ?? "",
    );
    const organizationID = organizationIdFromUrn(organizationUrn);
    return normalizeOrganizationSummary(acl, organizationByID.get(organizationID));
  });
}

function summarizePost(record: UnknownRecord): UnknownRecord {
  return {
    postUrn: asString(record.id) ?? asString(record.$URN) ?? null,
    author: asString(record.author) ?? null,
    commentary: asString(record.commentary) ?? null,
    lifecycleState: asString(record.lifecycleState) ?? null,
    visibility: asString(record.visibility) ?? null,
    publishedAt: asNumber(record.publishedAt) ?? null,
    lastModifiedAt: asNumber(record.lastModifiedAt) ?? null,
    raw: record,
  };
}

function summarizeComment(record: UnknownRecord): UnknownRecord {
  const message = asRecord(record.message);
  return {
    commentUrn: asString(record.id) ?? asString(record.$URN) ?? null,
    actor: asString(record.actor) ?? null,
    message: asString(message?.text) ?? asString(record.commentary) ?? null,
    createdAt: asNumber(record.createdAt) ?? null,
    raw: record,
  };
}

export function buildLinkedInOrganicPostPayload(args: {
  organizationUrn: string;
  commentary?: string;
  imageUrn?: string;
  imageAltText?: string;
  visibility?: string;
}): UnknownRecord {
  const payload: UnknownRecord = {
    author: args.organizationUrn,
    visibility: args.visibility ?? "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  const commentary = args.commentary?.trim();
  if (commentary) {
    payload.commentary = commentary;
  }
  if (args.imageUrn) {
    payload.content = {
      media: {
        id: args.imageUrn,
        ...(args.imageAltText?.trim() ? { altText: args.imageAltText.trim() } : {}),
      },
    };
  }
  return payload;
}

async function waitForImageAvailable(client: LinkedInClient, imageUrn: string): Promise<void> {
  for (let attempt = 0; attempt < LINKEDIN_IMAGE_READY_ATTEMPTS; attempt++) {
    const { data } = await requestLinkedIn(client, `/images/${encodeURIComponent(imageUrn)}`);
    const image = asRecord(data);
    const status = asString(image?.status);
    if (status === "AVAILABLE") {
      return;
    }
    if (status === "PROCESSING_FAILED") {
      throw new Error(`LinkedIn image processing failed for ${imageUrn}`);
    }
    await new Promise((resolve) => setTimeout(resolve, LINKEDIN_IMAGE_READY_DELAY_MS));
  }
  throw new Error(`LinkedIn image ${imageUrn} did not become AVAILABLE in time`);
}

async function ensureImageUrn(client: LinkedInClient, args: {
  organizationUrn: string;
  imagePath?: string;
  imageUrn?: string;
}): Promise<string | undefined> {
  if (args.imageUrn) {
    return normalizeEntityUrn(args.imageUrn, "imageUrn");
  }
  if (!args.imagePath) {
    return undefined;
  }

  const absolutePath = path.resolve(args.imagePath);
  const body = await fs.readFile(absolutePath);
  const mimeType = mimeTypeForPath(absolutePath);
  const { data } = await requestLinkedIn(client, "/images", {
    method: "POST",
    query: { action: "initializeUpload" },
    body: {
      initializeUploadRequest: {
        owner: args.organizationUrn,
      },
    },
  });
  const value = asRecord(asRecord(data)?.value);
  const uploadUrl = asString(value?.uploadUrl);
  const imageUrn = asString(value?.image);
  if (!uploadUrl || !imageUrn) {
    throw new Error("LinkedIn image initialization did not return uploadUrl and image URN");
  }

  await uploadBinary(uploadUrl, body, mimeType);
  await waitForImageAvailable(client, imageUrn);
  return imageUrn;
}

async function createPost(client: LinkedInClient, args: {
  organizationUrn: string;
  commentary?: string;
  imagePath?: string;
  imageUrn?: string;
  imageAltText?: string;
}): Promise<UnknownRecord> {
  const normalizedOrganizationUrn = normalizeLinkedInOrganizationUrn(args.organizationUrn);
  const imageUrn = await ensureImageUrn(client, {
    organizationUrn: normalizedOrganizationUrn,
    imagePath: args.imagePath,
    imageUrn: args.imageUrn,
  });
  const payload = buildLinkedInOrganicPostPayload({
    organizationUrn: normalizedOrganizationUrn,
    commentary: args.commentary,
    imageUrn,
    imageAltText: args.imageAltText,
  });

  const { response } = await requestLinkedIn(client, "/posts", {
    method: "POST",
    body: payload,
  });
  const postUrn =
    response.headers.get("x-restli-id")?.trim() ??
    response.headers.get("X-RestLi-Id")?.trim() ??
    null;

  if (!postUrn) {
    return {
      organizationUrn: normalizedOrganizationUrn,
      payload,
    };
  }

  const { data: postData } = await requestLinkedIn(
    client,
    `/posts/${encodeURIComponent(postUrn)}`,
    {
      query: { viewContext: "AUTHOR" },
    },
  );
  return {
    postUrn,
    organizationUrn: normalizedOrganizationUrn,
    post: summarizePost(asRecord(postData) ?? {}),
    raw: postData,
  };
}

async function sendOrganizationPost(
  ctx: AdapterContext,
  client: LinkedInClient,
  target: DeliveryTarget,
  text?: string,
  media?: string,
  caption?: string,
): Promise<DeliveryResult> {
  const organizationUrn = resolveOrganizationUrn(ctx, undefined, target);
  const created = await createPost(client, {
    organizationUrn,
    commentary: text?.trim() || caption?.trim(),
    imagePath: media,
  });
  const postUrn = asString(created.postUrn);
  const charCount = (text?.length ?? caption?.length ?? 0);
  return {
    success: true,
    message_ids: postUrn ? [postUrn] : [],
    chunks_sent: 1,
    total_chars: charCount,
  };
}

async function health(ctx: AdapterContext, client: LinkedInClient): Promise<{
  connected: boolean;
  last_event_at?: number;
  error?: string;
  details?: Record<string, unknown>;
}> {
  try {
    const organizations = await listAdministeredOrganizations(client);
    const configuredOrganizationUrn = configString(ctx, "organizationUrn");
    const configuredAccessible = configuredOrganizationUrn
      ? organizations.some(
          (organization) => organization.organizationUrn === normalizeLinkedInOrganizationUrn(configuredOrganizationUrn),
        )
      : null;

    if (configuredOrganizationUrn && configuredAccessible === false) {
      return {
        connected: false,
        error: `configured organization is not accessible: ${configuredOrganizationUrn}`,
        details: {
          organization_count: organizations.length,
          configured_organization_urn: configuredOrganizationUrn,
        },
      };
    }

    return {
      connected: true,
      last_event_at: Date.now(),
      details: {
        organization_count: organizations.length,
        configured_organization_urn: configuredOrganizationUrn ?? null,
        configured_organization_access: configuredAccessible,
        organizations: organizations.map((organization) => ({
          organizationUrn: organization.organizationUrn,
          organizationId: organization.organizationId,
          localizedName: organization.localizedName ?? null,
          role: organization.role ?? null,
          state: organization.state ?? null,
        })),
      },
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const linkedinAdapter = defineAdapter<LinkedInClient>({
  platform: "linkedin",
  name: "nexus-linkedin-adapter",
  version: "0.1.0",
  multi_account: true,
  credential_service: "linkedin",
  auth: {
    methods: [
      {
        id: "linkedin_oauth",
        type: "oauth2",
        label: "Connect with LinkedIn",
        icon: "oauth",
        service: "linkedin",
        scopes: [
          "r_organization_admin",
          "rw_organization_admin",
          "r_organization_social",
          "w_organization_social",
          "r_organization_social_feed",
          "w_organization_social_feed",
        ],
      },
    ],
    setupGuide:
      "Connect a LinkedIn app with Community Management access, then choose the organization you administer for reads and publishing.",
  },
  capabilities: {
    supports_markdown: false,
    supports_threads: false,
    supports_reactions: false,
    supports_polls: false,
    supports_buttons: false,
    supports_edit: false,
    supports_delete: false,
    supports_media: true,
    supports_voice_notes: false,
    supports_streaming_edit: false,
  },
  client: {
    create: ({ ctx }) => buildClient(ctx),
  },
  connection: {
    health: async (ctx) => await health(ctx, ctx.client!),
  },
  delivery: {
    send: async (ctx, req) =>
      await sendOrganizationPost(ctx, ctx.client!, req.target, req.text, req.media, req.caption),
  },
  methods: {
    "linkedin.organizations.list": method({
      description: "List the LinkedIn organizations the connected member can administer.",
      action: "read",
      params: {},
      response: {
        organizations: "LinkedIn administered organizations",
      },
      handler: async (ctx) => {
        const organizations = await listAdministeredOrganizations(ctx.client!);
        return {
          organizations,
        };
      },
    }),
    "linkedin.posts.list": method({
      description: "List LinkedIn posts for an organization author.",
      action: "read",
      params: {
        organizationUrn: "Optional LinkedIn organization URN",
        count: "Optional page size",
        start: "Optional pagination offset",
      },
      response: {
        elements: "LinkedIn posts",
      },
      handler: async (ctx, req) => {
        const payload = requireObjectPayload(req);
        const organizationUrn = resolveOrganizationUrn(ctx, payload);
        const count = asPositiveInt(payload.count) ?? 25;
        const start = asPositiveInt(payload.start) ?? 0;
        const { data } = await requestLinkedIn(ctx.client!, "/posts", {
          query: {
            q: "author",
            author: organizationUrn,
            count,
            start,
            viewContext: "AUTHOR",
          },
        });
        const record = asRecord(data) ?? {};
        const elements = asArray(record.elements)
          .map((entry) => asRecord(entry))
          .filter((entry): entry is UnknownRecord => Boolean(entry))
          .map((entry) => summarizePost(entry));
        return {
          organizationUrn,
          paging: asRecord(record.paging) ?? null,
          elements,
          raw: data,
        };
      },
    }),
    "linkedin.posts.get": method({
      description: "Fetch one LinkedIn post by URN.",
      action: "read",
      params: {
        postUrn: "LinkedIn post URN",
      },
      response: {
        post: "LinkedIn post",
      },
      handler: async (ctx, req) => {
        const payload = requireObjectPayload(req);
        const postUrn = normalizeEntityUrn(String(payload.postUrn ?? ""), "postUrn");
        const { data } = await requestLinkedIn(
          ctx.client!,
          `/posts/${encodeURIComponent(postUrn)}`,
          { query: { viewContext: "AUTHOR" } },
        );
        return {
          postUrn,
          post: summarizePost(asRecord(data) ?? {}),
          raw: data,
        };
      },
    }),
    "linkedin.posts.create": method({
      description: "Create an organization-authored LinkedIn post.",
      action: "write",
      params: {
        organizationUrn: "Optional LinkedIn organization URN",
        commentary: "Post text",
        imagePath: "Optional local filesystem path to an image",
        imageUrn: "Optional pre-uploaded LinkedIn image URN",
        imageAltText: "Optional image alt text",
      },
      response: {
        postUrn: "Created LinkedIn post URN",
      },
      handler: async (ctx, req) => {
        const payload = requireObjectPayload(req);
        const organizationUrn = resolveOrganizationUrn(ctx, payload);
        const commentary = asString(payload.commentary);
        const imagePath = asString(payload.imagePath);
        const imageUrn = asString(payload.imageUrn);
        const imageAltText = asString(payload.imageAltText);
        if (!commentary && !imagePath && !imageUrn) {
          throw new Error("commentary, imagePath, or imageUrn is required");
        }
        return await createPost(ctx.client!, {
          organizationUrn,
          commentary,
          imagePath,
          imageUrn,
          imageAltText,
        });
      },
    }),
    "linkedin.comments.list": method({
      description: "List comments for a LinkedIn post.",
      action: "read",
      params: {
        postUrn: "LinkedIn post URN",
        count: "Optional page size",
        start: "Optional pagination offset",
      },
      response: {
        elements: "LinkedIn comments",
      },
      handler: async (ctx, req) => {
        const payload = requireObjectPayload(req);
        const postUrn = normalizeEntityUrn(String(payload.postUrn ?? ""), "postUrn");
        const count = asPositiveInt(payload.count) ?? 25;
        const start = asPositiveInt(payload.start) ?? 0;
        const { data } = await requestLinkedIn(
          ctx.client!,
          `/socialActions/${encodeURIComponent(postUrn)}/comments`,
          {
            query: { count, start },
          },
        );
        const record = asRecord(data) ?? {};
        const elements = asArray(record.elements)
          .map((entry) => asRecord(entry))
          .filter((entry): entry is UnknownRecord => Boolean(entry))
          .map((entry) => summarizeComment(entry));
        return {
          postUrn,
          paging: asRecord(record.paging) ?? null,
          elements,
          raw: data,
        };
      },
    }),
    "linkedin.socialMetadata.get": method({
      description: "Fetch aggregate LinkedIn social metadata for a post or comment URN.",
      action: "read",
      params: {
        entityUrn: "LinkedIn post or comment URN",
      },
      response: {
        socialMetadata: "LinkedIn social metadata",
      },
      handler: async (ctx, req) => {
        const payload = requireObjectPayload(req);
        const entityUrn = normalizeEntityUrn(String(payload.entityUrn ?? ""), "entityUrn");
        const { data } = await requestLinkedIn(
          ctx.client!,
          `/socialMetadata/${encodeURIComponent(entityUrn)}`,
        );
        return {
          entityUrn,
          socialMetadata: asRecord(data) ?? {},
          raw: data,
        };
      },
    }),
  },
});

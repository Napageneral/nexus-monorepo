export type CommunicationDirection = "inbound" | "outbound";

export type WorkspaceCategory =
  | "vendor"
  | "fulfillment_partner"
  | "logistics_partner"
  | "packaging_partner"
  | "marketplace_partner"
  | "professional_service"
  | "creator_partner";

export type CommunicationRecord = {
  source_record_id: string;
  source_revision_sha256: string;
  provider: "gmail" | "alibaba" | string;
  connection_id: string;
  provider_thread_id: string;
  provider_message_id: string;
  observed_at: string;
  direction: CommunicationDirection;
  summary: string;
  attachment_count: number;
};

export type IdentityResolution = {
  source_record_id: string;
  status: "confirmed" | "probable" | "unresolved" | "ambiguous";
  decision_origin: "exact_provider_anchor" | "operator_review" | "model_proposal" | "none";
  canonical_entity_id?: string;
  contact_id?: string;
};

export type WorkspaceAssertion = {
  source_record_id: string;
  category: WorkspaceCategory;
  status: "confirmed" | "proposed";
  assertion_origin: "deterministic_rule" | "operator_review" | "model";
};

export type ProjectedMessage = CommunicationRecord & {
  canonical_entity_id: string;
  contact_id?: string;
  category: WorkspaceCategory;
};

export type NativeThread = {
  native_thread_key: string;
  provider: string;
  connection_id: string;
  provider_thread_id: string;
  canonical_entity_id: string;
  categories: WorkspaceCategory[];
  response_state: "awaiting_moonsleep" | "awaiting_partner";
  oldest_unanswered_at: string | null;
  latest_message_at: string;
  messages: ProjectedMessage[];
};

export type EntityTimeline = {
  canonical_entity_id: string;
  categories: WorkspaceCategory[];
  native_thread_keys: string[];
  messages: ProjectedMessage[];
};

export type ReviewItem = {
  source_record_id: string;
  reason:
    | "identity_unresolved"
    | "identity_ambiguous"
    | "identity_model_only"
    | "workspace_classification_unconfirmed";
};

export type PartnerWorkspaceProjection = {
  entity_timelines: EntityTimeline[];
  native_threads: NativeThread[];
  awaiting_moonsleep: NativeThread[];
  review_queue: ReviewItem[];
};

const SHA256 = /^[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._@/+\-$]{0,511}$/;

function requireText(value: string, field: string, maxBytes: number): string {
  if (!value || value !== value.trim() || Buffer.byteLength(value, "utf8") > maxBytes) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error("observed_at must be an exact ISO-8601 UTC timestamp");
  }
  return parsed;
}

function validateRecord(record: CommunicationRecord): void {
  requireText(record.source_record_id, "source_record_id", 512);
  if (!IDENTIFIER.test(record.source_record_id)) {
    throw new Error("source_record_id contains unsupported characters");
  }
  if (!SHA256.test(record.source_revision_sha256)) {
    throw new Error("source_revision_sha256 must be a lowercase SHA-256 digest");
  }
  requireText(record.provider, "provider", 64);
  requireText(record.connection_id, "connection_id", 256);
  requireText(record.provider_thread_id, "provider_thread_id", 512);
  requireText(record.provider_message_id, "provider_message_id", 512);
  requireText(record.summary, "summary", 16_384);
  timestamp(record.observed_at);
  if (!Number.isSafeInteger(record.attachment_count) || record.attachment_count < 0) {
    throw new Error("attachment_count must be a non-negative safe integer");
  }
}

function acceptedIdentity(resolution: IdentityResolution): boolean {
  if (resolution.status !== "confirmed" && resolution.status !== "probable") return false;
  return (
    resolution.decision_origin === "exact_provider_anchor" ||
    resolution.decision_origin === "operator_review"
  );
}

function reviewReason(
  resolution: IdentityResolution | undefined,
): ReviewItem["reason"] {
  if (!resolution || resolution.status === "unresolved") return "identity_unresolved";
  if (resolution.status === "ambiguous") return "identity_ambiguous";
  return "identity_model_only";
}

function nativeThreadKey(message: ProjectedMessage): string {
  return JSON.stringify([
    message.provider,
    message.connection_id,
    message.provider_thread_id,
  ]);
}

function acceptedAssertion(assertion: WorkspaceAssertion | undefined): assertion is WorkspaceAssertion {
  if (!assertion || assertion.status !== "confirmed") return false;
  return (
    assertion.assertion_origin === "deterministic_rule" ||
    assertion.assertion_origin === "operator_review"
  );
}

function responseState(messages: ProjectedMessage[]): {
  response_state: NativeThread["response_state"];
  oldest_unanswered_at: string | null;
} {
  let latestOutbound = Number.NEGATIVE_INFINITY;
  for (const message of messages) {
    if (message.direction === "outbound") {
      latestOutbound = Math.max(latestOutbound, timestamp(message.observed_at));
    }
  }
  const unansweredInbound = messages.filter(
    (message) =>
      message.direction === "inbound" && timestamp(message.observed_at) > latestOutbound,
  );
  if (unansweredInbound.length === 0) {
    return { response_state: "awaiting_partner", oldest_unanswered_at: null };
  }
  return {
    response_state: "awaiting_moonsleep",
    oldest_unanswered_at: unansweredInbound[0]!.observed_at,
  };
}

export function projectPartnerWorkspace(input: {
  records: CommunicationRecord[];
  identity_resolutions: IdentityResolution[];
  workspace_assertions: WorkspaceAssertion[];
}): PartnerWorkspaceProjection {
  const recordIds = new Set<string>();
  for (const record of input.records) {
    validateRecord(record);
    if (recordIds.has(record.source_record_id)) {
      throw new Error(`duplicate source record: ${record.source_record_id}`);
    }
    recordIds.add(record.source_record_id);
  }

  const identities = new Map<string, IdentityResolution>();
  for (const resolution of input.identity_resolutions) {
    if (!recordIds.has(resolution.source_record_id)) {
      throw new Error(`identity resolution references an unknown record: ${resolution.source_record_id}`);
    }
    if (identities.has(resolution.source_record_id)) {
      throw new Error(`duplicate identity resolution: ${resolution.source_record_id}`);
    }
    if (acceptedIdentity(resolution)) {
      requireText(resolution.canonical_entity_id ?? "", "canonical_entity_id", 256);
    }
    identities.set(resolution.source_record_id, resolution);
  }

  const assertions = new Map<string, WorkspaceAssertion>();
  for (const assertion of input.workspace_assertions) {
    if (!recordIds.has(assertion.source_record_id)) {
      throw new Error(`workspace assertion references an unknown record: ${assertion.source_record_id}`);
    }
    if (assertions.has(assertion.source_record_id)) {
      throw new Error(`duplicate workspace assertion: ${assertion.source_record_id}`);
    }
    assertions.set(assertion.source_record_id, assertion);
  }

  const reviewQueue: ReviewItem[] = [];
  const projected: ProjectedMessage[] = [];
  const sortedRecords = [...input.records].sort(
    (left, right) =>
      timestamp(left.observed_at) - timestamp(right.observed_at) ||
      left.source_record_id.localeCompare(right.source_record_id),
  );

  for (const record of sortedRecords) {
    const identity = identities.get(record.source_record_id);
    if (!identity || !acceptedIdentity(identity)) {
      reviewQueue.push({
        source_record_id: record.source_record_id,
        reason: reviewReason(identity),
      });
      continue;
    }
    const assertion = assertions.get(record.source_record_id);
    if (!acceptedAssertion(assertion)) {
      reviewQueue.push({
        source_record_id: record.source_record_id,
        reason: "workspace_classification_unconfirmed",
      });
      continue;
    }
    projected.push({
      ...record,
      canonical_entity_id: identity.canonical_entity_id!,
      ...(identity.contact_id ? { contact_id: identity.contact_id } : {}),
      category: assertion.category,
    });
  }

  const nativeThreadMessages = new Map<string, ProjectedMessage[]>();
  for (const message of projected) {
    const key = nativeThreadKey(message);
    const messages = nativeThreadMessages.get(key) ?? [];
    if (
      messages.some(
        (candidate) => candidate.canonical_entity_id !== message.canonical_entity_id,
      )
    ) {
      throw new Error(`one provider-native thread resolved to multiple entities: ${key}`);
    }
    messages.push(message);
    nativeThreadMessages.set(key, messages);
  }

  const nativeThreads = [...nativeThreadMessages.entries()].map(([key, messages]) => {
    const first = messages[0]!;
    const response = responseState(messages);
    return {
      native_thread_key: key,
      provider: first.provider,
      connection_id: first.connection_id,
      provider_thread_id: first.provider_thread_id,
      canonical_entity_id: first.canonical_entity_id,
      categories: [...new Set(messages.map((message) => message.category))].sort(),
      ...response,
      latest_message_at: messages.at(-1)!.observed_at,
      messages,
    } satisfies NativeThread;
  });
  nativeThreads.sort(
    (left, right) =>
      timestamp(left.latest_message_at) - timestamp(right.latest_message_at) ||
      left.native_thread_key.localeCompare(right.native_thread_key),
  );

  const entityMessages = new Map<string, ProjectedMessage[]>();
  for (const message of projected) {
    const messages = entityMessages.get(message.canonical_entity_id) ?? [];
    messages.push(message);
    entityMessages.set(message.canonical_entity_id, messages);
  }
  const entityTimelines = [...entityMessages.entries()]
    .map(([canonicalEntityId, messages]) => ({
      canonical_entity_id: canonicalEntityId,
      categories: [...new Set(messages.map((message) => message.category))].sort(),
      native_thread_keys: [
        ...new Set(messages.map((message) => nativeThreadKey(message))),
      ].sort(),
      messages,
    }))
    .sort((left, right) => left.canonical_entity_id.localeCompare(right.canonical_entity_id));

  const awaitingMoonSleep = nativeThreads
    .filter((thread) => thread.response_state === "awaiting_moonsleep")
    .sort(
      (left, right) =>
        timestamp(left.oldest_unanswered_at!) - timestamp(right.oldest_unanswered_at!) ||
        left.native_thread_key.localeCompare(right.native_thread_key),
    );

  reviewQueue.sort((left, right) => left.source_record_id.localeCompare(right.source_record_id));
  return {
    entity_timelines: entityTimelines,
    native_threads: nativeThreads,
    awaiting_moonsleep: awaitingMoonSleep,
    review_queue: reviewQueue,
  };
}

export type CommunicationDirection = "inbound" | "outbound";

export type PartnerRelationshipCategory =
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
  category: PartnerRelationshipCategory;
  status: "confirmed" | "proposed";
  assertion_origin: "deterministic_rule" | "operator_review" | "model";
};

export type OpenLoopLifecycle =
  | "open"
  | "waiting_on_partner"
  | "waiting_on_moonsleep"
  | "blocked"
  | "resolved"
  | "superseded"
  | "dismissed";

export type OpenLoopAssertion = {
  open_loop_id: string;
  canonical_entity_id: string;
  primary_source_record_id: string;
  evidence_source_record_ids: string[];
  closure_source_record_ids: string[];
  title: string;
  summary: string;
  labels: string[];
  lifecycle: OpenLoopLifecycle;
  review_state: "proposed" | "confirmed" | "rejected";
  assertion_origin: "deterministic_rule" | "operator_review" | "model";
  owner?: string;
  follow_up_at?: string;
  superseded_by_open_loop_id?: string;
};

export type SourceCoverageAssertion = {
  source_record_id: string;
  disposition:
    | "open_loop_evidence"
    | "informational"
    | "provider_system"
    | "attachment_only"
    | "needs_review";
  open_loop_ids: string[];
  assertion_origin: "deterministic_rule" | "operator_review" | "model";
};

export type ProjectedMessage = CommunicationRecord & {
  canonical_entity_id: string;
  contact_id?: string;
  partner_category: PartnerRelationshipCategory;
};

export type NativeThread = {
  native_thread_key: string;
  provider: string;
  connection_id: string;
  provider_thread_id: string;
  canonical_entity_id: string;
  partner_categories: PartnerRelationshipCategory[];
  open_loop_ids: string[];
  unclassified_record_count: number;
  latest_message_at: string;
  messages: ProjectedMessage[];
};

export type ProjectedOpenLoop = Omit<OpenLoopAssertion, "evidence_source_record_ids"> & {
  evidence_source_record_ids: string[];
  native_thread_keys: string[];
  opened_at: string;
  last_activity_at: string;
};

export type EntityTimeline = {
  canonical_entity_id: string;
  partner_categories: PartnerRelationshipCategory[];
  native_thread_keys: string[];
  open_loop_ids: string[];
  messages: ProjectedMessage[];
};

export type ReviewItem = {
  subject_id: string;
  subject_type: "source_record" | "open_loop";
  reason:
    | "identity_unresolved"
    | "identity_ambiguous"
    | "identity_model_only"
    | "workspace_classification_unconfirmed"
    | "source_coverage_unconfirmed"
    | "open_loop_unconfirmed";
};

export type PartnerWorkspaceProjection = {
  entity_timelines: EntityTimeline[];
  native_threads: NativeThread[];
  reviewed_loops: ProjectedOpenLoop[];
  open_loops: ProjectedOpenLoop[];
  attention_queue: ProjectedOpenLoop[];
  waiting_on_partner: ProjectedOpenLoop[];
  review_queue: ReviewItem[];
};

const SHA256 = /^[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._@/+\-$]{0,511}$/;
const LABEL = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function requireText(value: string, field: string, maxBytes: number): string {
  if (!value || value !== value.trim() || Buffer.byteLength(value, "utf8") > maxBytes) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

function timestamp(value: string, field = "observed_at"): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${field} must be an exact ISO-8601 UTC timestamp`);
  }
  return parsed;
}

function requireIdentifier(value: string, field: string, maxBytes = 512): string {
  requireText(value, field, maxBytes);
  if (!IDENTIFIER.test(value)) throw new Error(`${field} contains unsupported characters`);
  return value;
}

function unique(values: string[], field: string): string[] {
  const result = [...new Set(values)];
  if (result.length !== values.length) throw new Error(`${field} contains duplicates`);
  return result;
}

function validateRecord(record: CommunicationRecord): void {
  requireIdentifier(record.source_record_id, "source_record_id");
  if (!SHA256.test(record.source_revision_sha256)) {
    throw new Error("source_revision_sha256 must be a lowercase SHA-256 digest");
  }
  requireText(record.provider, "provider", 64);
  requireIdentifier(record.connection_id, "connection_id", 256);
  requireIdentifier(record.provider_thread_id, "provider_thread_id");
  requireIdentifier(record.provider_message_id, "provider_message_id");
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

function identityReviewReason(
  resolution: IdentityResolution | undefined,
): ReviewItem["reason"] {
  if (!resolution || resolution.status === "unresolved") return "identity_unresolved";
  if (resolution.status === "ambiguous") return "identity_ambiguous";
  return "identity_model_only";
}

function nativeThreadKey(message: Pick<ProjectedMessage, "provider" | "connection_id" | "provider_thread_id">): string {
  return JSON.stringify([message.provider, message.connection_id, message.provider_thread_id]);
}

function acceptedWorkspaceAssertion(
  assertion: WorkspaceAssertion | undefined,
): assertion is WorkspaceAssertion {
  if (!assertion || assertion.status !== "confirmed") return false;
  return (
    assertion.assertion_origin === "deterministic_rule" ||
    assertion.assertion_origin === "operator_review"
  );
}

function acceptedCoverage(assertion: SourceCoverageAssertion): boolean {
  return (
    assertion.assertion_origin === "deterministic_rule" ||
    assertion.assertion_origin === "operator_review"
  );
}

function validateLoopShape(loop: OpenLoopAssertion): void {
  requireIdentifier(loop.open_loop_id, "open_loop_id");
  requireIdentifier(loop.canonical_entity_id, "canonical_entity_id", 256);
  requireIdentifier(loop.primary_source_record_id, "primary_source_record_id");
  requireText(loop.title, "open_loop.title", 256);
  requireText(loop.summary, "open_loop.summary", 8_192);
  if (loop.labels.length > 32) throw new Error("open_loop.labels exceeds 32 entries");
  unique(loop.labels, "open_loop.labels");
  for (const label of loop.labels) {
    if (!LABEL.test(label)) throw new Error("open_loop label is invalid");
  }
  unique(loop.evidence_source_record_ids, "open_loop.evidence_source_record_ids");
  unique(loop.closure_source_record_ids, "open_loop.closure_source_record_ids");
  if (!loop.evidence_source_record_ids.includes(loop.primary_source_record_id)) {
    throw new Error("open_loop primary source must be included in evidence");
  }
  if (loop.follow_up_at) timestamp(loop.follow_up_at, "follow_up_at");
  if (loop.owner) requireIdentifier(loop.owner, "open_loop.owner", 128);

  if (loop.lifecycle === "resolved" && loop.closure_source_record_ids.length === 0) {
    throw new Error("resolved open_loop requires exact closure evidence");
  }
  if (loop.lifecycle !== "resolved" && loop.closure_source_record_ids.length > 0) {
    throw new Error("only resolved open_loop may carry closure evidence");
  }
  if (loop.lifecycle === "superseded") {
    requireIdentifier(
      loop.superseded_by_open_loop_id ?? "",
      "superseded_by_open_loop_id",
    );
  } else if (loop.superseded_by_open_loop_id) {
    throw new Error("only superseded open_loop may identify a successor");
  }
}

function queuePriority(loop: ProjectedOpenLoop): number {
  switch (loop.lifecycle) {
    case "waiting_on_moonsleep": return 0;
    case "open": return 1;
    case "blocked": return 2;
    case "waiting_on_partner": return 3;
    default: return 4;
  }
}

export function projectPartnerWorkspace(input: {
  records: CommunicationRecord[];
  identity_resolutions: IdentityResolution[];
  workspace_assertions: WorkspaceAssertion[];
  open_loop_assertions: OpenLoopAssertion[];
  source_coverage_assertions: SourceCoverageAssertion[];
}): PartnerWorkspaceProjection {
  const records = new Map<string, CommunicationRecord>();
  for (const record of input.records) {
    validateRecord(record);
    if (records.has(record.source_record_id)) {
      throw new Error(`duplicate source record: ${record.source_record_id}`);
    }
    records.set(record.source_record_id, record);
  }

  const identities = new Map<string, IdentityResolution>();
  for (const resolution of input.identity_resolutions) {
    if (!records.has(resolution.source_record_id)) {
      throw new Error(`identity resolution references an unknown record: ${resolution.source_record_id}`);
    }
    if (identities.has(resolution.source_record_id)) {
      throw new Error(`duplicate identity resolution: ${resolution.source_record_id}`);
    }
    if (acceptedIdentity(resolution)) {
      requireIdentifier(resolution.canonical_entity_id ?? "", "canonical_entity_id", 256);
      if (resolution.contact_id) requireIdentifier(resolution.contact_id, "contact_id", 256);
    }
    identities.set(resolution.source_record_id, resolution);
  }

  const workspaceAssertions = new Map<string, WorkspaceAssertion>();
  for (const assertion of input.workspace_assertions) {
    if (!records.has(assertion.source_record_id)) {
      throw new Error(`workspace assertion references an unknown record: ${assertion.source_record_id}`);
    }
    if (workspaceAssertions.has(assertion.source_record_id)) {
      throw new Error(`duplicate workspace assertion: ${assertion.source_record_id}`);
    }
    workspaceAssertions.set(assertion.source_record_id, assertion);
  }

  const reviewQueue: ReviewItem[] = [];
  const projectedMessages = new Map<string, ProjectedMessage>();
  const sortedRecords = [...records.values()].sort(
    (left, right) =>
      timestamp(left.observed_at) - timestamp(right.observed_at) ||
      left.source_record_id.localeCompare(right.source_record_id),
  );

  for (const record of sortedRecords) {
    const identity = identities.get(record.source_record_id);
    if (!identity || !acceptedIdentity(identity)) {
      reviewQueue.push({
        subject_id: record.source_record_id,
        subject_type: "source_record",
        reason: identityReviewReason(identity),
      });
      continue;
    }
    const assertion = workspaceAssertions.get(record.source_record_id);
    if (!acceptedWorkspaceAssertion(assertion)) {
      reviewQueue.push({
        subject_id: record.source_record_id,
        subject_type: "source_record",
        reason: "workspace_classification_unconfirmed",
      });
      continue;
    }
    projectedMessages.set(record.source_record_id, {
      ...record,
      canonical_entity_id: identity.canonical_entity_id!,
      ...(identity.contact_id ? { contact_id: identity.contact_id } : {}),
      partner_category: assertion.category,
    });
  }

  const openLoopAssertions = new Map<string, OpenLoopAssertion>();
  for (const loop of input.open_loop_assertions) {
    validateLoopShape(loop);
    if (openLoopAssertions.has(loop.open_loop_id)) {
      throw new Error(`duplicate open_loop: ${loop.open_loop_id}`);
    }
    for (const sourceRecordId of [
      ...loop.evidence_source_record_ids,
      ...loop.closure_source_record_ids,
    ]) {
      const message = projectedMessages.get(sourceRecordId);
      if (!message) {
        throw new Error(`open_loop references an unavailable source record: ${sourceRecordId}`);
      }
      if (message.canonical_entity_id !== loop.canonical_entity_id) {
        throw new Error(`open_loop evidence crosses canonical entities: ${loop.open_loop_id}`);
      }
    }
    openLoopAssertions.set(loop.open_loop_id, loop);
  }
  for (const loop of openLoopAssertions.values()) {
    if (
      loop.lifecycle === "superseded" &&
      !openLoopAssertions.has(loop.superseded_by_open_loop_id!)
    ) {
      throw new Error(`open_loop successor does not exist: ${loop.open_loop_id}`);
    }
  }

  const coverage = new Map<string, SourceCoverageAssertion>();
  for (const assertion of input.source_coverage_assertions) {
    if (!records.has(assertion.source_record_id)) {
      throw new Error(`source coverage references an unknown record: ${assertion.source_record_id}`);
    }
    if (coverage.has(assertion.source_record_id)) {
      throw new Error(`duplicate source coverage: ${assertion.source_record_id}`);
    }
    unique(assertion.open_loop_ids, "source_coverage.open_loop_ids");
    for (const loopId of assertion.open_loop_ids) {
      const loop = openLoopAssertions.get(loopId);
      if (!loop) throw new Error(`source coverage references an unknown open_loop: ${loopId}`);
      if (!loop.evidence_source_record_ids.includes(assertion.source_record_id)) {
        throw new Error(`source coverage and open_loop evidence disagree: ${loopId}`);
      }
    }
    if (
      assertion.disposition === "open_loop_evidence" &&
      assertion.open_loop_ids.length === 0
    ) {
      throw new Error("open_loop_evidence coverage requires at least one open_loop");
    }
    if (
      assertion.disposition !== "open_loop_evidence" &&
      assertion.open_loop_ids.length > 0
    ) {
      throw new Error("non-loop source coverage cannot reference open_loops");
    }
    coverage.set(assertion.source_record_id, assertion);
  }

  for (const loop of openLoopAssertions.values()) {
    if (loop.review_state !== "confirmed" || loop.assertion_origin === "model") continue;
    for (const sourceRecordId of loop.evidence_source_record_ids) {
      const assertion = coverage.get(sourceRecordId);
      if (
        !assertion ||
        !acceptedCoverage(assertion) ||
        assertion.disposition !== "open_loop_evidence" ||
        !assertion.open_loop_ids.includes(loop.open_loop_id)
      ) {
        throw new Error(`reviewed open_loop lacks matching source coverage: ${loop.open_loop_id}`);
      }
    }
  }

  for (const message of projectedMessages.values()) {
    const assertion = coverage.get(message.source_record_id);
    if (!assertion || !acceptedCoverage(assertion) || assertion.disposition === "needs_review") {
      reviewQueue.push({
        subject_id: message.source_record_id,
        subject_type: "source_record",
        reason: "source_coverage_unconfirmed",
      });
    }
  }

  const projectedLoops: ProjectedOpenLoop[] = [];
  for (const loop of openLoopAssertions.values()) {
    if (loop.review_state !== "confirmed" || loop.assertion_origin === "model") {
      if (loop.review_state === "proposed") {
        reviewQueue.push({
          subject_id: loop.open_loop_id,
          subject_type: "open_loop",
          reason: "open_loop_unconfirmed",
        });
      }
      continue;
    }
    const evidence = loop.evidence_source_record_ids
      .map((sourceRecordId) => projectedMessages.get(sourceRecordId)!)
      .sort(
        (left, right) =>
          timestamp(left.observed_at) - timestamp(right.observed_at) ||
          left.source_record_id.localeCompare(right.source_record_id),
      );
    projectedLoops.push({
      ...loop,
      evidence_source_record_ids: [...loop.evidence_source_record_ids],
      native_thread_keys: [...new Set(evidence.map(nativeThreadKey))].sort(),
      opened_at: evidence[0]!.observed_at,
      last_activity_at: evidence.at(-1)!.observed_at,
    });
  }

  projectedLoops.sort(
    (left, right) =>
      timestamp(left.opened_at) - timestamp(right.opened_at) ||
      left.open_loop_id.localeCompare(right.open_loop_id),
  );

  const nativeThreadMessages = new Map<string, ProjectedMessage[]>();
  for (const message of projectedMessages.values()) {
    const key = nativeThreadKey(message);
    const messages = nativeThreadMessages.get(key) ?? [];
    if (messages.some((candidate) => candidate.canonical_entity_id !== message.canonical_entity_id)) {
      throw new Error(`one provider-native thread resolved to multiple entities: ${key}`);
    }
    messages.push(message);
    nativeThreadMessages.set(key, messages);
  }

  const nativeThreads = [...nativeThreadMessages.entries()].map(([key, messages]) => {
    const first = messages[0]!;
    const threadRecordIds = new Set(messages.map((message) => message.source_record_id));
    const openLoopIds = projectedLoops
      .filter((loop) => loop.evidence_source_record_ids.some((id) => threadRecordIds.has(id)))
      .map((loop) => loop.open_loop_id)
      .sort();
    const unclassifiedRecordCount = messages.filter((message) => {
      const assertion = coverage.get(message.source_record_id);
      return !assertion || !acceptedCoverage(assertion) || assertion.disposition === "needs_review";
    }).length;
    return {
      native_thread_key: key,
      provider: first.provider,
      connection_id: first.connection_id,
      provider_thread_id: first.provider_thread_id,
      canonical_entity_id: first.canonical_entity_id,
      partner_categories: [...new Set(messages.map((message) => message.partner_category))].sort(),
      open_loop_ids: openLoopIds,
      unclassified_record_count: unclassifiedRecordCount,
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
  for (const message of projectedMessages.values()) {
    const messages = entityMessages.get(message.canonical_entity_id) ?? [];
    messages.push(message);
    entityMessages.set(message.canonical_entity_id, messages);
  }
  const entityTimelines = [...entityMessages.entries()]
    .map(([canonicalEntityId, messages]) => ({
      canonical_entity_id: canonicalEntityId,
      partner_categories: [...new Set(messages.map((message) => message.partner_category))].sort(),
      native_thread_keys: [...new Set(messages.map(nativeThreadKey))].sort(),
      open_loop_ids: projectedLoops
        .filter((loop) => loop.canonical_entity_id === canonicalEntityId)
        .map((loop) => loop.open_loop_id)
        .sort(),
      messages,
    }))
    .sort((left, right) => left.canonical_entity_id.localeCompare(right.canonical_entity_id));

  const terminalStates = new Set<OpenLoopLifecycle>(["resolved", "superseded", "dismissed"]);
  const openLoops = projectedLoops.filter((loop) => !terminalStates.has(loop.lifecycle));
  const attentionQueue = openLoops
    .filter((loop) => loop.lifecycle !== "waiting_on_partner")
    .sort(
      (left, right) =>
        queuePriority(left) - queuePriority(right) ||
        timestamp(left.last_activity_at) - timestamp(right.last_activity_at) ||
        left.open_loop_id.localeCompare(right.open_loop_id),
    );
  const waitingOnPartner = openLoops
    .filter((loop) => loop.lifecycle === "waiting_on_partner")
    .sort(
      (left, right) =>
        timestamp(left.follow_up_at ?? left.last_activity_at) -
          timestamp(right.follow_up_at ?? right.last_activity_at) ||
        left.open_loop_id.localeCompare(right.open_loop_id),
    );

  reviewQueue.sort(
    (left, right) =>
      left.subject_type.localeCompare(right.subject_type) ||
      left.subject_id.localeCompare(right.subject_id),
  );
  return {
    entity_timelines: entityTimelines,
    native_threads: nativeThreads,
    reviewed_loops: projectedLoops,
    open_loops: openLoops,
    attention_queue: attentionQueue,
    waiting_on_partner: waitingOnPartner,
    review_queue: reviewQueue,
  };
}

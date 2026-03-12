import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { GlowbotHubStore } from "./store.mjs";

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function jsonResponse(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function operationResult(res, result) {
  jsonResponse(res, 200, { result });
}

function operationError(res, code, message, details) {
  jsonResponse(res, 200, {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    return {};
  }
  return asRecord(JSON.parse(text));
}

function requireAuthHeader(req) {
  const expected =
    asString(process.env.GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN) ||
    asString(process.env.GLOWBOT_HUB_FRONTDOOR_TOKEN);
  if (!expected) {
    throw new Error("hub relay auth token is not configured");
  }
  const header = asString(req.headers.authorization);
  if (header !== `Bearer ${expected}`) {
    throw new Error("unauthorized relay request");
  }
}

const CLINIC_APP_ALLOWED_OPERATIONS = new Set([
  "glowbotHub.clinicProfiles.resolve",
  "glowbotHub.benchmarks.publishSnapshot",
  "glowbotHub.benchmarks.query",
  "glowbotHub.productFlags.list",
]);

function extractRelayContext(req, queryOrBody) {
  const record = asRecord(queryOrBody);
  const context = {
    serverId: asString(req.headers["x-nexus-server-id"]),
    tenantId: asString(req.headers["x-nexus-tenant-id"]),
    entityId: asString(req.headers["x-nexus-entity-id"]),
    appId: asString(req.headers["x-nexus-app-id"]) || asString(record.app_id) || asString(record.appId),
    adapterId:
      asString(req.headers["x-nexus-adapter-id"]) || asString(record.adapter_id) || asString(record.adapter),
    connectionProfileId:
      asString(req.headers["x-nexus-connection-profile-id"]) ||
      asString(record.connection_profile_id) ||
      asString(record.connectionProfileId),
    authMethodId:
      asString(req.headers["x-nexus-auth-method-id"]) ||
      asString(record.auth_method_id) ||
      asString(record.authMethodId),
    scope:
      asString(req.headers["x-nexus-connection-scope"]) ||
      asString(record.scope) ||
      "app",
    managedProfileId:
      asString(req.headers["x-nexus-managed-profile-id"]) ||
      asString(record.managed_profile_id) ||
      asString(record.managedProfileId),
    service: asString(record.service),
  };
  if (!context.serverId || !context.tenantId || !context.entityId) {
    throw new Error("missing authoritative frontdoor context");
  }
  if (!context.appId || !context.adapterId || !context.connectionProfileId || !context.authMethodId) {
    throw new Error("missing managed profile routing tuple");
  }
  return context;
}

function extractProductControlPlaneRelayContext(req, body) {
  const record = asRecord(body);
  const operation =
    asString(req.headers["x-nexus-product-operation"]) ||
    asString(record.operation);
  const payload = asRecord(record.payload);
  const context = {
    serverId: asString(req.headers["x-nexus-server-id"]),
    tenantId: asString(req.headers["x-nexus-tenant-id"]),
    entityId: asString(req.headers["x-nexus-entity-id"]),
    appId: asString(req.headers["x-nexus-app-id"]) || asString(record.appId),
    operation,
    payload,
  };
  if (!context.serverId || !context.tenantId || !context.entityId || !context.appId) {
    throw new Error("missing authoritative frontdoor context");
  }
  if (!context.operation) {
    throw new Error("missing relayed product control plane operation");
  }
  return context;
}

function buildProfileKey(clinicProfile) {
  const specialty = asString(clinicProfile.specialty) || "unknown";
  const monthlyAdSpendBand = asString(clinicProfile.monthlyAdSpendBand) || "unknown";
  const patientVolumeBand = asString(clinicProfile.patientVolumeBand) || "unknown";
  const locationCountBand = asString(clinicProfile.locationCountBand) || "unknown";
  return [specialty, monthlyAdSpendBand, patientVolumeBand, locationCountBand].join("|");
}

function quantile(sortedValues, q) {
  if (sortedValues.length === 0) {
    return null;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }
  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return sortedValues[lower];
  }
  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function resolveSecret(secretRef) {
  const ref = asString(secretRef);
  if (!ref) {
    throw new Error("managed profile secretRef is required");
  }
  if (ref.startsWith("env:")) {
    const envKey = ref.slice(4).trim();
    const value = asString(process.env[envKey]);
    if (!value) {
      throw new Error(`secret env var is empty: ${envKey}`);
    }
    return value;
  }
  throw new Error(`unsupported secretRef: ${ref}`);
}

function createAuditEvent(params) {
  return {
    auditEventId: randomUUID(),
    createdAtMs: Date.now(),
    ...params,
  };
}

function appendAuditEvent(store, event) {
  store.update((state) => ({
    ...state,
    auditEvents: [...state.auditEvents, event].slice(-500),
  }));
}

function pickManagedProfile(store, context) {
  const state = store.read();
  const match = state.managedProfiles.find((profile) => {
    if (profile.archivedAtMs) {
      return false;
    }
    return (
      profile.managedProfileId === context.managedProfileId &&
      profile.appId === context.appId &&
      profile.adapterId === context.adapterId &&
      profile.connectionProfileId === context.connectionProfileId &&
      profile.authMethodId === context.authMethodId
    );
  });
  return match ?? null;
}

async function exchangeManagedOauth(profile, payload, fetchImpl) {
  if (profile.flowKind !== "oauth2") {
    throw new Error(`unsupported flowKind for exchange: ${profile.flowKind}`);
  }
  const secret = resolveSecret(profile.secretRef);
  const code = asString(payload.code);
  const redirectUri = asString(payload.redirectUri);
  if (!code || !redirectUri) {
    throw new Error("oauth exchange requires code and redirectUri");
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: profile.clientId,
    client_secret: secret,
  });
  const response = await fetchImpl(profile.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`provider exchange failed: ${response.status}`);
  }
  return json;
}

function validateClinicBenchmarkSnapshot(snapshot) {
  const clinicId = asString(snapshot.clinicId);
  const periodStart = asString(snapshot.periodStart);
  const periodEnd = asString(snapshot.periodEnd);
  const clinicProfile = asRecord(snapshot.clinicProfile);
  const metrics = asRecord(snapshot.metrics);
  const source = asRecord(snapshot.source);
  if (!clinicId || !periodStart || !periodEnd) {
    throw new Error("snapshot requires clinicId, periodStart, and periodEnd");
  }
  if (!asString(clinicProfile.specialty)) {
    throw new Error("snapshot requires clinicProfile.specialty");
  }
  const metricNames = Object.keys(metrics);
  if (metricNames.length === 0) {
    throw new Error("snapshot requires metrics");
  }
  return {
    clinicId,
    periodStart,
    periodEnd,
    clinicProfile: {
      specialty: asString(clinicProfile.specialty),
      monthlyAdSpendBand: asString(clinicProfile.monthlyAdSpendBand) || "unknown",
      patientVolumeBand: asString(clinicProfile.patientVolumeBand) || "unknown",
      locationCountBand: asString(clinicProfile.locationCountBand) || "unknown",
    },
    metrics: Object.fromEntries(
      metricNames.map((metricName) => {
        const numeric = asNumber(metrics[metricName]);
        return [metricName, numeric];
      }),
    ),
    source: {
      appId: asString(source.appId) || "glowbot",
      generatedAtMs: asNumber(source.generatedAtMs) ?? Date.now(),
      dataFreshnessMs: asNumber(source.dataFreshnessMs) ?? 0,
    },
  };
}

function buildPeerRecordsFromSnapshots(snapshots, profileKey, periodStart, periodEnd) {
  const eligible = snapshots.filter((snapshot) => {
    return (
      snapshot.profileKey === profileKey &&
      snapshot.periodStart === periodStart &&
      snapshot.periodEnd === periodEnd
    );
  });
  const metricNames = new Set();
  for (const snapshot of eligible) {
    for (const metricName of Object.keys(asRecord(snapshot.metrics))) {
      metricNames.add(metricName);
    }
  }
  const freshnessMs = eligible.length
    ? Date.now() - Math.max(...eligible.map((entry) => asNumber(entry.source?.generatedAtMs) ?? 0))
    : null;
  const records = [];
  for (const metricName of metricNames) {
    const values = eligible
      .map((snapshot) => asNumber(asRecord(snapshot.metrics)[metricName]))
      .filter((value) => value !== null)
      .sort((left, right) => left - right);
    if (values.length < 2) {
      continue;
    }
    records.push({
      profileKey,
      periodStart,
      periodEnd,
      metricName,
      peerMedian: quantile(values, 0.5),
      peerP25: quantile(values, 0.25),
      peerP75: quantile(values, 0.75),
      sampleSize: values.length,
      source: "peer_network",
      freshnessMs: freshnessMs ?? 0,
    });
  }
  return records;
}

function buildSeedRecords(seeds, profileKey, periodKind) {
  return seeds
    .filter((seed) => seed.profileKey === profileKey && seed.periodKind === periodKind)
    .map((seed) => ({
      profileKey: seed.profileKey,
      periodStart: "",
      periodEnd: "",
      metricName: seed.metricName,
      peerMedian: seed.peerMedian,
      peerP25: seed.peerP25,
      peerP75: seed.peerP75,
      sampleSize: 0,
      source: "industry_seed",
      freshnessMs: Date.now() - seed.publishedAtMs,
    }));
}

function benchmarkPeriodKind(periodStart, periodEnd) {
  if (!periodStart || !periodEnd) {
    return "30d";
  }
  const start = Date.parse(`${periodStart}T00:00:00.000Z`);
  const end = Date.parse(`${periodEnd}T00:00:00.000Z`);
  const days = Math.round((end - start) / 86_400_000) + 1;
  if (days <= 7) {
    return "7d";
  }
  if (days <= 30) {
    return "30d";
  }
  return "90d";
}

function buildClinicSummaries(snapshots) {
  const clinics = new Map();
  for (const snapshot of snapshots) {
    const existing = clinics.get(snapshot.clinicId);
    const generatedAtMs = asNumber(snapshot.source?.generatedAtMs) ?? 0;
    if (!existing || generatedAtMs > existing.generatedAtMs) {
      clinics.set(snapshot.clinicId, {
        clinicId: snapshot.clinicId,
        profileKey: snapshot.profileKey,
        clinicProfile: snapshot.clinicProfile,
        latestPeriodStart: snapshot.periodStart,
        latestPeriodEnd: snapshot.periodEnd,
        generatedAtMs,
      });
    }
  }
  return Array.from(clinics.values()).sort((left, right) => left.clinicId.localeCompare(right.clinicId));
}

function createHubHandlers(store) {
  return {
    "glowbotHub.managedProfiles.list": async (payload) => {
      const includeArchived = asRecord(payload).includeArchived === true;
      const state = store.read();
      return {
        managedProfiles: state.managedProfiles.filter((profile) => includeArchived || !profile.archivedAtMs),
      };
    },
    "glowbotHub.managedProfiles.get": async (payload) => {
      const managedProfileId = asString(asRecord(payload).managedProfileId);
      const profile = store.read().managedProfiles.find((entry) => entry.managedProfileId === managedProfileId);
      if (!profile) {
        throw new Error(`managed profile not found: ${managedProfileId}`);
      }
      return { managedProfile: profile };
    },
    "glowbotHub.managedProfiles.create": async (payload) => {
      const record = asRecord(payload);
      const managedProfileId = asString(record.managedProfileId);
      if (!managedProfileId) {
        throw new Error("managedProfileId is required");
      }
      const profile = {
        managedProfileId,
        displayName: asString(record.displayName) || managedProfileId,
        appId: asString(record.appId),
        adapterId: asString(record.adapterId),
        connectionProfileId: asString(record.connectionProfileId),
        authMethodId: asString(record.authMethodId),
        flowKind: asString(record.flowKind) || "oauth2",
        service: asString(record.service),
        authorizeUrl: asString(record.authorizeUrl),
        tokenUrl: asString(record.tokenUrl),
        clientId: asString(record.clientId),
        secretRef: asString(record.secretRef),
        scopes: asArray(record.scopes).map((entry) => asString(entry)).filter(Boolean),
        authorizeParams: asRecord(record.authorizeParams),
        status: asString(record.status) || "active",
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      };
      if (!profile.appId || !profile.adapterId || !profile.connectionProfileId || !profile.authMethodId) {
        throw new Error("managed profile requires appId, adapterId, connectionProfileId, and authMethodId");
      }
      store.update((state) => ({
        ...state,
        managedProfiles: [...state.managedProfiles.filter((entry) => entry.managedProfileId !== managedProfileId), profile],
        auditEvents: [
          ...state.auditEvents,
          createAuditEvent({
            requestKind: "operator_action",
            operation: "managedProfiles.create",
            managedProfileId,
            outcome: "success",
          }),
        ].slice(-500),
      }));
      return { managedProfile: profile };
    },
    "glowbotHub.managedProfiles.update": async (payload) => {
      const record = asRecord(payload);
      const managedProfileId = asString(record.managedProfileId);
      if (!managedProfileId) {
        throw new Error("managedProfileId is required");
      }
      let updatedProfile = null;
      store.update((state) => ({
        ...state,
        managedProfiles: state.managedProfiles.map((entry) => {
          if (entry.managedProfileId !== managedProfileId) {
            return entry;
          }
          updatedProfile = {
            ...entry,
            ...Object.fromEntries(
              Object.entries(record).filter(([key, value]) => key !== "managedProfileId" && value !== undefined),
            ),
            updatedAtMs: Date.now(),
          };
          return updatedProfile;
        }),
        auditEvents: [
          ...state.auditEvents,
          createAuditEvent({
            requestKind: "operator_action",
            operation: "managedProfiles.update",
            managedProfileId,
            outcome: "success",
          }),
        ].slice(-500),
      }));
      if (!updatedProfile) {
        throw new Error(`managed profile not found: ${managedProfileId}`);
      }
      return { managedProfile: updatedProfile };
    },
    "glowbotHub.managedProfiles.archive": async (payload) => {
      const managedProfileId = asString(asRecord(payload).managedProfileId);
      if (!managedProfileId) {
        throw new Error("managedProfileId is required");
      }
      store.update((state) => ({
        ...state,
        managedProfiles: state.managedProfiles.map((entry) =>
          entry.managedProfileId === managedProfileId
            ? { ...entry, archivedAtMs: Date.now(), status: "archived", updatedAtMs: Date.now() }
            : entry,
        ),
        auditEvents: [
          ...state.auditEvents,
          createAuditEvent({
            requestKind: "operator_action",
            operation: "managedProfiles.archive",
            managedProfileId,
            outcome: "success",
          }),
        ].slice(-500),
      }));
      return { archived: true };
    },
    "glowbotHub.diagnostics.summary": async () => {
      const state = store.read();
      const failures = state.auditEvents.filter((entry) => entry.outcome === "failed" || entry.outcome === "rejected");
      return {
        status: "ok",
        managedProfileCount: state.managedProfiles.filter((entry) => !entry.archivedAtMs).length,
        snapshotCount: state.snapshots.length,
        seedCount: state.seeds.length,
        cohortCount: state.cohorts.length,
        recentRelayFailures: failures.slice(-10).reverse(),
      };
    },
    "glowbotHub.audit.list": async (payload) => {
      const limit = asNumber(asRecord(payload).limit) ?? 50;
      const kind = asString(asRecord(payload).kind);
      const state = store.read();
      const events = state.auditEvents
        .filter((entry) => !kind || asString(entry.requestKind) === kind || asString(entry.operation) === kind)
        .slice(-limit)
        .reverse();
      return { auditEvents: events };
    },
    "glowbotHub.clinics.list": async () => {
      return {
        clinics: buildClinicSummaries(store.read().snapshots),
      };
    },
    "glowbotHub.clinics.get": async (payload) => {
      const clinicId = asString(asRecord(payload).clinicId);
      if (!clinicId) {
        throw new Error("clinicId is required");
      }
      const state = store.read();
      const clinics = buildClinicSummaries(state.snapshots);
      const clinic = clinics.find((entry) => entry.clinicId === clinicId);
      if (!clinic) {
        throw new Error(`clinic not found: ${clinicId}`);
      }
      const snapshots = state.snapshots
        .filter((entry) => entry.clinicId === clinicId)
        .sort((left, right) => (asNumber(right.source?.generatedAtMs) ?? 0) - (asNumber(left.source?.generatedAtMs) ?? 0));
      return { clinic, snapshots };
    },
    "glowbotHub.productFlags.list": async () => {
      return { productFlags: store.read().productFlags };
    },
    "glowbotHub.productFlags.update": async (payload) => {
      const record = asRecord(payload);
      const key = asString(record.key);
      if (!key) {
        throw new Error("key is required");
      }
      const nextFlag = {
        key,
        value: record.value,
        description: asString(record.description),
        updatedAtMs: Date.now(),
      };
      store.update((state) => ({
        ...state,
        productFlags: [...state.productFlags.filter((entry) => entry.key !== key), nextFlag],
        auditEvents: [
          ...state.auditEvents,
          createAuditEvent({
            requestKind: "operator_action",
            operation: "productFlags.update",
            outcome: "success",
          }),
        ].slice(-500),
      }));
      return { productFlag: nextFlag };
    },
    "glowbotHub.benchmarks.publishSnapshot": async (payload) => {
      const snapshot = validateClinicBenchmarkSnapshot(payload);
      const profileKey = buildProfileKey(snapshot.clinicProfile);
      const storedSnapshot = {
        snapshotId: randomUUID(),
        profileKey,
        publishedAtMs: Date.now(),
        ...snapshot,
      };
      store.update((state) => ({
        ...state,
        snapshots: [
          ...state.snapshots.filter(
            (entry) =>
              !(
                entry.clinicId === storedSnapshot.clinicId &&
                entry.periodStart === storedSnapshot.periodStart &&
                entry.periodEnd === storedSnapshot.periodEnd &&
                entry.profileKey === profileKey
              ),
          ),
          storedSnapshot,
        ],
      }));
      return { snapshotId: storedSnapshot.snapshotId, profileKey };
    },
    "glowbotHub.benchmarks.query": async (payload) => {
      const record = asRecord(payload);
      const clinicProfile = asRecord(record.clinicProfile);
      const profileKey = asString(record.profileKey) || buildProfileKey(clinicProfile);
      const periodStart = asString(record.periodStart);
      const periodEnd = asString(record.periodEnd);
      const state = store.read();
      const liveRecords = buildPeerRecordsFromSnapshots(state.snapshots, profileKey, periodStart, periodEnd);
      const periodKind = benchmarkPeriodKind(periodStart, periodEnd);
      const records = liveRecords.length > 0 ? liveRecords : buildSeedRecords(state.seeds, profileKey, periodKind);
      return {
        profileKey,
        periodStart,
        periodEnd,
        records,
      };
    },
    "glowbotHub.benchmarks.networkHealth": async () => {
      const state = store.read();
      const activeProfiles = new Set(state.snapshots.map((entry) => entry.profileKey));
      const staleThresholdMs = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const staleSnapshots = state.snapshots.filter(
        (entry) => now - (asNumber(entry.source?.generatedAtMs) ?? 0) > staleThresholdMs,
      );
      return {
        cohortCount: state.cohorts.length,
        activeProfileCount: activeProfiles.size,
        snapshotCount: state.snapshots.length,
        seedCount: state.seeds.length,
        staleSnapshotCount: staleSnapshots.length,
      };
    },
    "glowbotHub.benchmarks.seed.publish": async (payload) => {
      const record = asRecord(payload);
      const seeds = asArray(record.records);
      if (seeds.length === 0) {
        throw new Error("records are required");
      }
      const normalizedSeeds = seeds.map((entry) => {
        const item = asRecord(entry);
        const seedRecordId = asString(item.seedRecordId) || randomUUID();
        return {
          seedRecordId,
          profileKey: asString(item.profileKey),
          periodKind: asString(item.periodKind) || "30d",
          metricName: asString(item.metricName),
          peerMedian: asNumber(item.peerMedian),
          peerP25: asNumber(item.peerP25),
          peerP75: asNumber(item.peerP75),
          sourceLabel: asString(item.sourceLabel) || "operator",
          publishedAtMs: Date.now(),
        };
      });
      store.update((state) => ({
        ...state,
        seeds: [
          ...state.seeds.filter(
            (existing) =>
              !normalizedSeeds.some(
                (incoming) =>
                  incoming.profileKey === existing.profileKey &&
                  incoming.periodKind === existing.periodKind &&
                  incoming.metricName === existing.metricName,
              ),
          ),
          ...normalizedSeeds,
        ],
      }));
      return { records: normalizedSeeds };
    },
    "glowbotHub.benchmarks.seed.list": async (payload) => {
      const record = asRecord(payload);
      const profileKey = asString(record.profileKey);
      const periodKind = asString(record.periodKind);
      const seeds = store.read().seeds.filter((seed) => {
        return (!profileKey || seed.profileKey === profileKey) && (!periodKind || seed.periodKind === periodKind);
      });
      return { records: seeds };
    },
    "glowbotHub.cohorts.list": async () => {
      return { cohorts: store.read().cohorts };
    },
    "glowbotHub.cohorts.update": async (payload) => {
      const cohorts = asArray(asRecord(payload).cohorts).map((entry) => {
        const record = asRecord(entry);
        return {
          profileKey: asString(record.profileKey) || buildProfileKey(record),
          specialty: asString(record.specialty),
          monthlyAdSpendBand: asString(record.monthlyAdSpendBand),
          patientVolumeBand: asString(record.patientVolumeBand),
          locationCountBand: asString(record.locationCountBand),
          active: record.active !== false,
          updatedAtMs: Date.now(),
          createdAtMs: asNumber(record.createdAtMs) ?? Date.now(),
        };
      });
      store.update((state) => ({
        ...state,
        cohorts,
      }));
      return { cohorts };
    },
    "glowbotHub.clinicProfiles.resolve": async (payload) => {
      const clinicProfile = asRecord(asRecord(payload).clinicProfile);
      const resolved = {
        specialty: asString(clinicProfile.specialty),
        monthlyAdSpendBand: asString(clinicProfile.monthlyAdSpendBand) || "unknown",
        patientVolumeBand: asString(clinicProfile.patientVolumeBand) || "unknown",
        locationCountBand: asString(clinicProfile.locationCountBand) || "unknown",
      };
      return {
        clinicProfile: resolved,
        profileKey: buildProfileKey(resolved),
      };
    },
  };
}

export function createHubServer({ dataDir = path.join(process.cwd(), ".data"), fetchImpl = fetch } = {}) {
  const store = new GlowbotHubStore(dataDir);
  const handlers = createHubHandlers(store);

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        jsonResponse(res, 404, { error: "not found" });
        return;
      }
      const url = new URL(req.url, "http://127.0.0.1");

      if (req.method === "GET" && url.pathname === "/health") {
        jsonResponse(res, 200, { status: "ok" });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/internal/frontdoor/managed-connections/profile") {
        requireAuthHeader(req);
        const relayContext = extractRelayContext(req, Object.fromEntries(url.searchParams.entries()));
        const profile = pickManagedProfile(store, relayContext);
        if (!profile) {
          appendAuditEvent(
            store,
            createAuditEvent({
              requestKind: "profile_lookup",
              serverId: relayContext.serverId,
              tenantId: relayContext.tenantId,
              appId: relayContext.appId,
              adapterId: relayContext.adapterId,
              connectionProfileId: relayContext.connectionProfileId,
              authMethodId: relayContext.authMethodId,
              managedProfileId: relayContext.managedProfileId,
              outcome: "rejected",
              errorCode: "profile_not_found",
            }),
          );
          jsonResponse(res, 404, { error: "managed profile not found" });
          return;
        }
        appendAuditEvent(
          store,
          createAuditEvent({
            requestKind: "profile_lookup",
            serverId: relayContext.serverId,
            tenantId: relayContext.tenantId,
            appId: relayContext.appId,
            adapterId: relayContext.adapterId,
            connectionProfileId: relayContext.connectionProfileId,
            authMethodId: relayContext.authMethodId,
            managedProfileId: relayContext.managedProfileId,
            resolvedProfileId: profile.managedProfileId,
            outcome: "success",
          }),
        );
        jsonResponse(res, 200, {
          managedProfileId: profile.managedProfileId,
          service: profile.service,
          authUri: profile.authorizeUrl,
          clientId: profile.clientId,
          scopes: profile.scopes,
          authorizeParams: profile.authorizeParams,
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/internal/frontdoor/managed-connections/profile/exchange") {
        requireAuthHeader(req);
        const body = await readJsonBody(req);
        const relayContext = extractRelayContext(req, body);
        const profile = pickManagedProfile(store, relayContext);
        if (!profile) {
          appendAuditEvent(
            store,
            createAuditEvent({
              requestKind: "profile_exchange",
              serverId: relayContext.serverId,
              tenantId: relayContext.tenantId,
              appId: relayContext.appId,
              adapterId: relayContext.adapterId,
              connectionProfileId: relayContext.connectionProfileId,
              authMethodId: relayContext.authMethodId,
              managedProfileId: relayContext.managedProfileId,
              outcome: "rejected",
              errorCode: "profile_not_found",
            }),
          );
          jsonResponse(res, 404, { error: "managed profile not found" });
          return;
        }
        try {
          const providerResponse = await exchangeManagedOauth(profile, body, fetchImpl);
          appendAuditEvent(
            store,
            createAuditEvent({
              requestKind: "profile_exchange",
              serverId: relayContext.serverId,
              tenantId: relayContext.tenantId,
              appId: relayContext.appId,
              adapterId: relayContext.adapterId,
              connectionProfileId: relayContext.connectionProfileId,
              authMethodId: relayContext.authMethodId,
              managedProfileId: relayContext.managedProfileId,
              resolvedProfileId: profile.managedProfileId,
              outcome: "success",
            }),
          );
          jsonResponse(res, 200, providerResponse);
        } catch (error) {
          appendAuditEvent(
            store,
            createAuditEvent({
              requestKind: "profile_exchange",
              serverId: relayContext.serverId,
              tenantId: relayContext.tenantId,
              appId: relayContext.appId,
              adapterId: relayContext.adapterId,
              connectionProfileId: relayContext.connectionProfileId,
              authMethodId: relayContext.authMethodId,
              managedProfileId: relayContext.managedProfileId,
              resolvedProfileId: profile.managedProfileId,
              outcome: "failed",
              errorCode: "exchange_failed",
              errorDetail: error instanceof Error ? error.message : String(error),
            }),
          );
          jsonResponse(res, 500, { error: "managed profile exchange failed" });
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/internal/frontdoor/product-control-plane/call") {
        requireAuthHeader(req);
        const body = await readJsonBody(req);
        const relayContext = extractProductControlPlaneRelayContext(req, body);
        if (!CLINIC_APP_ALLOWED_OPERATIONS.has(relayContext.operation)) {
          appendAuditEvent(
            store,
            createAuditEvent({
              requestKind: "product_control_plane_call",
              serverId: relayContext.serverId,
              tenantId: relayContext.tenantId,
              entityId: relayContext.entityId,
              appId: relayContext.appId,
              operation: relayContext.operation,
              outcome: "rejected",
              errorCode: "operation_not_allowed",
            }),
          );
          jsonResponse(res, 403, { error: "operation_not_allowed" });
          return;
        }
        const handler = handlers[relayContext.operation];
        if (!handler) {
          appendAuditEvent(
            store,
            createAuditEvent({
              requestKind: "product_control_plane_call",
              serverId: relayContext.serverId,
              tenantId: relayContext.tenantId,
              entityId: relayContext.entityId,
              appId: relayContext.appId,
              operation: relayContext.operation,
              outcome: "rejected",
              errorCode: "unknown_operation",
            }),
          );
          jsonResponse(res, 404, { error: "unknown operation" });
          return;
        }
        try {
          const result = await handler(relayContext.payload);
          appendAuditEvent(
            store,
            createAuditEvent({
              requestKind: "product_control_plane_call",
              serverId: relayContext.serverId,
              tenantId: relayContext.tenantId,
              entityId: relayContext.entityId,
              appId: relayContext.appId,
              operation: relayContext.operation,
              outcome: "success",
            }),
          );
          operationResult(res, result);
        } catch (error) {
          appendAuditEvent(
            store,
            createAuditEvent({
              requestKind: "product_control_plane_call",
              serverId: relayContext.serverId,
              tenantId: relayContext.tenantId,
              entityId: relayContext.entityId,
              appId: relayContext.appId,
              operation: relayContext.operation,
              outcome: "failed",
              errorCode: error instanceof Error ? error.message : String(error),
            }),
          );
          operationError(
            res,
            "hub_operation_failed",
            error instanceof Error ? error.message : String(error),
          );
        }
        return;
      }

      if (req.method === "POST" && url.pathname.startsWith("/operations/")) {
        const operationName = url.pathname.slice("/operations/".length);
        const body = await readJsonBody(req);
        const payload = asRecord(body.payload);
        const handler = handlers[operationName];
        if (!handler) {
          operationError(res, "NOT_FOUND", `unknown operation: ${operationName}`);
          return;
        }
        const result = await handler(payload);
        operationResult(res, result);
        return;
      }

      jsonResponse(res, 404, { error: "not found" });
    } catch (error) {
      if (req.url?.startsWith("/operations/")) {
        operationError(res, "INTERNAL_ERROR", error instanceof Error ? error.message : String(error));
        return;
      }
      jsonResponse(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return { server, store };
}

export async function startHubServer() {
  const port = Number.parseInt(process.env.NEX_SERVICE_PORT ?? process.argv[2] ?? "0", 10);
  const dataDir = process.env.NEX_APP_DATA_DIR || path.join(process.cwd(), ".data");
  const { server } = createHubServer({ dataDir });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startHubServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

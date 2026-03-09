import fs from "node:fs";
import path from "node:path";
import type {
  GlowbotClinicProfile,
  GlowbotClinicProfileUpdateParams,
} from "../../shared/types.js";

const CLINIC_PROFILE_FILENAME = "clinic-profile.json";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clinicProfilePath(dataDir: string): string {
  return path.join(dataDir, CLINIC_PROFILE_FILENAME);
}

function normalizeBand(value: unknown): string {
  return asString(value) ?? "unknown";
}

function parseClinicProfile(raw: unknown): GlowbotClinicProfile | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const source = asRecord(record.source);
  const clinicId = asString(record.clinicId);
  const specialty = asString(record.specialty);
  const updatedAtMs = asNumber(source?.updatedAtMs);
  const version = asNumber(source?.version);
  const updatedBy = asString(source?.updatedBy);

  if (!clinicId || !specialty || updatedAtMs === null || version === null) {
    return null;
  }

  return {
    clinicId,
    specialty,
    monthlyAdSpendBand: normalizeBand(record.monthlyAdSpendBand),
    patientVolumeBand: normalizeBand(record.patientVolumeBand),
    locationCountBand: normalizeBand(record.locationCountBand),
    source: {
      updatedAtMs,
      updatedBy: updatedBy === "operator" ? "operator" : "clinic_app",
      version: Math.max(1, Math.floor(version)),
    },
  };
}

export function loadClinicProfile(dataDir: string): GlowbotClinicProfile | null {
  try {
    const raw = fs.readFileSync(clinicProfilePath(dataDir), "utf8");
    return parseClinicProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveClinicProfile(params: {
  dataDir: string;
  clinicId: string;
  updates: GlowbotClinicProfileUpdateParams;
}): GlowbotClinicProfile {
  const specialty = asString(params.updates.specialty);
  if (!specialty) {
    throw new Error("specialty is required");
  }

  const previous = loadClinicProfile(params.dataDir);
  const profile: GlowbotClinicProfile = {
    clinicId: previous?.clinicId ?? params.clinicId,
    specialty,
    monthlyAdSpendBand: normalizeBand(
      params.updates.monthlyAdSpendBand ?? previous?.monthlyAdSpendBand,
    ),
    patientVolumeBand: normalizeBand(
      params.updates.patientVolumeBand ?? previous?.patientVolumeBand,
    ),
    locationCountBand: normalizeBand(
      params.updates.locationCountBand ?? previous?.locationCountBand,
    ),
    source: {
      updatedAtMs: Date.now(),
      updatedBy: "clinic_app",
      version: (previous?.source.version ?? 0) + 1,
    },
  };

  fs.mkdirSync(params.dataDir, { recursive: true });
  fs.writeFileSync(
    clinicProfilePath(params.dataDir),
    `${JSON.stringify(profile, null, 2)}\n`,
    "utf8",
  );

  return profile;
}

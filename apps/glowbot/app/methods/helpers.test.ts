import { describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getConnectMethodKind,
  integrationCategoryForAdapter,
  mapRuntimeStatusToGlowbot,
  mapRuntimeAuthMethod,
  loadManifestAdapters,
  mapAdapterEntry,
  asNonEmptyString,
  asNumber,
  resolveBackfillSince,
  resetManifestAdapterCacheForTests,
} from "./helpers";

describe("integrationCategoryForAdapter", () => {
  test("maps advertising adapters", () => {
    expect(integrationCategoryForAdapter("google")).toBe("advertising");
    expect(integrationCategoryForAdapter("meta-ads")).toBe("advertising");
  });

  test("maps EMR adapters", () => {
    expect(integrationCategoryForAdapter("patient-now-emr")).toBe("emr");
    expect(integrationCategoryForAdapter("zenoti-emr")).toBe("emr");
  });

  test("maps everything else to local", () => {
    expect(integrationCategoryForAdapter("apple-maps")).toBe("local");
    expect(integrationCategoryForAdapter("unknown")).toBe("local");
  });
});

describe("mapRuntimeStatusToGlowbot", () => {
  test("maps known statuses", () => {
    expect(mapRuntimeStatusToGlowbot("connected")).toBe("connected");
    expect(mapRuntimeStatusToGlowbot("disconnected")).toBe("not_connected");
    expect(mapRuntimeStatusToGlowbot("expired")).toBe("expired");
  });

  test("maps unknown statuses to error", () => {
    expect(mapRuntimeStatusToGlowbot("broken")).toBe("error");
    expect(mapRuntimeStatusToGlowbot("")).toBe("error");
  });
});

describe("mapRuntimeAuthMethod", () => {
  test("maps known auth methods", () => {
    expect(mapRuntimeAuthMethod("oauth2")).toBe("oauth2");
    expect(mapRuntimeAuthMethod("oauth")).toBe("oauth2");
    expect(mapRuntimeAuthMethod("api_key")).toBe("api-key");
    expect(mapRuntimeAuthMethod("apikey")).toBe("api-key");
    expect(mapRuntimeAuthMethod("file_upload")).toBe("file-upload");
    expect(mapRuntimeAuthMethod("upload")).toBe("file-upload");
    expect(mapRuntimeAuthMethod("custom_flow")).toBe("custom-flow");
  });

  test("returns null for unknown methods", () => {
    expect(mapRuntimeAuthMethod("custom")).toBeNull();
    expect(mapRuntimeAuthMethod(null)).toBeNull();
    expect(mapRuntimeAuthMethod(undefined)).toBeNull();
  });
});

describe("asNonEmptyString", () => {
  test("returns trimmed non-empty strings", () => {
    expect(asNonEmptyString("hello")).toBe("hello");
    expect(asNonEmptyString("  spaced  ")).toBe("spaced");
  });

  test("returns null for empty or non-string values", () => {
    expect(asNonEmptyString("")).toBeNull();
    expect(asNonEmptyString("   ")).toBeNull();
    expect(asNonEmptyString(42)).toBeNull();
    expect(asNonEmptyString(null)).toBeNull();
  });
});

describe("asNumber", () => {
  test("parses numbers and numeric strings", () => {
    expect(asNumber(42)).toBe(42);
    expect(asNumber("99")).toBe(99);
    expect(asNumber(0)).toBe(0);
  });

  test("returns null for non-numeric values", () => {
    expect(asNumber("abc")).toBeNull();
    expect(asNumber(NaN)).toBeNull();
    expect(asNumber(Infinity)).toBeNull();
    expect(asNumber(null)).toBeNull();
  });
});

describe("mapAdapterEntry", () => {
  test("maps a connected adapter entry", () => {
    const result = mapAdapterEntry({
      manifestAdapter: {
        id: "google",
        name: "Google",
        connectionProfiles: [
          {
            id: "glowbot-managed-google",
            displayName: "Connect with GlowBot Google",
            authMethodId: "google_oauth_managed",
            scope: "app",
          },
        ],
      },
      runtimeEntries: [
        {
          connectionId: "conn-google-1",
          adapter: "google",
          status: "connected",
          authMethodId: "google_oauth_managed",
          authMethod: "oauth2",
          scope: "app",
          appId: "glowbot",
          lastSync: 1700000000000,
          error: null,
          metadata: { coverage: 85 },
        },
      ],
    });

    expect(result.id).toBe("google");
    expect(result.name).toBe("Google");
    expect(result.category).toBe("advertising");
    expect(result.status).toBe("connected");
    expect(result.connectionProfiles[0]?.id).toBe("glowbot-managed-google");
    expect(result.connection).toBeDefined();
    expect(result.connection!.connectionId).toBe("conn-google-1");
    expect(result.connection!.authMethod).toBe("oauth2");
    expect(result.connection!.authMethodId).toBe("google_oauth_managed");
    expect(result.connection!.scope).toBe("app");
    expect(result.connection!.connectionProfileId).toBe("glowbot-managed-google");
    expect(result.connection!.coverage).toBe(85);
  });

  test("maps a disconnected adapter entry without connection details", () => {
    const result = mapAdapterEntry({
      manifestAdapter: {
        id: "patient-now-emr",
        name: "PatientNow EMR",
        connectionProfiles: [
          {
            id: "patient-now-api-key",
            displayName: "Enter API Key",
            authMethodId: "patient_now_api_key",
            scope: "server",
          },
        ],
      },
    });

    expect(result.status).toBe("not_connected");
    expect(result.connection).toBeUndefined();
    expect(result.category).toBe("emr");
  });
});

describe("manifest adapter helpers", () => {
  test("loads connection profiles from the app manifest", () => {
    resetManifestAdapterCacheForTests();
    const packageDir = path.join(os.tmpdir(), `glowbot-manifest-${Date.now()}`);
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "app.nexus.json"),
      JSON.stringify({
        adapters: [
          {
            id: "google",
            displayName: "Google",
            syncSchedule: {
              backfillDefault: "90d",
            },
            connectionProfiles: [
              {
                id: "glowbot-managed-google",
                displayName: "Connect with GlowBot Google",
                authMethodId: "google_oauth_managed",
                scope: "app",
              },
            ],
          },
        ],
      }),
    );

    const adapters = loadManifestAdapters(packageDir);
    expect(adapters).toHaveLength(1);
    expect(adapters[0]?.connectionProfiles[0]?.authMethodId).toBe("google_oauth_managed");
    expect(adapters[0]?.backfillDefault).toBe("90d");

    fs.rmSync(packageDir, { recursive: true, force: true });
  });

  test("maps connection profiles to connect method kinds", () => {
    resetManifestAdapterCacheForTests();
    const packageDir = path.join(os.tmpdir(), `glowbot-connect-${Date.now()}`);
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "app.nexus.json"),
      JSON.stringify({
        adapters: [
          {
            id: "callrail",
            displayName: "CallRail",
            connectionProfiles: [
              {
                id: "callrail-oauth",
                displayName: "Connect CallRail",
                authMethodId: "callrail_oauth_user",
                scope: "server",
              },
              {
                id: "callrail-api-token",
                displayName: "Enter API Token",
                authMethodId: "callrail_api_token",
                scope: "server",
              },
            ],
          },
        ],
      }),
    );

    expect(getConnectMethodKind(packageDir, "callrail", "callrail-oauth")).toBe("oauth2");
    expect(getConnectMethodKind(packageDir, "callrail", "callrail-api-token")).toBe("api-key");

    fs.rmSync(packageDir, { recursive: true, force: true });
  });

  test("resolves manifest backfill defaults to a concrete since date", () => {
    resetManifestAdapterCacheForTests();
    const packageDir = path.join(os.tmpdir(), `glowbot-backfill-${Date.now()}`);
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "app.nexus.json"),
      JSON.stringify({
        adapters: [
          {
            id: "google",
            displayName: "Google",
            syncSchedule: {
              backfillDefault: "90d",
            },
            connectionProfiles: [],
          },
          {
            id: "apple-maps",
            displayName: "Apple Maps",
            syncSchedule: {
              backfillDefault: "none",
            },
            connectionProfiles: [],
          },
        ],
      }),
    );

    expect(
      resolveBackfillSince({
        packageDir,
        adapterId: "google",
        now: new Date("2026-03-09T12:00:00.000Z"),
      }),
    ).toBe("2025-12-09");
    expect(
      resolveBackfillSince({
        packageDir,
        adapterId: "google",
        since: "2026-01-01",
      }),
    ).toBe("2026-01-01");
    expect(() =>
      resolveBackfillSince({
        packageDir,
        adapterId: "apple-maps",
      }),
    ).toThrow("does not declare a backfill default");

    fs.rmSync(packageDir, { recursive: true, force: true });
  });
});

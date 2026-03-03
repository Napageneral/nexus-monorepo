import { describe, expect, test } from "vitest";
import {
  integrationCategoryForAdapter,
  mapRuntimeStatusToGlowbot,
  mapRuntimeAuthMethod,
  mapAdapterEntry,
  asNonEmptyString,
  asNumber,
} from "./helpers";

describe("integrationCategoryForAdapter", () => {
  test("maps advertising adapters", () => {
    expect(integrationCategoryForAdapter("google-ads")).toBe("advertising");
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
      adapter: "google-ads",
      name: "Google Ads",
      status: "connected",
      authMethod: "oauth2",
      lastSync: 1700000000000,
      error: null,
      metadata: { coverage: 85 },
    });

    expect(result.id).toBe("google-ads");
    expect(result.name).toBe("Google Ads");
    expect(result.category).toBe("advertising");
    expect(result.status).toBe("connected");
    expect(result.connection).toBeDefined();
    expect(result.connection!.authMethod).toBe("oauth2");
    expect(result.connection!.coverage).toBe(85);
  });

  test("maps a disconnected adapter entry without connection details", () => {
    const result = mapAdapterEntry({
      adapter: "patient-now-emr",
      name: "PatientNow EMR",
      status: "disconnected",
      authMethod: null,
      lastSync: null,
      error: null,
    });

    expect(result.status).toBe("not_connected");
    expect(result.connection).toBeUndefined();
    expect(result.category).toBe("emr");
  });
});

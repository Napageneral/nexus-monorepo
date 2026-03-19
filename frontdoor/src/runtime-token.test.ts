import { describe, expect, it } from "vitest";
import { normalizeRuntimeScopes } from "./runtime-token.js";
import type { Principal } from "./types.js";

function buildPrincipal(overrides: Partial<Principal> = {}): Principal {
  return {
    userId: "user-owner",
    tenantId: "tenant-acme",
    entityId: "entity-owner",
    roles: ["operator"],
    scopes: ["*"],
    amr: ["password"],
    ...overrides,
  };
}

describe("normalizeRuntimeScopes", () => {
  it("maps frontdoor wildcard operator access to canonical runtime operator scope", () => {
    expect(normalizeRuntimeScopes(buildPrincipal())).toEqual(["operator.admin"]);
  });

  it("preserves explicit runtime operator scopes without reintroducing wildcard access", () => {
    expect(
      normalizeRuntimeScopes(
        buildPrincipal({
          scopes: ["*", "operator.read", "operator.write"],
        }),
      ),
    ).toEqual(["operator.read", "operator.write", "operator.admin"]);
  });

  it("leaves non-operator scopes untouched for non-operator roles", () => {
    expect(
      normalizeRuntimeScopes(
        buildPrincipal({
          roles: ["member"],
          scopes: ["apps.use", "records.read"],
        }),
      ),
    ).toEqual(["apps.use", "records.read"]);
  });
});

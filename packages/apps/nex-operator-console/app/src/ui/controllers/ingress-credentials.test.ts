import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createIngressCredential,
  loadIngressCredentials,
  revokeIngressCredential,
  rotateIngressCredential,
  type IngressCredentialsState,
} from "./ingress-credentials.ts";

function createState(overrides: Partial<IngressCredentialsState> = {}): IngressCredentialsState {
  return {
    client: null,
    connected: true,
    ingressCredentialsLoading: false,
    ingressCredentialsError: null,
    ingressCredentials: [],
    ingressCredentialsEntityIdFilter: "",
    ingressCredentialCreateEntityId: "",
    ingressCredentialCreateRole: "customer",
    ingressCredentialCreateScopes: "ingress.chat",
    ingressCredentialCreateLabel: "",
    ingressCredentialCreateExpiresAt: "",
    ingressCredentialCreating: false,
    ingressCredentialBusyId: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadIngressCredentials", () => {
  it("loads and sorts ingress credentials", async () => {
    const request = vi.fn().mockResolvedValue({
      credentials: [
        {
          id: "token-old",
          audience: "ingress",
          entityId: "ent_1",
          role: "customer",
          scopes: ["ingress.chat"],
          label: null,
          createdAt: 10,
          lastUsedAt: null,
          expiresAt: null,
          revokedAt: null,
        },
        {
          id: "token-new",
          audience: "ingress",
          entityId: "ent_1",
          role: "customer",
          scopes: ["ingress.chat"],
          label: "recent",
          createdAt: 20,
          lastUsedAt: null,
          expiresAt: null,
          revokedAt: null,
        },
      ],
    });
    const state = createState({
      client: { request } as unknown as IngressCredentialsState["client"],
      ingressCredentialsEntityIdFilter: " ent_1 ",
    });

    await loadIngressCredentials(state);

    expect(request).toHaveBeenCalledWith("auth.tokens.list", {
      entityId: "ent_1",
      includeRevoked: false,
      includeExpired: false,
      limit: 500,
      offset: 0,
    });
    expect(state.ingressCredentials.map((entry) => entry.id)).toEqual(["token-new", "token-old"]);
  });
});

describe("createIngressCredential", () => {
  it("requires an entity id", async () => {
    const request = vi.fn();
    const state = createState({
      client: { request } as unknown as IngressCredentialsState["client"],
      ingressCredentialCreateEntityId: "  ",
    });

    await createIngressCredential(state);

    expect(request).not.toHaveBeenCalled();
    expect(state.ingressCredentialsError).toBe("Entity ID is required.");
  });

  it("creates a credential, prompts with token, and refreshes list", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, token: "nex_test_token" })
      .mockResolvedValueOnce({ credentials: [] });
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("");
    const state = createState({
      client: { request } as unknown as IngressCredentialsState["client"],
      ingressCredentialCreateEntityId: "ent_123",
      ingressCredentialCreateRole: "customer",
      ingressCredentialCreateScopes: "ingress.chat, ingress.search",
      ingressCredentialCreateLabel: "customer api",
      ingressCredentialCreateExpiresAt: "2026-03-01T12:30",
    });

    await createIngressCredential(state);

    expect(request).toHaveBeenNthCalledWith(1, "auth.tokens.create", {
      entityId: "ent_123",
      role: "customer",
      scopes: ["ingress.chat", "ingress.search"],
      label: "customer api",
      expiresAt: expect.any(Number),
    });
    expect(request).toHaveBeenNthCalledWith(2, "auth.tokens.list", {
      entityId: undefined,
      includeRevoked: false,
      includeExpired: false,
      limit: 500,
      offset: 0,
    });
    expect(promptSpy).toHaveBeenCalledWith(
      "New ingress token (copy and store securely):",
      "nex_test_token",
    );
    expect(state.ingressCredentialCreateLabel).toBe("");
    expect(state.ingressCredentialCreateScopes).toBe("");
    expect(state.ingressCredentialCreateExpiresAt).toBe("");
  });
});

describe("revokeIngressCredential", () => {
  it("does nothing when revoke is canceled", async () => {
    const request = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const state = createState({
      client: { request } as unknown as IngressCredentialsState["client"],
    });

    await revokeIngressCredential(state, "tok_123");

    expect(request).not.toHaveBeenCalled();
  });
});

describe("rotateIngressCredential", () => {
  it("rotates, prompts with token, and refreshes list", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, token: "nex_rotated_token" })
      .mockResolvedValueOnce({ credentials: [] });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("");
    const state = createState({
      client: { request } as unknown as IngressCredentialsState["client"],
    });

    await rotateIngressCredential(state, "tok_rotate");

    expect(request).toHaveBeenNthCalledWith(1, "auth.tokens.rotate", { id: "tok_rotate" });
    expect(request).toHaveBeenNthCalledWith(2, "auth.tokens.list", {
      entityId: undefined,
      includeRevoked: false,
      includeExpired: false,
      limit: 500,
      offset: 0,
    });
    expect(promptSpy).toHaveBeenCalledWith(
      "Rotated ingress token (copy and store securely):",
      "nex_rotated_token",
    );
  });
});

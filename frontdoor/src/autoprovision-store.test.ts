import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AutoProvisionStore,
  type OidcAccountRecord,
  type TenantRecord,
} from "./autoprovision-store.js";

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-frontdoor-autoprovision-store-"));
  return path.join(dir, "store.db");
}

function baseTenant(id = "tenant-a"): TenantRecord {
  return {
    id,
    runtimeUrl: "http://127.0.0.1:7422",
    runtimePublicBaseUrl: "https://api.spike.fyi",
    runtimeWsUrl: "wss://api.spike.fyi/",
    runtimeSseUrl: "https://api.spike.fyi/api/events/stream",
    runtimeAuthToken: "runtime-token",
    stateDir: "/var/lib/spike/state",
  };
}

function baseAccount(tenantID = "tenant-a"): OidcAccountRecord {
  return {
    provider: "google",
    subject: "sub-123",
    userId: "oidc:google:sub-123",
    tenantId: tenantID,
    entityId: "entity:google:sub-123",
    email: "owner@example.com",
    displayName: "Owner",
    roles: ["operator"],
    scopes: ["operator.admin"],
  };
}

describe("AutoProvisionStore", () => {
  it("commits tenant/account/request updates atomically on success", () => {
    const store = new AutoProvisionStore(tempDbPath());
    store.startProvisionRequest({
      requestId: "req-1",
      userId: "oidc:google:sub-123",
      provider: "google",
      subject: "sub-123",
      tenantId: "tenant-a",
      status: "provisioning",
      stage: "run_command",
    });

    const request = store.completeProvisionSuccess({
      requestId: "req-1",
      tenant: baseTenant("tenant-a"),
      account: baseAccount("tenant-a"),
      stage: "complete",
    });

    expect(request.status).toBe("ready");
    expect(request.tenantId).toBe("tenant-a");
    expect(store.getTenant("tenant-a")?.runtimeUrl).toBe("http://127.0.0.1:7422");
    expect(
      store.getOidcAccount({
        provider: "google",
        subject: "sub-123",
      })?.tenantId,
    ).toBe("tenant-a");
    store.close();
  });

  it("rolls back tenant writes when account persistence fails mid-transaction", () => {
    const store = new AutoProvisionStore(tempDbPath());
    store.startProvisionRequest({
      requestId: "req-rollback",
      userId: "oidc:google:sub-rollback",
      provider: "google",
      subject: "sub-rollback",
      tenantId: "tenant-rollback",
      status: "provisioning",
      stage: "run_command",
    });

    const badAccount = {
      ...baseAccount("tenant-rollback"),
      subject: "sub-rollback",
      userId: "oidc:google:sub-rollback",
      entityId: "entity:google:sub-rollback",
      scopes: [1n] as unknown as string[],
    } as OidcAccountRecord;

    expect(() =>
      store.completeProvisionSuccess({
        requestId: "req-rollback",
        tenant: baseTenant("tenant-rollback"),
        account: badAccount,
        stage: "complete",
      }),
    ).toThrow();

    expect(store.getTenant("tenant-rollback")).toBeNull();
    expect(
      store.getOidcAccount({
        provider: "google",
        subject: "sub-rollback",
      }),
    ).toBeNull();
    const request = store.getProvisionRequest("req-rollback");
    expect(request?.status).toBe("provisioning");
    expect(request?.completedAtMs).toBeUndefined();
    store.close();
  });

  it("persists user+product tenant mapping on provision success", () => {
    const store = new AutoProvisionStore(tempDbPath());
    const requestId = "req-product-map";
    const userId = "oidc:google:sub-product";
    store.startProvisionRequest({
      requestId,
      userId,
      provider: "google",
      subject: "sub-product",
      tenantId: "tenant-spike-a",
      status: "provisioning",
      stage: "run_command",
    });
    store.completeProvisionSuccess({
      requestId,
      tenant: baseTenant("tenant-spike-a"),
      account: {
        ...baseAccount("tenant-spike-a"),
        subject: "sub-product",
        userId,
        entityId: "entity:google:sub-product",
      },
      productId: "spike",
      stage: "complete",
    });

    const mapped = store.getUserProductTenant({
      userId,
      productId: "spike",
    });
    expect(mapped).toEqual({
      userId,
      productId: "spike",
      tenantId: "tenant-spike-a",
    });
    store.close();
  });
});

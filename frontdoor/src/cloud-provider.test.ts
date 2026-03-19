import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@aws-sdk/client-ec2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-ec2")>();
  return {
    ...actual,
    waitUntilInstanceRunning: vi.fn().mockResolvedValue({ state: "SUCCESS" }),
    waitUntilInstanceStopped: vi.fn().mockResolvedValue({ state: "SUCCESS" }),
    waitUntilImageAvailable: vi.fn().mockResolvedValue({ state: "SUCCESS" }),
  };
});

import { AwsEc2Provider, HetznerProvider, renderCloudInitScript } from "./cloud-provider.js";

describe("HetznerProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enables backup and protection when creating a server", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            server: {
              id: 123,
              public_net: { ipv4: { ip: "203.0.113.10" } },
              private_net: [{ ip: "10.0.0.10" }],
            },
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ action: { id: 1, command: "enable_backup", status: "success" } }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ action: { id: 2, command: "change_protection", status: "success" } }),
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerProvider({
      apiToken: "token",
      networkId: "7",
      firewallId: "9",
      sshKeyIds: ["11"],
      snapshotId: "13",
    });

    const created = await provider.createServer({
      tenantId: "tenant-durable",
      planId: "cax11",
      cloudInitScript: "#!/bin/sh\n",
      imageId: "snapshot-recovery-77",
      serverName: "nex-tenant-durable-recover",
    });

    expect(created).toEqual({
      providerServerId: "123",
      publicIp: "203.0.113.10",
      privateIp: "10.0.0.10",
      backupEnabled: true,
      deleteProtectionEnabled: true,
      rebuildProtectionEnabled: true,
    });
    const createCall = fetchMock.mock.calls[0];
    expect(createCall?.[0]).toBe("https://api.hetzner.cloud/v1/servers");
    const createRequest = createCall?.[1] as RequestInit | undefined;
    expect(createRequest?.method).toBe("POST");
    expect(JSON.parse(String(createRequest?.body))).toMatchObject({
      name: "nex-tenant-durable-recover",
      image: "snapshot-recovery-77",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.hetzner.cloud/v1/servers/123/actions/enable_backup",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.hetzner.cloud/v1/servers/123/actions/change_protection",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ delete: true, rebuild: true }),
      }),
    );
  });

  it("supports archive, restore, recovery point creation, protection changes, and destroy", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ action: { id: 1, command: "poweroff", status: "success" } }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            server: {
              id: 123,
              status: "off",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ action: { id: 2, command: "poweron", status: "success" } }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            server: {
              id: 123,
              status: "running",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            action: { id: 3, command: "create_image", status: "success" },
            image: { id: 456, type: "snapshot" },
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ action: { id: 4, command: "change_protection", status: "success" } }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerProvider({
      apiToken: "token",
      networkId: "7",
      firewallId: "9",
      sshKeyIds: ["11"],
      snapshotId: "13",
    });

    await provider.archiveServer("123");
    await provider.restoreServer("123");
    const recoveryPoint = await provider.createRecoveryPoint("123", "Before upgrade");
    await provider.setProtection("123", { delete: false, rebuild: false });
    await provider.destroyServer("123");

    expect(recoveryPoint).toEqual({
      providerArtifactId: "456",
      captureType: "snapshot",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "https://api.hetzner.cloud/v1/servers/123/actions/create_image",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          type: "snapshot",
          description: "Before upgrade",
          labels: {
            "managed-by": "nexus-frontdoor",
            "recovery-point": "true",
          },
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "https://api.hetzner.cloud/v1/servers/123/actions/change_protection",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ delete: false, rebuild: false }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "https://api.hetzner.cloud/v1/servers/123",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("renders hosted trusted-token bootstrap in cloud-init", () => {
    const script = renderCloudInitScript({
      tenantId: "t-acme",
      serverId: "srv-acme",
      authToken: "rt-legacy",
      provisionToken: "prov-123",
      frontdoorUrl: "https://frontdoor.test",
      runtimeTokenIssuer: "https://frontdoor.test",
      runtimeTokenSecret: "frontdoor-secret-test",
      runtimeTokenActiveKid: "v1",
    });

    expect(script).toContain("/opt/nex/bootstrap-frontdoor.sh");
    expect(script).toContain("NEXUS_RUNTIME_TRUSTED_TOKEN_ISSUER=https://frontdoor.test");
    expect(script).toContain("NEXUS_RUNTIME_TRUSTED_TOKEN_SECRET=frontdoor-secret-test");
    expect(script).toContain('runtime.hostedMode = true');
    expect(script).toContain('runtime.auth.mode = "trusted_token"');
    expect(script).toContain("INIT_RETRIES=5");
    expect(script).toContain('Missing /opt/nex/state/config.json after workspace initialization');
    expect(script).toContain('aud: "nexus-runtime"');
    expect(script).toContain('Stopping any pre-started nex-runtime service before workspace initialization...');
    expect(script).toContain("systemctl disable nex-runtime 2>/dev/null || true");
    expect(script).toContain("export BOOTSTRAP_TENANT_ID BOOTSTRAP_RUNTIME_TOKEN_ISSUER BOOTSTRAP_RUNTIME_TOKEN_SECRET BOOTSTRAP_RUNTIME_TOKEN_ACTIVE_KID BOOTSTRAP_RUNTIME_SESSION_ID");
    expect(script).toContain('RUNTIME_JWT=$(sign_runtime_token "$BOOTSTRAP_RUNTIME_SESSION_ID")');
    expect(script).toContain("systemctl enable nex-runtime");
    expect(script).toContain('die "Runtime health check timed out after ${HEALTH_TIMEOUT}s"');
    expect(script).not.toContain("exec /opt/nex/bootstrap.sh");
  });
});

describe("AwsEc2Provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates arm64 instances, enables protection, and returns private addressing", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Instances: [{ InstanceId: "i-aws-1" }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Reservations: [
          {
            Instances: [
              {
                InstanceId: "i-aws-1",
                State: { Name: "running" },
                PrivateIpAddress: "10.42.0.10",
                PublicIpAddress: undefined,
              },
            ],
          },
        ],
      });

    const provider = new AwsEc2Provider({
      region: "us-east-2",
      subnetId: "subnet-123",
      securityGroupIds: ["sg-123"],
      amiId: "ami-123",
      instanceProfileArn: "arn:aws:iam::123456789012:instance-profile/frontdoor-runtime",
      sshKeyName: "nexus-operator",
      client: { send },
    });

    const created = await provider.createServer({
      tenantId: "tenant-compliant",
      planId: "cax11",
      cloudInitScript: "#!/bin/sh\n",
      imageId: "ami-recovery-1",
      serverName: "nex-tenant-compliant",
    });

    expect(created).toEqual({
      providerServerId: "i-aws-1",
      publicIp: "",
      privateIp: "10.42.0.10",
      backupEnabled: false,
      deleteProtectionEnabled: true,
      rebuildProtectionEnabled: true,
    });
    const runCall = send.mock.calls[0]?.[0];
    expect(runCall?.constructor?.name).toBe("RunInstancesCommand");
    expect(runCall?.input).toMatchObject({
      ImageId: "ami-recovery-1",
      InstanceType: "t4g.medium",
      IamInstanceProfile: {
        Arn: "arn:aws:iam::123456789012:instance-profile/frontdoor-runtime",
      },
    });
    expect(send.mock.calls[1]?.[0]?.constructor?.name).toBe("ModifyInstanceAttributeCommand");
    expect(send.mock.calls[2]?.[0]?.constructor?.name).toBe("ModifyInstanceAttributeCommand");
  });

  it("supports archive, restore, recovery points, protection changes, and destroy", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        ImageId: "ami-rp-1",
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Reservations: [
          {
            Instances: [
              {
                InstanceId: "i-aws-1",
                State: { Name: "running" },
                PrivateIpAddress: "10.42.0.10",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const provider = new AwsEc2Provider({
      region: "us-east-2",
      subnetId: "subnet-123",
      securityGroupIds: ["sg-123"],
      amiId: "ami-123",
      client: { send },
    });

    await provider.archiveServer("i-aws-1");
    await provider.restoreServer("i-aws-1");
    const recoveryPoint = await provider.createRecoveryPoint("i-aws-1", "Before upgrade");
    await provider.setProtection("i-aws-1", { delete: false, rebuild: false });
    await provider.destroyServer("i-aws-1");

    expect(recoveryPoint).toEqual({
      providerArtifactId: "ami-rp-1",
      captureType: "image",
    });
    expect(send.mock.calls[0]?.[0]?.constructor?.name).toBe("StopInstancesCommand");
    expect(send.mock.calls[1]?.[0]?.constructor?.name).toBe("StartInstancesCommand");
    expect(send.mock.calls[2]?.[0]?.constructor?.name).toBe("CreateImageCommand");
    expect(send.mock.calls[3]?.[0]?.constructor?.name).toBe("ModifyInstanceAttributeCommand");
    expect(send.mock.calls[4]?.[0]?.constructor?.name).toBe("ModifyInstanceAttributeCommand");
    expect(send.mock.calls[5]?.[0]?.constructor?.name).toBe("DescribeInstancesCommand");
    expect(send.mock.calls[6]?.[0]?.constructor?.name).toBe("ModifyInstanceAttributeCommand");
    expect(send.mock.calls[7]?.[0]?.constructor?.name).toBe("ModifyInstanceAttributeCommand");
    expect(send.mock.calls[8]?.[0]?.constructor?.name).toBe("TerminateInstancesCommand");
  });
});

// ---------------------------------------------------------------------------
// SSH/SCP helper for app delivery to tenant VPSes
// ---------------------------------------------------------------------------

import { Client as SshClient } from "ssh2";
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SshConnectOpts = {
  host: string;        // Private IP (10.0.0.x)
  privateKeyPath: string;
  username?: string;    // default: "root"
  port?: number;        // default: 22
  timeoutMs?: number;   // default: 10000
};

export type ScpFileOpts = {
  client: SshClient;
  localPath: string;
  remotePath: string;
};

export type ExecCommandOpts = {
  client: SshClient;
  command: string;
  timeoutMs?: number;   // default: 30000
};

export type ExecResult = {
  stdout: string;
  stderr: string;
  code: number;
};

// ---------------------------------------------------------------------------
// connectToVPS
// ---------------------------------------------------------------------------

export function connectToVPS(opts: SshConnectOpts): Promise<SshClient> {
  return new Promise((resolve, reject) => {
    const client = new SshClient();
    const timeoutMs = opts.timeoutMs ?? 10_000;

    let privateKey: Buffer;
    try {
      privateKey = fs.readFileSync(opts.privateKeyPath);
    } catch (err) {
      reject(new Error(`ssh_key_read_failed: ${String(err)}`));
      return;
    }

    const timer = setTimeout(() => {
      client.end();
      reject(new Error(`ssh_connect_timeout: ${opts.host} (${timeoutMs}ms)`));
    }, timeoutMs);

    client.on("ready", () => {
      clearTimeout(timer);
      resolve(client);
    });

    client.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(new Error(`ssh_connect_failed: ${opts.host} - ${err.message}`));
    });

    client.connect({
      host: opts.host,
      port: opts.port ?? 22,
      username: opts.username ?? "root",
      privateKey,
      readyTimeout: timeoutMs,
    });
  });
}

// ---------------------------------------------------------------------------
// scpFile — transfer a local file to remote path
// ---------------------------------------------------------------------------

export function scpFile(opts: ScpFileOpts): Promise<void> {
  return new Promise((resolve, reject) => {
    opts.client.sftp((err, sftp) => {
      if (err) {
        reject(new Error(`sftp_session_failed: ${err.message}`));
        return;
      }
      sftp.fastPut(opts.localPath, opts.remotePath, (putErr) => {
        sftp.end();
        if (putErr) {
          reject(new Error(`scp_write_failed: ${putErr.message}`));
          return;
        }
        resolve();
      });
    });
  });
}

// ---------------------------------------------------------------------------
// execCommand — run a command on remote host
// ---------------------------------------------------------------------------

export function execCommand(opts: ExecCommandOpts): Promise<ExecResult> {
  const timeoutMs = opts.timeoutMs ?? 30_000;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`ssh_exec_timeout: ${opts.command.slice(0, 80)} (${timeoutMs}ms)`));
    }, timeoutMs);

    opts.client.exec(opts.command, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        reject(new Error(`ssh_exec_failed: ${err.message}`));
        return;
      }

      let stdout = "";
      let stderr = "";

      stream.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      stream.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      stream.on("close", (code: number) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code: code ?? 0 });
      });
    });
  });
}

// ---------------------------------------------------------------------------
async function hashFileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

// ---------------------------------------------------------------------------
// installPackageViaSSH — SCP tarball into staging + call runtime operator API
// ---------------------------------------------------------------------------

export async function installPackageViaSSH(opts: {
  host: string;
  privateKeyPath: string;
  username?: string;
  localTarballPath: string;
  kind: "runtime" | "app" | "adapter" | "service";
  packageId: string;
  version: string;
  releaseId?: string;
  runtimePort: number;
  runtimeBearerToken: string;
  retries?: number;
}): Promise<
  | { ok: true }
  | { ok: false; error: string; detail?: string }
> {
  const maxRetries = opts.retries ?? 3;
  const sshUsername = opts.username ?? "root";
  let lastError = "";
  const operationId = `op-${randomUUID()}`;
  const sha256 = await hashFileSha256(opts.localTarballPath);
  const stats = fs.statSync(opts.localTarballPath);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await connectToVPS({
        host: opts.host,
        privateKeyPath: opts.privateKeyPath,
        username: sshUsername,
      });

      try {
        const stagingDir = `/opt/nex/state/packages/staging/${operationId}`;
        const remoteTarball = `${stagingDir}/${opts.kind}-${opts.packageId}-${opts.version}.tar.gz`;
        const tempTarball = `/tmp/${operationId}-${opts.kind}-${opts.packageId}-${opts.version}.tar.gz`;
        const mkdirCommand = sshUsername === "root"
          ? `mkdir -p ${stagingDir}`
          : `sudo mkdir -p ${stagingDir}`;
        const mkdirResult = await execCommand({
          client,
          command: mkdirCommand,
        });
        if (mkdirResult.code !== 0) {
          client.end();
          lastError = `mkdir_failed: ${mkdirResult.stderr}`;
          continue;
        }

        await scpFile({
          client,
          localPath: opts.localTarballPath,
          remotePath: sshUsername === "root" ? remoteTarball : tempTarball,
        });
        if (sshUsername !== "root") {
          const moveResult = await execCommand({
            client,
            command: `sudo mv ${tempTarball} ${remoteTarball} && sudo chown nex:nex ${remoteTarball}`,
          });
          if (moveResult.code !== 0) {
            client.end();
            lastError = `stage_move_failed: ${moveResult.stderr}`;
            continue;
          }
        }

        client.end();
      } catch (sshErr) {
        client.end();
        throw sshErr;
      }

      const runtimeUrl = `http://${opts.host}:${opts.runtimePort}`;
      const installRes = await fetch(`${runtimeUrl}/api/operator/packages/install`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.runtimeBearerToken}`,
        },
        body: JSON.stringify({
          kind: opts.kind,
          package_id: opts.packageId,
          version: opts.version,
          release_id: opts.releaseId ?? null,
          operation_id: operationId,
          staged_artifact: {
            server_path: `/opt/nex/state/packages/staging/${operationId}/${opts.kind}-${opts.packageId}-${opts.version}.tar.gz`,
            sha256,
            size_bytes: stats.size,
          },
        }),
      });

      if (installRes.ok) {
        return { ok: true };
      }

      const errBody = await installRes.text();
      lastError = `runtime_install_api_${installRes.status}: ${errBody.slice(0, 200)}`;

      return { ok: false, error: "runtime_install_failed", detail: lastError };
    } catch (err) {
      lastError = String(err);
      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }
  }

  return { ok: false, error: "ssh_delivery_failed", detail: lastError };
}

export async function installPackageViaRuntimeHttp(opts: {
  runtimeUrl: string;
  localTarballPath: string;
  kind: "runtime" | "app" | "adapter" | "service";
  packageId: string;
  version: string;
  releaseId?: string;
  runtimeBearerToken: string;
}): Promise<
  | { ok: true }
  | { ok: false; error: string; detail?: string }
> {
  try {
    const operationId = `op-${randomUUID()}`;
    const stagingRoot =
      process.env.NEXUS_PACKAGE_STAGING_DIR?.trim() || "/opt/nex/state/packages/staging";
    const stagedDir = `${stagingRoot.replace(/\/+$/g, "")}/${operationId}`;
    const stagedPath = `${stagedDir}/${opts.kind}-${opts.packageId}-${opts.version}.tar.gz`;
    fs.mkdirSync(stagedDir, { recursive: true });
    fs.copyFileSync(opts.localTarballPath, stagedPath);

    const sha256 = await hashFileSha256(opts.localTarballPath);
    const stats = fs.statSync(opts.localTarballPath);
    const installRes = await fetch(`${opts.runtimeUrl.replace(/\/$/, "")}/api/operator/packages/install`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.runtimeBearerToken}`,
      },
      body: JSON.stringify({
        kind: opts.kind,
        package_id: opts.packageId,
        version: opts.version,
        release_id: opts.releaseId ?? null,
        operation_id: operationId,
        staged_artifact: {
          server_path: stagedPath,
          sha256,
          size_bytes: stats.size,
        },
      }),
    });

    if (installRes.ok) {
      return { ok: true };
    }

    return {
      ok: false,
      error: "runtime_install_failed",
      detail: (await installRes.text()).slice(0, 200),
    };
  } catch (err) {
    return { ok: false, error: "runtime_install_unreachable", detail: String(err) };
  }
}

// ---------------------------------------------------------------------------
// upgradePackageViaSSH — SCP tarball into staging + call runtime operator API
// ---------------------------------------------------------------------------

export async function upgradePackageViaSSH(opts: {
  host: string;
  privateKeyPath: string;
  username?: string;
  localTarballPath: string;
  kind: "runtime" | "app" | "adapter" | "service";
  packageId: string;
  targetVersion: string;
  releaseId?: string;
  runtimePort: number;
  runtimeBearerToken: string;
}): Promise<
  | { ok: true }
  | { ok: false; error: string; detail?: string }
> {
  const sshUsername = opts.username ?? "root";
  const operationId = `op-${randomUUID()}`;
  const sha256 = await hashFileSha256(opts.localTarballPath);
  const stats = fs.statSync(opts.localTarballPath);
  try {
    const client = await connectToVPS({
      host: opts.host,
      privateKeyPath: opts.privateKeyPath,
      username: sshUsername,
    });
  try {
      const stagingDir = `/opt/nex/state/packages/staging/${operationId}`;
      const remoteTarball = `${stagingDir}/${opts.kind}-${opts.packageId}-${opts.targetVersion}.tar.gz`;
      const tempTarball = `/tmp/${operationId}-${opts.kind}-${opts.packageId}-${opts.targetVersion}.tar.gz`;
      const mkdirCommand = sshUsername === "root"
        ? `mkdir -p ${stagingDir}`
        : `sudo mkdir -p ${stagingDir}`;
      const mkdirResult = await execCommand({
        client,
        command: mkdirCommand,
      });
      if (mkdirResult.code !== 0) {
        client.end();
        return { ok: false, error: "mkdir_failed", detail: mkdirResult.stderr };
      }
      await scpFile({
        client,
        localPath: opts.localTarballPath,
        remotePath: sshUsername === "root" ? remoteTarball : tempTarball,
      });
      if (sshUsername !== "root") {
        const moveResult = await execCommand({
          client,
          command: `sudo mv ${tempTarball} ${remoteTarball} && sudo chown nex:nex ${remoteTarball}`,
        });
        if (moveResult.code !== 0) {
          client.end();
          return { ok: false, error: "stage_move_failed", detail: moveResult.stderr };
        }
      }
      client.end();
    } catch (sshErr) {
      client.end();
      throw sshErr;
    }

    const runtimeUrl = `http://${opts.host}:${opts.runtimePort}`;
    const upgradeRes = await fetch(`${runtimeUrl}/api/operator/packages/upgrade`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.runtimeBearerToken}`,
      },
        body: JSON.stringify({
        kind: opts.kind,
        package_id: opts.packageId,
        target_version: opts.targetVersion,
        release_id: opts.releaseId ?? null,
        operation_id: operationId,
          staged_artifact: {
            server_path: `/opt/nex/state/packages/staging/${operationId}/${opts.kind}-${opts.packageId}-${opts.targetVersion}.tar.gz`,
            sha256,
            size_bytes: stats.size,
          },
        }),
    });

    if (upgradeRes.ok) {
      return { ok: true };
    }

    return {
      ok: false,
      error: "runtime_upgrade_failed",
      detail: (await upgradeRes.text()).slice(0, 200),
    };
  } catch (err) {
    return { ok: false, error: "ssh_delivery_failed", detail: String(err) };
  }
}

export async function upgradePackageViaRuntimeHttp(opts: {
  runtimeUrl: string;
  localTarballPath: string;
  kind: "runtime" | "app" | "adapter" | "service";
  packageId: string;
  targetVersion: string;
  releaseId?: string;
  runtimeBearerToken: string;
}): Promise<
  | { ok: true }
  | { ok: false; error: string; detail?: string }
> {
  try {
    const operationId = `op-${randomUUID()}`;
    const stagingRoot =
      process.env.NEXUS_PACKAGE_STAGING_DIR?.trim() || "/opt/nex/state/packages/staging";
    const stagedDir = `${stagingRoot.replace(/\/+$/g, "")}/${operationId}`;
    const stagedPath = `${stagedDir}/${opts.kind}-${opts.packageId}-${opts.targetVersion}.tar.gz`;
    fs.mkdirSync(stagedDir, { recursive: true });
    fs.copyFileSync(opts.localTarballPath, stagedPath);

    const sha256 = await hashFileSha256(opts.localTarballPath);
    const stats = fs.statSync(opts.localTarballPath);
    const upgradeRes = await fetch(`${opts.runtimeUrl.replace(/\/$/, "")}/api/operator/packages/upgrade`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.runtimeBearerToken}`,
      },
      body: JSON.stringify({
        kind: opts.kind,
        package_id: opts.packageId,
        target_version: opts.targetVersion,
        release_id: opts.releaseId ?? null,
        operation_id: operationId,
        staged_artifact: {
          server_path: stagedPath,
          sha256,
          size_bytes: stats.size,
        },
      }),
    });

    if (upgradeRes.ok) {
      return { ok: true };
    }

    return {
      ok: false,
      error: "runtime_upgrade_failed",
      detail: (await upgradeRes.text()).slice(0, 200),
    };
  } catch (err) {
    return { ok: false, error: "runtime_upgrade_unreachable", detail: String(err) };
  }
}

// ---------------------------------------------------------------------------
// uninstallPackageViaSSH — call runtime operator uninstall API
// ---------------------------------------------------------------------------

export async function uninstallPackageViaSSH(opts: {
  host: string;
  privateKeyPath: string;
  kind: "runtime" | "app" | "adapter" | "service";
  packageId: string;
  runtimePort: number;
  runtimeBearerToken: string;
}): Promise<
  | { ok: true }
  | { ok: false; error: string; detail?: string }
> {
  const runtimeUrl = `http://${opts.host}:${opts.runtimePort}`;
  try {
    const uninstallRes = await fetch(`${runtimeUrl}/api/operator/packages/uninstall`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.runtimeBearerToken}`,
      },
      body: JSON.stringify({
        kind: opts.kind,
        package_id: opts.packageId,
        operation_id: `op-${randomUUID()}`,
      }),
    });

    if (!uninstallRes.ok) {
      const errBody = await uninstallRes.text();
      return { ok: false, error: "runtime_uninstall_failed", detail: errBody.slice(0, 200) };
    }
  } catch (err) {
    return { ok: false, error: "runtime_uninstall_unreachable", detail: String(err) };
  }

  return { ok: true };
}

export async function uninstallPackageViaRuntimeHttp(opts: {
  runtimeUrl: string;
  kind: "runtime" | "app" | "adapter" | "service";
  packageId: string;
  runtimeBearerToken: string;
}): Promise<
  | { ok: true }
  | { ok: false; error: string; detail?: string }
> {
  try {
    const uninstallRes = await fetch(`${opts.runtimeUrl.replace(/\/$/, "")}/api/operator/packages/uninstall`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.runtimeBearerToken}`,
      },
      body: JSON.stringify({
        kind: opts.kind,
        package_id: opts.packageId,
        operation_id: `op-${randomUUID()}`,
      }),
    });

    if (!uninstallRes.ok) {
      const errBody = await uninstallRes.text();
      return { ok: false, error: "runtime_uninstall_failed", detail: errBody.slice(0, 200) };
    }
  } catch (err) {
    return { ok: false, error: "runtime_uninstall_unreachable", detail: String(err) };
  }

  return { ok: true };
}

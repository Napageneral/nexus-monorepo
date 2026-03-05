// ---------------------------------------------------------------------------
// SSH/SCP helper for app delivery to tenant VPSes
// ---------------------------------------------------------------------------

import { Client as SshClient } from "ssh2";
import fs from "node:fs";

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

      const readStream = fs.createReadStream(opts.localPath);
      const writeStream = sftp.createWriteStream(opts.remotePath);

      writeStream.on("close", () => {
        sftp.end();
        resolve();
      });

      writeStream.on("error", (writeErr: Error) => {
        sftp.end();
        reject(new Error(`scp_write_failed: ${writeErr.message}`));
      });

      readStream.on("error", (readErr: Error) => {
        sftp.end();
        reject(new Error(`scp_read_failed: ${readErr.message}`));
      });

      readStream.pipe(writeStream);
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
// installAppViaSSH — high-level: SCP tarball + extract + call runtime API
// ---------------------------------------------------------------------------

export async function installAppViaSSH(opts: {
  host: string;
  privateKeyPath: string;
  localTarballPath: string;
  appId: string;
  runtimePort: number;
  runtimeAuthToken: string;
  retries?: number;
}): Promise<
  | { ok: true }
  | { ok: false; error: string; detail?: string }
> {
  const maxRetries = opts.retries ?? 3;
  let lastError = "";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 1. Connect to VPS
      const client = await connectToVPS({
        host: opts.host,
        privateKeyPath: opts.privateKeyPath,
      });

      try {
        // 2. Create app directory
        const mkdirResult = await execCommand({
          client,
          command: `mkdir -p /opt/nex/apps/${opts.appId}`,
        });
        if (mkdirResult.code !== 0) {
          client.end();
          lastError = `mkdir_failed: ${mkdirResult.stderr}`;
          continue;
        }

        // 3. SCP tarball to /tmp
        const remoteTmp = `/tmp/${opts.appId}.tar.gz`;
        await scpFile({
          client,
          localPath: opts.localTarballPath,
          remotePath: remoteTmp,
        });

        // 4. Extract tarball
        const extractResult = await execCommand({
          client,
          command: `tar -xzf ${remoteTmp} -C /opt/nex/apps/${opts.appId}`,
        });
        if (extractResult.code !== 0) {
          client.end();
          lastError = `extract_failed: ${extractResult.stderr}`;
          continue;
        }

        // 5. Cleanup temp file
        await execCommand({
          client,
          command: `rm -f ${remoteTmp}`,
        });

        client.end();
      } catch (sshErr) {
        client.end();
        throw sshErr;
      }

      // 6. Call runtime install API
      const runtimeUrl = `http://${opts.host}:${opts.runtimePort}`;
      const installRes = await fetch(`${runtimeUrl}/api/apps/install`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.runtimeAuthToken}`,
        },
        body: JSON.stringify({
          appId: opts.appId,
          packageRef: `/opt/nex/apps/${opts.appId}`,
        }),
      });

      if (installRes.ok) {
        return { ok: true };
      }

      const errBody = await installRes.text();
      lastError = `runtime_install_api_${installRes.status}: ${errBody.slice(0, 200)}`;

      // Don't retry runtime API errors (likely a permanent issue)
      return { ok: false, error: "runtime_install_failed", detail: lastError };

    } catch (err) {
      lastError = String(err);
      if (attempt < maxRetries) {
        // Exponential backoff: 2s, 4s, 8s
        const backoffMs = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }
  }

  return { ok: false, error: "ssh_delivery_failed", detail: lastError };
}

// ---------------------------------------------------------------------------
// uninstallAppViaSSH — call runtime uninstall API + cleanup files
// ---------------------------------------------------------------------------

export async function uninstallAppViaSSH(opts: {
  host: string;
  privateKeyPath: string;
  appId: string;
  runtimePort: number;
  runtimeAuthToken: string;
  removeFiles?: boolean; // default: true
}): Promise<
  | { ok: true }
  | { ok: false; error: string; detail?: string }
> {
  // 1. Call runtime uninstall API
  const runtimeUrl = `http://${opts.host}:${opts.runtimePort}`;
  try {
    const uninstallRes = await fetch(`${runtimeUrl}/api/apps/uninstall`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.runtimeAuthToken}`,
      },
      body: JSON.stringify({ appId: opts.appId }),
    });

    if (!uninstallRes.ok) {
      const errBody = await uninstallRes.text();
      return { ok: false, error: "runtime_uninstall_failed", detail: errBody.slice(0, 200) };
    }
  } catch (err) {
    return { ok: false, error: "runtime_uninstall_unreachable", detail: String(err) };
  }

  // 2. Optionally remove files via SSH
  if (opts.removeFiles !== false) {
    try {
      const client = await connectToVPS({
        host: opts.host,
        privateKeyPath: opts.privateKeyPath,
      });
      await execCommand({
        client,
        command: `rm -rf /opt/nex/apps/${opts.appId}`,
      });
      client.end();
    } catch {
      // Non-fatal — runtime already uninstalled the app
    }
  }

  return { ok: true };
}

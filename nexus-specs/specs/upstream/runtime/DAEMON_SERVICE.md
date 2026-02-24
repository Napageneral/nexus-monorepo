# OpenClaw Daemon/Service Management

This document describes how OpenClaw manages background services across macOS, Linux, and Windows. The daemon layer provides automatic startup, crash recovery, and lifecycle management for the Gateway and Node services.

## Overview

OpenClaw runs two types of services:

| Service | Purpose | Default Label |
|---------|---------|---------------|
| **Gateway** | Local API server for agent interactions | `ai.openclaw.gateway` (macOS), `openclaw-gateway` (Linux), `OpenClaw Gateway` (Windows) |
| **Node** | Remote node host for distributed execution | `ai.openclaw.node` (macOS), `openclaw-node` (Linux), `OpenClaw Node` (Windows) |

The service management layer abstracts platform differences through a unified `GatewayService` interface while providing platform-specific implementations.

---

## Architecture

### Service Interface

All platforms implement the same `GatewayService` interface:

```typescript
type GatewayService = {
  label: string;                    // Platform-specific label (LaunchAgent, systemd, Scheduled Task)
  loadedText: string;               // Status text when loaded
  notLoadedText: string;            // Status text when not loaded
  
  install: (args: GatewayServiceInstallArgs) => Promise<void>;
  uninstall: (args: { env, stdout }) => Promise<void>;
  stop: (args: { env?, stdout }) => Promise<void>;
  restart: (args: { env?, stdout }) => Promise<void>;
  isLoaded: (args: { env? }) => Promise<boolean>;
  readCommand: (env) => Promise<ServiceCommand | null>;
  readRuntime: (env) => Promise<GatewayServiceRuntime>;
};
```

### Platform Resolution

The `resolveGatewayService()` function returns the appropriate implementation:

| Platform | Implementation | Service Type |
|----------|---------------|--------------|
| `darwin` | `launchd.ts` | LaunchAgent |
| `linux` | `systemd.ts` | systemd user service |
| `win32` | `schtasks.ts` | Scheduled Task |

**Key File:** `src/daemon/service.ts`

---

## Platform Implementations

### macOS: launchd

OpenClaw uses launchd LaunchAgents for macOS service management. LaunchAgents run in the user's GUI session and persist across logins.

#### Key Files

| File | Purpose |
|------|---------|
| `launchd.ts` | LaunchAgent lifecycle (install, uninstall, start, stop) |
| `launchd-plist.ts` | Plist XML generation and parsing |

#### Plist Location

```
~/Library/LaunchAgents/{label}.plist
```

Default labels:
- Gateway: `ai.openclaw.gateway`
- Node: `ai.openclaw.node`

#### Plist Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" 
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>ai.openclaw.gateway</string>
    
    <key>Comment</key>
    <string>OpenClaw Gateway (v1.2.3)</string>
    
    <key>RunAtLoad</key>
    <true/>
    
    <key>KeepAlive</key>
    <true/>
    
    <key>ProgramArguments</key>
    <array>
      <string>/opt/homebrew/bin/node</string>
      <string>/path/to/openclaw/dist/index.js</string>
      <string>gateway</string>
      <string>--port</string>
      <string>3456</string>
    </array>
    
    <key>WorkingDirectory</key>
    <string>/path/to/working/dir</string>
    
    <key>StandardOutPath</key>
    <string>~/.openclaw/logs/gateway.log</string>
    
    <key>StandardErrorPath</key>
    <string>~/.openclaw/logs/gateway.err.log</string>
    
    <key>EnvironmentVariables</key>
    <dict>
      <key>HOME</key>
      <string>/Users/username</string>
      <key>PATH</key>
      <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
      <key>OPENCLAW_GATEWAY_PORT</key>
      <string>3456</string>
    </dict>
  </dict>
</plist>
```

#### launchctl Commands

| Operation | Command |
|-----------|---------|
| Load/Start | `launchctl bootstrap gui/{uid} {plist}` |
| Unload/Stop | `launchctl bootout gui/{uid} {plist}` |
| Restart | `launchctl kickstart -k gui/{uid}/{label}` |
| Status | `launchctl print gui/{uid}/{label}` |
| Enable | `launchctl enable gui/{uid}/{label}` |

#### Runtime Status

The `parseLaunchctlPrint()` function extracts:
- `state` - running, waiting, etc.
- `pid` - process ID if running
- `lastExitStatus` - exit code of last run
- `lastExitReason` - reason for last exit

#### Log Paths

```
~/.openclaw/logs/gateway.log      # stdout
~/.openclaw/logs/gateway.err.log  # stderr
```

For Node service:
```
~/.openclaw/logs/node.log
~/.openclaw/logs/node.err.log
```

---

### Linux: systemd

OpenClaw uses systemd user services on Linux. User services run without root privileges and can persist across sessions with linger enabled.

#### Key Files

| File | Purpose |
|------|---------|
| `systemd.ts` | systemd user service lifecycle |
| `systemd-unit.ts` | Unit file generation and parsing |
| `systemd-linger.ts` | User linger status and enablement |
| `systemd-hints.ts` | Error messaging for systemd issues |

#### Unit File Location

```
~/.config/systemd/user/{name}.service
```

Default names:
- Gateway: `openclaw-gateway.service`
- Node: `openclaw-node.service`

#### Unit File Structure

```ini
[Unit]
Description=OpenClaw Gateway (v1.2.3)
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/node /path/to/openclaw/dist/index.js gateway --port 3456
Restart=always
RestartSec=5
KillMode=process
WorkingDirectory=/path/to/working/dir
Environment="HOME=/home/username"
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
Environment="OPENCLAW_GATEWAY_PORT=3456"

[Install]
WantedBy=default.target
```

#### Key Unit Settings

| Setting | Value | Purpose |
|---------|-------|---------|
| `Restart` | `always` | Auto-restart on crash |
| `RestartSec` | `5` | Wait 5 seconds before restart |
| `KillMode` | `process` | Only wait for main process (not children like podman conmon) |
| `After` | `network-online.target` | Start after network is available |
| `Wants` | `network-online.target` | Soft dependency on network |
| `WantedBy` | `default.target` | Enable at user login |

#### systemctl Commands

| Operation | Command |
|-----------|---------|
| Reload configs | `systemctl --user daemon-reload` |
| Enable | `systemctl --user enable {unit}` |
| Start | `systemctl --user start {unit}` |
| Stop | `systemctl --user stop {unit}` |
| Restart | `systemctl --user restart {unit}` |
| Status | `systemctl --user show {unit} --property ActiveState,SubState,MainPID,...` |
| Is enabled | `systemctl --user is-enabled {unit}` |

#### User Linger

By default, systemd user services only run while the user is logged in. **Linger** allows services to start at boot and persist after logout.

```typescript
type SystemdUserLingerStatus = {
  user: string;
  linger: "yes" | "no";
};
```

| Operation | Command |
|-----------|---------|
| Check status | `loginctl show-user {user} -p Linger` |
| Enable linger | `sudo loginctl enable-linger {user}` |

The `enableSystemdUserLinger()` function supports:
- `prompt` mode - uses `sudo` with password prompt
- `non-interactive` mode - uses `sudo -n` (fails if password required)

#### WSL2 Considerations

systemd is not enabled by default in WSL2. The `systemd-hints.ts` module provides helpful error messages:

```typescript
// Check if systemd unavailable due to WSL2
if (isSystemdUnavailableDetail(detail)) {
  const hints = renderSystemdUnavailableHints({ wsl: true });
  // Returns:
  // - "WSL2 needs systemd enabled: edit /etc/wsl.conf with [boot]\nsystemd=true"
  // - "Then run: wsl --shutdown (from PowerShell) and reopen your distro."
  // - "Verify: systemctl --user status"
}
```

---

### Windows: schtasks

OpenClaw uses Windows Scheduled Tasks for service management on Windows.

#### Key Files

| File | Purpose |
|------|---------|
| `schtasks.ts` | Scheduled Task lifecycle and wrapper script generation |

#### Task Script Location

```
~/.openclaw/gateway.cmd    # Gateway
~/.openclaw/node.cmd       # Node
```

#### Task Script Structure

```batch
@echo off
rem OpenClaw Gateway (v1.2.3)
cd /d "C:\path\to\working\dir"
set HOME=C:\Users\username
set PATH=C:\Program Files\nodejs;%PATH%
set OPENCLAW_GATEWAY_PORT=3456
"C:\Program Files\nodejs\node.exe" "C:\path\to\openclaw\dist\index.js" gateway --port 3456
```

#### schtasks Commands

| Operation | Command |
|-----------|---------|
| Create | `schtasks /Create /F /SC ONLOGON /RL LIMITED /TN "{name}" /TR "{script}"` |
| Create with user | `... /RU "{domain}\{user}" /NP /IT` |
| Delete | `schtasks /Delete /F /TN "{name}"` |
| Run | `schtasks /Run /TN "{name}"` |
| End | `schtasks /End /TN "{name}"` |
| Query | `schtasks /Query /TN "{name}" /V /FO LIST` |

#### Task Configuration

| Flag | Purpose |
|------|---------|
| `/SC ONLOGON` | Run at user logon |
| `/RL LIMITED` | Run with limited privileges (non-elevated) |
| `/NP` | No password stored |
| `/IT` | Interactive token (runs in user session) |
| `/F` | Force overwrite existing task |

#### Runtime Status

The `parseSchtasksQuery()` function extracts:
- `status` - Running, Ready, etc.
- `lastRunTime` - Timestamp of last execution
- `lastRunResult` - Exit code of last run

---

## Service Environment

### Environment Variables

The service environment is carefully controlled to ensure stability. Key considerations:

1. **Minimal PATH**: Avoid version manager paths that can break after upgrades
2. **Explicit configuration**: All necessary config passed via environment
3. **Service markers**: Allow identification of service instances

```typescript
function buildServiceEnvironment(params: {
  env: Record<string, string | undefined>;
  port: number;
  token?: string;
  launchdLabel?: string;
}): Record<string, string | undefined> {
  return {
    HOME: env.HOME,
    PATH: buildMinimalServicePath({ env }),
    OPENCLAW_PROFILE: profile,
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_GATEWAY_PORT: String(port),
    OPENCLAW_GATEWAY_TOKEN: token,
    OPENCLAW_LAUNCHD_LABEL: resolvedLaunchdLabel,
    OPENCLAW_SYSTEMD_UNIT: systemdUnit,
    OPENCLAW_SERVICE_MARKER: "openclaw",
    OPENCLAW_SERVICE_KIND: "gateway",
    OPENCLAW_SERVICE_VERSION: VERSION,
  };
}
```

### Minimal Service PATH

The service uses a minimal PATH to avoid version manager paths that can break:

| Platform | PATH Components |
|----------|-----------------|
| macOS | `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`, `/bin` |
| Linux | `/usr/local/bin`, `/usr/bin`, `/bin` + user dirs (`~/.local/bin`, etc.) |
| Windows | Inherits system PATH |

**Avoided paths** (version managers that can break):
- `~/.nvm/`
- `~/.fnm/`
- `~/.volta/`
- `~/.asdf/`
- `~/.n/`
- `~/.nodenv/`
- `~/.nodebrew/`
- `/nvs/`

---

## Program Arguments

### Entrypoint Resolution

The `resolveCliEntrypointPathForService()` function finds the CLI entrypoint:

1. Check if running from built dist (`/dist/*.js`)
2. If symlinked (e.g., pnpm), prefer original symlink path for stability
3. Fall back to resolved realpath

**Key insight**: Using the symlink path keeps the service stable across package updates since pnpm updates the symlink target automatically.

### Runtime Selection

Supports three runtime modes:

| Mode | Behavior |
|------|----------|
| `auto` | Use current runtime (node or bun) |
| `node` | Force Node.js |
| `bun` | Force Bun |

```typescript
async function resolveCliProgramArguments(params: {
  args: string[];
  dev?: boolean;
  runtime?: "auto" | "node" | "bun";
  nodePath?: string;
}): Promise<GatewayProgramArgs>;
```

### System Node Detection

The service prefers system-installed Node over version-managed Node:

```typescript
// System Node candidates by platform
darwin: ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
linux: ["/usr/local/bin/node", "/usr/bin/node"]
win32: ["C:\\Program Files\\nodejs\\node.exe", "C:\\Program Files (x86)\\nodejs\\node.exe"]
```

Version manager detection patterns:
- `/.nvm/`, `/.fnm/`, `/.volta/`, `/.asdf/`, `/.n/`, `/.nodenv/`, `/.nodebrew/`, `/nvs/`

---

## Node Service

The Node service allows a machine to act as a remote execution node. It wraps the gateway service with node-specific configuration.

### Key File: `node-service.ts`

```typescript
function resolveNodeService(): GatewayService {
  const base = resolveGatewayService();
  return {
    ...base,
    install: (args) => base.install(withNodeInstallEnv(args)),
    uninstall: (args) => base.uninstall(withNodeServiceEnv(args)),
    // ... other methods wrapped similarly
  };
}
```

### Node Service Labels

| Platform | Label |
|----------|-------|
| macOS | `ai.openclaw.node` |
| Linux | `openclaw-node.service` |
| Windows | `OpenClaw Node` |

### Node-Specific Environment

```typescript
{
  OPENCLAW_LAUNCHD_LABEL: "ai.openclaw.node",
  OPENCLAW_SYSTEMD_UNIT: "openclaw-node",
  OPENCLAW_WINDOWS_TASK_NAME: "OpenClaw Node",
  OPENCLAW_TASK_SCRIPT_NAME: "node.cmd",
  OPENCLAW_LOG_PREFIX: "node",
  OPENCLAW_SERVICE_MARKER: "openclaw",
  OPENCLAW_SERVICE_KIND: "node",
  OPENCLAW_SERVICE_VERSION: VERSION,
}
```

---

## Service Audit

The audit system checks for common configuration issues that can cause service failures.

### Key File: `service-audit.ts`

### Audit Codes

| Code | Description | Level |
|------|-------------|-------|
| `gateway-command-missing` | Service command doesn't include `gateway` subcommand | aggressive |
| `gateway-path-missing` | No PATH set in service environment | recommended |
| `gateway-path-missing-dirs` | PATH missing required directories | recommended |
| `gateway-path-nonminimal` | PATH includes version manager paths | recommended |
| `gateway-runtime-bun` | Using Bun (incompatible with some channels) | recommended |
| `gateway-runtime-node-version-manager` | Node from version manager (can break) | recommended |
| `gateway-runtime-node-system-missing` | System Node 22+ not found | recommended |
| `launchd-keep-alive` | Missing KeepAlive=true | recommended |
| `launchd-run-at-load` | Missing RunAtLoad=true | recommended |
| `systemd-after-network-online` | Missing After=network-online.target | recommended |
| `systemd-wants-network-online` | Missing Wants=network-online.target | recommended |
| `systemd-restart-sec` | RestartSec not set to recommended 5s | recommended |

### Migration Detection

```typescript
function needsNodeRuntimeMigration(issues: ServiceConfigIssue[]): boolean {
  return issues.some(
    (issue) =>
      issue.code === "gateway-runtime-bun" ||
      issue.code === "gateway-runtime-node-version-manager"
  );
}
```

---

## Service Runtime Status

### Common Runtime Type

```typescript
type GatewayServiceRuntime = {
  status?: "running" | "stopped" | "unknown";
  state?: string;           // Platform-specific state
  subState?: string;        // systemd sub-state
  pid?: number;
  lastExitStatus?: number;
  lastExitReason?: string;  // launchd/systemd exit reason
  lastRunResult?: string;   // Windows last result
  lastRunTime?: string;     // Windows last run time
  detail?: string;          // Error details
  cachedLabel?: boolean;    // launchd: label cached but plist missing
  missingUnit?: boolean;    // Unit file not found
};
```

### Platform-Specific Status

| Platform | Status Check | Running Indicator |
|----------|--------------|-------------------|
| macOS | `launchctl print` | `state = running` or `pid > 0` |
| Linux | `systemctl show` | `ActiveState = active` |
| Windows | `schtasks /Query` | `Status = Running` |

---

## Diagnostics

### Key File: `diagnostics.ts`

The diagnostics module helps identify service startup failures by scanning log files:

```typescript
const GATEWAY_LOG_ERROR_PATTERNS = [
  /refusing to bind gateway/i,
  /gateway auth mode/i,
  /gateway start blocked/i,
  /failed to bind gateway socket/i,
  /tailscale .* requires/i,
];

async function readLastGatewayErrorLine(env: NodeJS.ProcessEnv): Promise<string | null>;
```

---

## Profile Support

OpenClaw supports multiple gateway profiles running simultaneously.

### Profile Resolution

```typescript
function normalizeGatewayProfile(profile?: string): string | null {
  const trimmed = profile?.trim();
  if (!trimmed || trimmed.toLowerCase() === "default") {
    return null;
  }
  return trimmed;
}
```

### Profile-Specific Labels

| Platform | Default | With Profile `dev` |
|----------|---------|-------------------|
| macOS | `ai.openclaw.gateway` | `ai.openclaw.dev` |
| Linux | `openclaw-gateway.service` | `openclaw-gateway-dev.service` |
| Windows | `OpenClaw Gateway` | `OpenClaw Gateway (dev)` |

---

## File Reference

| File | Purpose |
|------|---------|
| `service.ts` | Platform abstraction and `GatewayService` interface |
| `constants.ts` | Service labels, names, and profile resolution |
| `paths.ts` | Home directory and state directory resolution |
| `program-args.ts` | CLI entrypoint and runtime argument resolution |
| `runtime-paths.ts` | Node path detection and version manager detection |
| `service-runtime.ts` | `GatewayServiceRuntime` type definition |
| `service-env.ts` | Service environment construction and minimal PATH |
| `service-audit.ts` | Configuration auditing and issue detection |
| `node-service.ts` | Node service wrapper |
| `launchd.ts` | macOS LaunchAgent implementation |
| `launchd-plist.ts` | Plist XML generation/parsing |
| `systemd.ts` | Linux systemd implementation |
| `systemd-unit.ts` | Unit file generation/parsing |
| `systemd-linger.ts` | User linger management |
| `systemd-hints.ts` | systemd error messaging |
| `schtasks.ts` | Windows Scheduled Task implementation |
| `runtime-parse.ts` | Key-value output parsing utility |
| `diagnostics.ts` | Log file error detection |
| `inspect.ts` | Service inspection utilities |

---

## Platform Capability Summary

| Capability | macOS | Linux | Windows |
|------------|-------|-------|---------|
| Auto-start on login | ✅ RunAtLoad | ✅ WantedBy=default.target | ✅ ONLOGON |
| Crash recovery | ✅ KeepAlive | ✅ Restart=always | ❌ Manual restart |
| Boot persistence | ✅ Always | ⚠️ Requires linger | ✅ ONLOGON |
| Non-root install | ✅ | ✅ | ⚠️ May need admin |
| Log rotation | ❌ Manual | ✅ journald | ❌ Manual |
| Structured status | ✅ launchctl print | ✅ systemctl show | ⚠️ schtasks /Query |

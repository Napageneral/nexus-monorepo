package cli

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// DaemonStart starts the nexus daemon as a background process.
// It forks the current binary with the "serve" subcommand.
func DaemonStart(stateDir string, port int) error {
	// Check if already running.
	status, _ := DaemonStatus(stateDir)
	if status == "running" {
		return fmt.Errorf("daemon is already running")
	}

	// Find our own binary.
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("finding executable: %w", err)
	}

	args := []string{"serve", "--state-dir", stateDir}
	if port > 0 {
		args = append(args, "--port", strconv.Itoa(port))
	}

	cmd := exec.Command(exe, args...)
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.Stdin = nil
	// Detach from controlling terminal.
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid: true,
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("starting daemon: %w", err)
	}

	// Wait briefly for process to initialize.
	time.Sleep(500 * time.Millisecond)

	return nil
}

// DaemonStop stops a running daemon by reading its PID file and sending SIGTERM.
func DaemonStop(stateDir string) error {
	pidFile := filepath.Join(stateDir, "nex.pid")

	data, err := os.ReadFile(pidFile)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("no PID file found — daemon may not be running")
		}
		return fmt.Errorf("reading PID file: %w", err)
	}

	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		return fmt.Errorf("invalid PID file content: %w", err)
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		return fmt.Errorf("finding process %d: %w", pid, err)
	}

	if err := process.Signal(syscall.SIGTERM); err != nil {
		// Process might already be dead; clean up PID file.
		_ = os.Remove(pidFile)
		return fmt.Errorf("sending SIGTERM to %d: %w", pid, err)
	}

	// Wait for process to exit (up to 5 seconds).
	for i := 0; i < 50; i++ {
		time.Sleep(100 * time.Millisecond)
		if err := process.Signal(syscall.Signal(0)); err != nil {
			// Process exited.
			_ = os.Remove(pidFile)
			return nil
		}
	}

	return fmt.Errorf("daemon (pid %d) did not exit within 5 seconds", pid)
}

// DaemonRestart stops and restarts the daemon.
func DaemonRestart(stateDir string, port int) error {
	_ = DaemonStop(stateDir) // Ignore error if not running.
	time.Sleep(500 * time.Millisecond)
	return DaemonStart(stateDir, port)
}

// DaemonInstallLaunchd creates a macOS launchd plist for the daemon.
func DaemonInstallLaunchd(binaryPath, stateDir string) error {
	label := "com.nexus.daemon"
	plistDir := filepath.Join(os.Getenv("HOME"), "Library", "LaunchAgents")
	plistPath := filepath.Join(plistDir, label+".plist")

	if err := os.MkdirAll(plistDir, 0o755); err != nil {
		return fmt.Errorf("creating LaunchAgents directory: %w", err)
	}

	plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>%s</string>
    <key>ProgramArguments</key>
    <array>
        <string>%s</string>
        <string>serve</string>
        <string>--state-dir</string>
        <string>%s</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>%s</string>
    <key>StandardErrorPath</key>
    <string>%s</string>
</dict>
</plist>
`, label, binaryPath, stateDir,
		filepath.Join(stateDir, "nexus.log"),
		filepath.Join(stateDir, "nexus-error.log"),
	)

	if err := os.WriteFile(plistPath, []byte(plist), 0o644); err != nil {
		return fmt.Errorf("writing plist: %w", err)
	}

	fmt.Printf("Created launchd plist: %s\n", plistPath)
	fmt.Printf("Load with: launchctl load %s\n", plistPath)
	return nil
}

// DaemonInstallSystemd creates a Linux systemd user unit for the daemon.
func DaemonInstallSystemd(binaryPath, stateDir string) error {
	unitDir := filepath.Join(os.Getenv("HOME"), ".config", "systemd", "user")
	unitPath := filepath.Join(unitDir, "nexus.service")

	if err := os.MkdirAll(unitDir, 0o755); err != nil {
		return fmt.Errorf("creating systemd user directory: %w", err)
	}

	unit := fmt.Sprintf(`[Unit]
Description=Nexus AI Agent OS
After=network.target

[Service]
Type=simple
ExecStart=%s serve --state-dir %s
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`, binaryPath, stateDir)

	if err := os.WriteFile(unitPath, []byte(unit), 0o644); err != nil {
		return fmt.Errorf("writing unit file: %w", err)
	}

	fmt.Printf("Created systemd unit: %s\n", unitPath)
	fmt.Println("Enable with: systemctl --user enable nexus && systemctl --user start nexus")
	return nil
}

// DaemonStatus returns the daemon's current status: "running" or "stopped".
func DaemonStatus(stateDir string) (string, error) {
	pidFile := filepath.Join(stateDir, "nex.pid")

	data, err := os.ReadFile(pidFile)
	if err != nil {
		if os.IsNotExist(err) {
			return "stopped", nil
		}
		return "stopped", err
	}

	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		return "stopped", nil
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		return "stopped", nil
	}

	if err := process.Signal(syscall.Signal(0)); err != nil {
		// Stale PID file.
		return "stopped", nil
	}

	return "running", nil
}

// DaemonInstall dispatches to the platform-appropriate installer.
func DaemonInstall(binaryPath, stateDir string) error {
	switch runtime.GOOS {
	case "darwin":
		return DaemonInstallLaunchd(binaryPath, stateDir)
	case "linux":
		return DaemonInstallSystemd(binaryPath, stateDir)
	default:
		return fmt.Errorf("daemon install not supported on %s", runtime.GOOS)
	}
}

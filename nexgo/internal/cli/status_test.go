package cli

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Napageneral/nexus/internal/config"
)

func TestCheckHealthOffline(t *testing.T) {
	// Use a port that nothing is listening on.
	result, err := CheckHealth("localhost", 19999)
	if err != nil {
		t.Fatalf("CheckHealth error: %v", err)
	}
	if result.Overall {
		t.Error("CheckHealth should report unhealthy when daemon is offline")
	}
	if len(result.Checks) == 0 {
		t.Error("CheckHealth should have at least one check")
	}
	if result.Checks[0].Status {
		t.Error("daemon check should be false when offline")
	}
}

func TestCheckHealthOnline(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	}))
	defer server.Close()

	// Parse the port from the test server.
	addr := server.Listener.Addr().String()
	parts := strings.Split(addr, ":")
	port := 0
	if len(parts) >= 2 {
		var p int
		_, _ = fmt.Sscanf(parts[len(parts)-1], "%d", &p)
		port = p
	}

	result, err := CheckHealth("localhost", port)
	if err != nil {
		t.Fatalf("CheckHealth error: %v", err)
	}
	if !result.Overall {
		t.Error("CheckHealth should report healthy when daemon is online")
	}
}

func TestCheckStatusOffline(t *testing.T) {
	_, err := CheckStatus("localhost", 19999)
	if err == nil {
		t.Error("CheckStatus should error when daemon is offline")
	}
}

func TestStatusFormatting(t *testing.T) {
	// Verify status icon formatting produces non-empty strings.
	ok := StatusIcon(true)
	if ok == "" {
		t.Error("StatusIcon(true) should not be empty")
	}
	fail := StatusIcon(false)
	if fail == "" {
		t.Error("StatusIcon(false) should not be empty")
	}
	if ok == fail {
		t.Error("StatusIcon(true) and StatusIcon(false) should be different")
	}
}

func TestDoctorReport(t *testing.T) {
	dir := t.TempDir()

	// Create the required dirs.
	os.MkdirAll(filepath.Join(dir, "data"), 0o755)
	os.MkdirAll(filepath.Join(dir, "credentials"), 0o755)

	// Write a config.
	cfg := config.Default()
	config.Save(cfg, filepath.Join(dir, "config.json"))

	report, err := RunDoctor(dir, cfg)
	if err != nil {
		t.Fatalf("RunDoctor error: %v", err)
	}

	if len(report.Issues) > 0 {
		t.Errorf("expected no issues, got %d: %+v", len(report.Issues), report.Issues)
	}
	if len(report.Passed) == 0 {
		t.Error("expected some passed checks")
	}
}

func TestDoctorMissingStateDir(t *testing.T) {
	cfg := config.Default()
	report, err := RunDoctor("/tmp/nexus-test-nonexistent-dir-12345", cfg)
	if err != nil {
		t.Fatalf("RunDoctor error: %v", err)
	}

	if len(report.Issues) == 0 {
		t.Error("expected issues for missing state dir")
	}

	foundFS := false
	for _, issue := range report.Issues {
		if issue.Category == "filesystem" {
			foundFS = true
			break
		}
	}
	if !foundFS {
		t.Error("expected a filesystem issue for missing state dir")
	}
}

func TestDoctorInvalidConfig(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "data"), 0o755)
	os.MkdirAll(filepath.Join(dir, "credentials"), 0o755)

	// Create config with invalid port.
	cfg := config.Default()
	cfg.Runtime.Port = -1

	config.Save(cfg, filepath.Join(dir, "config.json"))

	report, err := RunDoctor(dir, cfg)
	if err != nil {
		t.Fatalf("RunDoctor error: %v", err)
	}

	if len(report.Issues) == 0 {
		t.Error("expected issues for invalid config")
	}

	foundConfig := false
	for _, issue := range report.Issues {
		if issue.Category == "config" {
			foundConfig = true
			break
		}
	}
	if !foundConfig {
		t.Error("expected a config issue for invalid port")
	}
}

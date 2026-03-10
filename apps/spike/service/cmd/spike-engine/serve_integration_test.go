//go:build integration
// +build integration

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	prlmstore "github.com/Napageneral/spike/internal/prlm/store"
)

func requireServePiIntegration(t *testing.T) {
	t.Helper()
	if os.Getenv("PRLM_INTEGRATION") != "1" {
		t.Skip("set PRLM_INTEGRATION=1 to run (costs tokens / requires go-coding-agent auth)")
	}
}

func isProviderConfigError(err error) bool {
	if err == nil {
		return false
	}
	return isProviderConfigErrorText(err.Error())
}

func isProviderConfigErrorText(text string) bool {
	msg := strings.ToLower(strings.TrimSpace(text))
	needles := []string{
		"exceeded your current quota",
		"api key not valid",
		"model not found",
		"does not exist",
		"invalid api key",
		"unauthorized",
		"authentication",
		"permission denied",
	}
	for _, needle := range needles {
		if strings.Contains(msg, needle) {
			return true
		}
	}
	return false
}

func integrationModelOverride() string {
	return strings.TrimSpace(os.Getenv("PRLM_INTEGRATION_MODEL"))
}

func TestServeAskUsesStatelessSessions(t *testing.T) {
	requireServePiIntegration(t)

	t.Log("preparing corpus and profile")
	root := t.TempDir()
	unique := fmt.Sprintf("PI_SERVE_FORK_%d", time.Now().UnixNano())
	if err := os.WriteFile(filepath.Join(root, "hello.txt"), []byte("VALUE: "+unique+"\n"), 0o644); err != nil {
		t.Fatalf("write corpus file: %v", err)
	}

	dbPath := filepath.Join(root, ".oracle.db")
	configDir := filepath.Join(root, "trees")
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		t.Fatalf("mkdir config dir: %v", err)
	}
	profilePath := filepath.Join(configDir, "oracle-deep.yaml")
	profileLines := []string{
		"tree_id: oracle-deep",
		"db: " + dbPath,
		"capacity: 120000",
		"max_children: 12",
		"max_parallel: 1",
	}
	if model := integrationModelOverride(); model != "" {
		profileLines = append(profileLines,
			"hydrate_model: "+model,
			"ask_model: "+model,
		)
	}
	profileLines = append(profileLines, "")
	profile := strings.Join(profileLines, "\n")
	if err := os.WriteFile(profilePath, []byte(profile), 0o644); err != nil {
		t.Fatalf("write profile: %v", err)
	}

	if err := cmdInit([]string{"--config", profilePath, "--scope", root}); err != nil {
		t.Fatalf("init: %v", err)
	}
	t.Log("running hydrate")
	if err := cmdHydrate([]string{"--config", profilePath, "--scope", root}); err != nil {
		if isProviderConfigError(err) {
			t.Skipf("skipping integration due provider/model access issue: %v", err)
		}
		t.Fatalf("hydrate: %v", err)
	}

	t.Log("starting oracle server and issuing ask")
	server, err := newOracleServer(configDir)
	if err != nil {
		t.Fatalf("new oracle server: %v", err)
	}
	defer server.close()

	httpServer := httptest.NewServer(server.handler())
	defer httpServer.Close()

	payload := askRequest{
		IndexID: "oracle-deep",
		Query:   "Read hello.txt and return only the line starting with VALUE:",
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal ask payload: %v", err)
	}
	resp, err := http.Post(httpServer.URL+"/ask", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("post /ask: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		if isProviderConfigErrorText(string(bodyBytes)) {
			t.Skipf("skipping integration due provider/model access issue: %s", strings.TrimSpace(string(bodyBytes)))
		}
		t.Fatalf("unexpected /ask status: %d", resp.StatusCode)
	}

	var askResp askResponse
	if err := json.NewDecoder(resp.Body).Decode(&askResp); err != nil {
		t.Fatalf("decode ask response: %v", err)
	}
	if strings.TrimSpace(askResp.RequestID) == "" {
		t.Fatalf("expected request_id in response")
	}
	if len(askResp.Visited) == 0 {
		t.Fatalf("expected visited nodes in ask response")
	}
	if !strings.Contains(strings.TrimSpace(askResp.Content), unique) {
		t.Fatalf("expected ask content to include %q, got: %q", unique, strings.TrimSpace(askResp.Content))
	}

	sqlStore, err := prlmstore.NewSQLiteStore(dbPath)
	if err != nil {
		t.Fatalf("open sqlite store: %v", err)
	}
	defer sqlStore.Close()

	var askSessionCount int
	if err := sqlStore.DB().QueryRow(
		`SELECT COUNT(*) FROM sessions WHERE origin = 'ask' AND label LIKE ?`,
		"oracle-deep:%:stateless:%",
	).Scan(&askSessionCount); err != nil {
		t.Fatalf("count stateless ask sessions: %v", err)
	}
	if askSessionCount == 0 {
		t.Fatalf("expected persisted stateless ask sessions")
	}
	if askSessionCount < len(askResp.Visited) {
		t.Fatalf("expected at least one ask session per visited node, got sessions=%d visited=%d", askSessionCount, len(askResp.Visited))
	}

	var forkSessionCount int
	if err := sqlStore.DB().QueryRow(`SELECT COUNT(*) FROM sessions WHERE origin = 'fork'`).Scan(&forkSessionCount); err != nil {
		t.Fatalf("count fork sessions: %v", err)
	}
	if forkSessionCount != 0 {
		t.Fatalf("expected zero fork sessions in raw stateless mode, got %d", forkSessionCount)
	}
}

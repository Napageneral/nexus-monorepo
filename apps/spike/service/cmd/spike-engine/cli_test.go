package main_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestPRLMCLI_AskJSON(t *testing.T) {
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	root := filepath.Clean(filepath.Join(wd, "..", ".."))

	bin := filepath.Join(t.TempDir(), "spike")
	build := exec.Command("go", "build", "-o", bin, "./cmd/spike-engine")
	build.Dir = root
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build prlm: %v\n%s", err, string(out))
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/ask" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"index_id":   "t1",
			"query":      "what is in this repo?",
			"content":    "repo summary",
			"visited":    []string{"root"},
			"request_id": "req-test",
		})
	}))
	defer server.Close()

	askCmd := exec.Command(bin, "ask",
		"--remote", server.URL,
		"--index-id", "t1",
		"--json",
		"what is in this repo?",
	)
	out, err := askCmd.CombinedOutput()
	if err != nil {
		t.Fatalf("ask: %v\n%s", err, string(out))
	}

	var resp struct {
		IndexID string   `json:"index_id"`
		Query   string   `json:"query"`
		Content string   `json:"content"`
		Visited []string `json:"visited"`
	}
	if err := json.Unmarshal(out, &resp); err != nil {
		t.Fatalf("unmarshal json: %v\n%s", err, string(out))
	}
	if resp.IndexID != "t1" {
		t.Fatalf("expected index_id t1, got %q", resp.IndexID)
	}
	if !strings.Contains(resp.Query, "what is in this repo?") {
		t.Fatalf("unexpected query: %q", resp.Query)
	}
	if resp.Content == "" {
		t.Fatalf("expected non-empty answer content")
	}
	if len(resp.Visited) == 0 {
		t.Fatalf("expected visited nodes to be non-empty")
	}
}

package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestCmdAskRemoteJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/ask" {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		_ = json.NewEncoder(w).Encode(askResponse{
			IndexID:   "oracle-deep",
			Query:     "How does auth work?",
			Content:   "Auth uses JWT.",
			Visited:   []string{"root"},
			RequestID: "req-test",
		})
	}))
	defer server.Close()

	oldStdout := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	os.Stdout = w
	err = cmdAsk([]string{"--remote", server.URL, "--index-id", "oracle-deep", "--json", "How does auth work?"})
	_ = w.Close()
	os.Stdout = oldStdout
	if err != nil {
		t.Fatalf("cmdAsk remote: %v", err)
	}
	outRaw, err := io.ReadAll(r)
	if err != nil {
		t.Fatalf("read stdout: %v", err)
	}
	output := strings.TrimSpace(string(outRaw))
	if output == "" {
		t.Fatalf("expected output from cmdAsk")
	}
	var resp askResponse
	if err := json.Unmarshal([]byte(output), &resp); err != nil {
		t.Fatalf("unmarshal output: %v, raw=%q", err, output)
	}
	if resp.IndexID != "oracle-deep" || resp.RequestID != "req-test" {
		t.Fatalf("unexpected response: %#v", resp)
	}
}

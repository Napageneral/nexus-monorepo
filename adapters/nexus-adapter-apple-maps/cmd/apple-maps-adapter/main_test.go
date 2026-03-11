package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestResolveManualMetrics(t *testing.T) {
	t.Setenv("NEXUS_APPLE_MAPS_DATE", "2026-02-26")
	t.Setenv("NEXUS_APPLE_MAPS_REVIEWS_COUNT", "102")
	t.Setenv("NEXUS_APPLE_MAPS_REVIEWS_RATING_AVG", "4.8")
	t.Setenv("NEXUS_APPLE_MAPS_REVIEWS_NEW", "6")

	metrics := resolveManualMetrics()
	if len(metrics) != 3 {
		t.Fatalf("expected 3 manual metrics, got %d", len(metrics))
	}
	if metrics[0].Date != "2026-02-26" {
		t.Fatalf("unexpected date: %q", metrics[0].Date)
	}
}

func TestSafeIDToken(t *testing.T) {
	if got := strings.ToLower(nexadapter.SafeIDToken("Apple Maps #42")); got != "apple-maps--42" {
		t.Fatalf("SafeIDToken mismatch: %q", got)
	}
}

func TestAccountsUsesRuntimeConnectionID(t *testing.T) {
	dir := t.TempDir()
	contextPath := filepath.Join(dir, "runtime-context.json")
	payload := nexadapter.RuntimeContext{
		Platform:     platformID,
		ConnectionID: "apple-live-conn",
		Config:       map[string]any{},
		Credential: &nexadapter.RuntimeCredential{
			Kind:  "config",
			Value: "manual",
			Ref:   "apple-maps/apple-live-conn",
		},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal context: %v", err)
	}
	if err := os.WriteFile(contextPath, raw, 0o600); err != nil {
		t.Fatalf("write context: %v", err)
	}
	t.Setenv(nexadapter.AdapterContextEnvVar, contextPath)

	accountsList, err := accounts(nil)
	if err != nil {
		t.Fatalf("accounts: %v", err)
	}
	if len(accountsList) != 1 {
		t.Fatalf("expected 1 account, got %d", len(accountsList))
	}
	if accountsList[0].ID != "apple-live-conn" {
		t.Fatalf("unexpected account id: %q", accountsList[0].ID)
	}
}

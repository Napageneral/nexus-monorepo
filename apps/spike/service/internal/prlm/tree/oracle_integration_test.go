//go:build integration
// +build integration

package tree_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	prlmstore "github.com/Napageneral/spike/internal/prlm/store"
	"github.com/Napageneral/spike/internal/prlm/testkit"
	prlmtree "github.com/Napageneral/spike/internal/prlm/tree"
)

func requirePiIntegration(t *testing.T) {
	t.Helper()
	if os.Getenv("PRLM_INTEGRATION") != "1" {
		t.Skip("set PRLM_INTEGRATION=1 to run (costs tokens / requires go-coding-agent auth)")
	}
}

func isProviderConfigError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(strings.TrimSpace(err.Error()))
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

func integrationOracleOptions() prlmtree.OracleTreeOptions {
	opts := prlmtree.OracleTreeOptions{}
	if model := strings.TrimSpace(os.Getenv("PRLM_INTEGRATION_MODEL")); model != "" {
		opts.LLMModel = model
	}
	if provider := strings.TrimSpace(os.Getenv("PRLM_INTEGRATION_PROVIDER")); provider != "" {
		opts.LLMProvider = provider
	}
	return opts
}

func TestOracleAskPiIntegration(t *testing.T) {
	requirePiIntegration(t)

	unique := fmt.Sprintf("PRLM_PI_INTEGRATION_%d", time.Now().UnixNano())
	root := t.TempDir()
	if err := testkit.WriteCorpus(root, map[string]string{
		"hello.txt": "VALUE: " + unique + "\n",
	}); err != nil {
		t.Fatalf("write corpus: %v", err)
	}

	sqlStore, err := prlmstore.NewSQLiteStore(filepath.Join(root, ".oracle.db"))
	if err != nil {
		t.Fatalf("new sqlite store: %v", err)
	}
	t.Cleanup(func() { _ = sqlStore.Close() })

	oracle, err := prlmtree.NewOracleTree(sqlStore, integrationOracleOptions())
	if err != nil {
		t.Fatalf("new oracle tree: %v", err)
	}

	_, err = oracle.Init(context.Background(), "pi-int", root, 1000)
	if err != nil {
		t.Fatalf("init: %v", err)
	}

	q := "Read hello.txt. Return exactly the VALUE string after 'VALUE:' and nothing else."
	answer, err := oracle.Ask(context.Background(), "pi-int", q)
	if err != nil {
		if isProviderConfigError(err) {
			t.Skipf("skipping integration due provider/model access issue: %v", err)
		}
		t.Fatalf("ask: %v", err)
	}
	if len(answer.Visited) == 0 {
		t.Fatalf("expected visited nodes to be non-empty")
	}
	if !strings.Contains(strings.TrimSpace(answer.Content), unique) {
		t.Fatalf("expected answer to include %q, got: %q", unique, strings.TrimSpace(answer.Content))
	}

	// Confirm SQLite persistence exists and state was recorded.
	if _, err := os.Stat(filepath.Join(root, ".oracle.db")); err != nil {
		t.Fatalf("expected .oracle.db to exist: %v", err)
	}
	var agentCount int
	if err := sqlStore.DB().QueryRow(`SELECT COUNT(*) FROM agents`).Scan(&agentCount); err != nil {
		t.Fatalf("count agents: %v", err)
	}
	if agentCount < 1 {
		t.Fatalf("expected at least 1 agent row, got %d", agentCount)
	}
	var sessionCount int
	if err := sqlStore.DB().QueryRow(`SELECT COUNT(*) FROM sessions`).Scan(&sessionCount); err != nil {
		t.Fatalf("count sessions: %v", err)
	}
	if sessionCount < 1 {
		t.Fatalf("expected at least 1 session row, got %d", sessionCount)
	}
}

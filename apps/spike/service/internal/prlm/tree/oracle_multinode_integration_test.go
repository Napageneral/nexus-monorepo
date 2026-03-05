//go:build integration
// +build integration

package tree_test

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	prlmstore "github.com/Napageneral/spike/internal/prlm/store"
	"github.com/Napageneral/spike/internal/prlm/testkit"
	prlmtree "github.com/Napageneral/spike/internal/prlm/tree"
)

func TestOracleAskPiIntegration_MultiNodeRoutingAndContext(t *testing.T) {
	requirePiIntegration(t)

	unique := fmt.Sprintf("PRLM_PI_MULTINODE_%d", time.Now().UnixNano())
	root := t.TempDir()
	if err := testkit.WriteCorpus(root, map[string]string{
		"broker/hello.txt":  "VALUE: " + unique + "\n",
		"runtime/other.txt": "this file is unrelated and should not be routed for broker queries\n",
	}); err != nil {
		t.Fatalf("write corpus: %v", err)
	}

	sqlStore, err := prlmstore.NewSQLiteStore(filepath.Join(root, ".oracle.db"))
	if err != nil {
		t.Fatalf("new sqlite store: %v", err)
	}
	t.Cleanup(func() { _ = sqlStore.Close() })

	opts := integrationOracleOptions()
	opts.PreserveSandbox = true
	oracle, err := prlmtree.NewOracleTree(sqlStore, opts)
	if err != nil {
		t.Fatalf("new oracle tree: %v", err)
	}

	tr, err := oracle.Init(context.Background(), "pi-multinode", root, 3)
	if err != nil {
		t.Fatalf("init: %v", err)
	}

	brokerNodeID := ""
	runtimeNodeID := ""
	for id, n := range tr.Nodes {
		if n == nil {
			continue
		}
		switch n.Path {
		case "broker":
			brokerNodeID = id
		case "runtime":
			runtimeNodeID = id
		}
	}
	if brokerNodeID == "" || runtimeNodeID == "" {
		t.Fatalf("expected broker/runtime child nodes to exist (broker=%q runtime=%q)", brokerNodeID, runtimeNodeID)
	}

	q := strings.TrimSpace(`
This question is about the broker.

If you have access to the file that contains "VALUE:", return exactly the VALUE string after "VALUE:" and nothing else.
If you do not have that file, use the child answers provided in your prompt and return the VALUE they found, and nothing else.
`)

	answer, err := oracle.Ask(context.Background(), "pi-multinode", q)
	if err != nil {
		if isProviderConfigError(err) {
			t.Skipf("skipping integration due provider/model access issue: %v", err)
		}
		t.Fatalf("ask: %v", err)
	}
	out := strings.TrimSpace(answer.Content)
	if !strings.Contains(out, unique) {
		t.Fatalf("expected output to contain %q, got: %q", unique, out)
	}

	visited := map[string]bool{}
	for _, id := range answer.Visited {
		visited[id] = true
	}
	if !visited["root"] || !visited[brokerNodeID] {
		t.Fatalf("expected root and broker child to be visited, got: %v", answer.Visited)
	}
	if !visited[runtimeNodeID] {
		t.Fatalf("expected runtime child to be visited under exhaustive dispatch, got: %v", answer.Visited)
	}
}

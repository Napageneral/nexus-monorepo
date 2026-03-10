package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestServeCodeIntelOperations(t *testing.T) {
	storageRoot := t.TempDir()
	repoRoot := filepath.Join(storageRoot, "repo")
	writeCodeIntelFixture(t, repoRoot, "go/main.go", `package main

func greet() {
	helper()
}
`)
	writeCodeIntelFixture(t, repoRoot, "go/helper.go", `package main

func helper() {}
`)
	writeCodeIntelFixture(t, repoRoot, "go/helper_test.go", `package main

import "testing"

func TestHelper(t *testing.T) {
	helper()
}
`)
	writeCodeIntelFixture(t, repoRoot, "ts/index.ts", `import { helper } from "./helper"

export function runThing() {
  return helper()
}
`)
	writeCodeIntelFixture(t, repoRoot, "ts/helper.ts", `export function helper() {
  return 1
}
`)
	writeCodeIntelFixture(t, repoRoot, "py/app.py", `from util.alias import helper

def create_alias():
    return helper()
`)
	writeCodeIntelFixture(t, repoRoot, "py/util/alias.py", `def helper():
    return 1
`)
	writeCodeIntelFixture(t, repoRoot, "c/helper.h", `int run_helper(void);
`)
	writeCodeIntelFixture(t, repoRoot, "c/helper.c", `int run_helper(void) {
  return 1;
}
`)
	writeCodeIntelFixture(t, repoRoot, "c/main.c", `#include "helper.h"

int main(void) {
  return run_helper();
}
`)

	srv, err := newOracleServer(storageRoot)
	if err != nil {
		t.Fatalf("newOracleServer: %v", err)
	}
	defer srv.close()

	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	buildResp := decodeCodeIntelResponse[struct {
		Snapshot struct {
			SnapshotID  string `json:"snapshot_id"`
			FileCount   int    `json:"file_count"`
			ChunkCount  int    `json:"chunk_count"`
			SymbolCount int    `json:"symbol_count"`
		} `json:"snapshot"`
		Languages map[string]int `json:"languages"`
	}](t, callNexOperation(t, httpSrv.URL, "spike.code-intel.index.build", map[string]interface{}{
		"root_path": repoRoot,
	}))
	if buildResp.Tool != "index.build" || buildResp.Status != "complete" {
		t.Fatalf("unexpected build envelope: %#v", buildResp)
	}
	if buildResp.Result.Snapshot.SnapshotID == "" {
		t.Fatalf("expected snapshot_id in build response")
	}
	if buildResp.Result.Snapshot.FileCount != 10 || buildResp.Result.Snapshot.ChunkCount == 0 || buildResp.Result.Snapshot.SymbolCount < 8 {
		t.Fatalf("unexpected build summary: %#v", buildResp.Result.Snapshot)
	}
	snapshotID := buildResp.Result.Snapshot.SnapshotID

	statusResp := decodeCodeIntelResponse[struct {
		Snapshot     map[string]interface{}   `json:"snapshot"`
		Capabilities []map[string]interface{} `json:"capabilities"`
	}](t, callNexOperation(t, httpSrv.URL, "spike.code-intel.index.status", map[string]interface{}{
		"snapshot_id": snapshotID,
	}))
	if statusResp.Tool != "index.status" || len(statusResp.Result.Capabilities) == 0 {
		t.Fatalf("unexpected status response: %#v", statusResp)
	}

	fileResp := decodeCodeIntelResponse[struct {
		FilePath string `json:"file_path"`
		Language string `json:"language"`
		Source   string `json:"source"`
	}](t, callNexOperation(t, httpSrv.URL, "spike.code-intel.source.file", map[string]interface{}{
		"snapshot_id":    snapshotID,
		"path":           "go/main.go",
		"include_source": true,
	}))
	if fileResp.Result.Language != "go" || fileResp.Result.Source == "" {
		t.Fatalf("unexpected source.file response: %#v", fileResp)
	}

	chunkResp := decodeCodeIntelResponse[struct {
		ChunkID   string `json:"chunk_id"`
		FilePath  string `json:"file_path"`
		Name      string `json:"name"`
		StartLine int    `json:"start_line"`
		EndLine   int    `json:"end_line"`
	}](t, callNexOperation(t, httpSrv.URL, "spike.code-intel.source.chunk", map[string]interface{}{
		"snapshot_id": snapshotID,
		"path":        "go/main.go",
		"line":        5,
	}))
	if chunkResp.Result.Name != "greet" {
		t.Fatalf("unexpected source.chunk response: %#v", chunkResp)
	}

	contextResp := decodeCodeIntelResponse[struct {
		Anchor struct {
			ChunkID string `json:"chunk_id"`
			Name    string `json:"name"`
		} `json:"anchor"`
	}](t, callNexOperation(t, httpSrv.URL, "spike.code-intel.source.context", map[string]interface{}{
		"snapshot_id": snapshotID,
		"target_id":   chunkResp.Result.ChunkID,
	}))
	if contextResp.Result.Anchor.ChunkID != chunkResp.Result.ChunkID {
		t.Fatalf("unexpected source.context response: %#v", contextResp)
	}

	searchResp := decodeCodeIntelResponse[struct {
		Query string `json:"query"`
		Hits  []struct {
			FilePath string `json:"file_path"`
		} `json:"hits"`
	}](t, callNexOperation(t, httpSrv.URL, "spike.code-intel.search.semantic", map[string]interface{}{
		"snapshot_id": snapshotID,
		"query":       "helper",
		"limit":       10,
	}))
	if len(searchResp.Result.Hits) == 0 {
		t.Fatalf("expected search hits, got %#v", searchResp)
	}

	symbolResp := decodeCodeIntelResponse[struct {
		Query   string `json:"query"`
		Symbols []struct {
			SymbolID string `json:"symbol_id"`
			Name     string `json:"name"`
			FilePath string `json:"file_path"`
		} `json:"symbols"`
	}](t, callNexOperation(t, httpSrv.URL, "spike.code-intel.symbol.resolve", map[string]interface{}{
		"snapshot_id":  snapshotID,
		"symbol_query": "greet",
		"language":     "go",
		"limit":        10,
	}))
	if len(symbolResp.Result.Symbols) != 1 || symbolResp.Result.Symbols[0].Name != "greet" {
		t.Fatalf("unexpected symbol.resolve response: %#v", symbolResp)
	}

	importsResp := decodeCodeIntelResponse[struct {
		Path    string `json:"path"`
		Imports []struct {
			ImportPath string `json:"import_path"`
		} `json:"imports"`
	}](t, callNexOperation(t, httpSrv.URL, "spike.code-intel.graph.imports", map[string]interface{}{
		"snapshot_id": snapshotID,
		"path":        "py/app.py",
	}))
	if len(importsResp.Result.Imports) != 1 || importsResp.Result.Imports[0].ImportPath != "util.alias" {
		t.Fatalf("unexpected graph.imports response: %#v", importsResp)
	}

	importersResp := decodeCodeIntelResponse[struct {
		ImportPath string `json:"import_path"`
		Importers  []struct {
			FilePath string `json:"file_path"`
		} `json:"importers"`
	}](t, callNexOperation(t, httpSrv.URL, "spike.code-intel.graph.importers", map[string]interface{}{
		"snapshot_id": snapshotID,
		"import_path": "./helper",
	}))
	if len(importersResp.Result.Importers) != 1 || importersResp.Result.Importers[0].FilePath != "ts/index.ts" {
		t.Fatalf("unexpected graph.importers response: %#v", importersResp)
	}

	refsResp := decodeCodeIntelResponse[struct {
		Symbol struct {
			Name string `json:"name"`
		} `json:"symbol"`
		References []struct {
			FilePath string `json:"file_path"`
		} `json:"references"`
	}](t, callNexOperation(t, httpSrv.URL, "spike.code-intel.symbol.references", map[string]interface{}{
		"snapshot_id":  snapshotID,
		"symbol_query": "helper",
		"language":     "go",
		"limit":        10,
	}))
	if refsResp.Result.Symbol.Name != "helper" || len(refsResp.Result.References) < 2 || !hasTestFile(refsResp.Result.References, "go/main.go") {
		t.Fatalf("unexpected symbol.references response: %#v", refsResp)
	}

	callersResp := decodeCodeIntelResponse[struct {
		Symbol struct {
			Name string `json:"name"`
		} `json:"symbol"`
		Callers []struct {
			CallerName string `json:"caller_name"`
		} `json:"callers"`
	}](t, callNexOperation(t, httpSrv.URL, "spike.code-intel.graph.callers", map[string]interface{}{
		"snapshot_id":  snapshotID,
		"symbol_query": "helper",
		"language":     "go",
		"limit":        10,
	}))
	if callersResp.Result.Symbol.Name != "helper" || len(callersResp.Result.Callers) < 2 || !hasCallerName(callersResp.Result.Callers, "greet") {
		t.Fatalf("unexpected graph.callers response: %#v", callersResp)
	}

	calleesResp := decodeCodeIntelResponse[struct {
		Caller struct {
			Name string `json:"name"`
		} `json:"caller"`
		Callees []struct {
			CalleeName string `json:"callee_name"`
		} `json:"callees"`
	}](t, callNexOperation(t, httpSrv.URL, "spike.code-intel.graph.callees", map[string]interface{}{
		"snapshot_id": snapshotID,
		"target_id":   symbolResp.Result.Symbols[0].SymbolID,
		"limit":       10,
	}))
	if len(calleesResp.Result.Callees) == 0 || calleesResp.Result.Callees[0].CalleeName != "helper" {
		t.Fatalf("unexpected graph.callees response: %#v", calleesResp)
	}

	packResp := decodeCodeIntelResponse[struct {
		AnchorSymbols []struct {
			Name string `json:"name"`
		} `json:"anchor_symbols"`
		Callees []struct {
			CalleeName string `json:"callee_name"`
		} `json:"callees"`
		Tests []struct {
			FilePath string `json:"file_path"`
		} `json:"tests"`
	}](t, callNexOperation(t, httpSrv.URL, "spike.code-intel.context.pack", map[string]interface{}{
		"snapshot_id":  snapshotID,
		"symbol_query": "greet",
		"limit":        10,
	}))
	if len(packResp.Result.AnchorSymbols) == 0 || packResp.Result.AnchorSymbols[0].Name != "greet" {
		t.Fatalf("unexpected context.pack anchors: %#v", packResp)
	}
	if len(packResp.Result.Callees) == 0 || packResp.Result.Callees[0].CalleeName != "helper" {
		t.Fatalf("unexpected context.pack callees: %#v", packResp)
	}
	if len(packResp.Result.Tests) == 0 || packResp.Result.Tests[0].FilePath != "go/helper_test.go" {
		t.Fatalf("unexpected context.pack tests: %#v", packResp)
	}

	testsResp := decodeCodeIntelResponse[struct {
		Terms []string `json:"terms"`
		Tests []struct {
			FilePath string `json:"file_path"`
		} `json:"tests"`
	}](t, callNexOperation(t, httpSrv.URL, "spike.code-intel.tests.impact", map[string]interface{}{
		"snapshot_id":  snapshotID,
		"symbol_query": "helper",
		"limit":        10,
	}))
	if len(testsResp.Result.Tests) == 0 || testsResp.Result.Tests[0].FilePath != "go/helper_test.go" {
		t.Fatalf("unexpected tests.impact response: %#v", testsResp)
	}

	guideResp := decodeCodeIntelResponse[struct {
		TaskUnderstanding      string `json:"task_understanding"`
		EvidenceBackedFindings []struct {
			Summary string `json:"summary"`
		} `json:"evidence_backed_findings"`
		RelevantFiles                   []string `json:"relevant_files"`
		RuntimeChecksForDownstreamAgent []string `json:"runtime_checks_for_the_downstream_agent"`
		SuggestedHandoffPlan            []string `json:"suggested_handoff_plan"`
		GuideMarkdown                   string   `json:"guide_markdown"`
	}](t, callNexOperation(t, httpSrv.URL, "spike.guides.build", map[string]interface{}{
		"snapshot_id":  snapshotID,
		"symbol_query": "greet",
		"limit":        10,
	}))
	if guideResp.Result.TaskUnderstanding == "" {
		t.Fatalf("expected guide task understanding: %#v", guideResp)
	}
	if len(guideResp.Result.EvidenceBackedFindings) == 0 {
		t.Fatalf("expected guide findings: %#v", guideResp)
	}
	if !hasString(guideResp.Result.RelevantFiles, "go/main.go") {
		t.Fatalf("unexpected guide files: %#v", guideResp)
	}
	if len(guideResp.Result.RuntimeChecksForDownstreamAgent) == 0 || len(guideResp.Result.SuggestedHandoffPlan) == 0 {
		t.Fatalf("expected guide checks and handoff plan: %#v", guideResp)
	}
	if !strings.Contains(guideResp.Result.GuideMarkdown, "Task Understanding") {
		t.Fatalf("unexpected guide markdown: %#v", guideResp)
	}
}

type decodedCodeIntelResponse[T any] struct {
	OK          bool     `json:"ok"`
	SnapshotID  string   `json:"snapshot_id"`
	Tool        string   `json:"tool"`
	Status      string   `json:"status"`
	Warnings    []string `json:"warnings"`
	Limitations []string `json:"limitations"`
	Result      T        `json:"result"`
}

func callNexOperation(t *testing.T, baseURL string, operation string, payload map[string]interface{}) OperationResponse {
	t.Helper()
	body, err := json.Marshal(OperationRequest{
		Operation: operation,
		Payload:   payload,
		RequestID: "test-request",
	})
	if err != nil {
		t.Fatalf("marshal operation request: %v", err)
	}
	resp, err := http.Post(baseURL+"/operations/"+operation, "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("post %s: %v", operation, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("unexpected %s status: %d", operation, resp.StatusCode)
	}
	var out OperationResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode %s response: %v", operation, err)
	}
	if out.Error != nil {
		t.Fatalf("%s returned error: %#v", operation, out.Error)
	}
	return out
}

func decodeCodeIntelResponse[T any](t *testing.T, opResp OperationResponse) decodedCodeIntelResponse[T] {
	t.Helper()
	raw, err := json.Marshal(opResp.Result)
	if err != nil {
		t.Fatalf("marshal operation result: %v", err)
	}
	var decoded decodedCodeIntelResponse[T]
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("decode operation result: %v", err)
	}
	return decoded
}

func writeCodeIntelFixture(t *testing.T, root string, rel string, content string) {
	t.Helper()
	abs := filepath.Join(root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", rel, err)
	}
	if err := os.WriteFile(abs, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", rel, err)
	}
}

func hasTestFile(items []struct {
	FilePath string `json:"file_path"`
}, want string) bool {
	for _, item := range items {
		if item.FilePath == want {
			return true
		}
	}
	return false
}

func hasCallerName(items []struct {
	CallerName string `json:"caller_name"`
}, want string) bool {
	for _, item := range items {
		if item.CallerName == want {
			return true
		}
	}
	return false
}

func hasString(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

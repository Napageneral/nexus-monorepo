package codeintel

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Napageneral/spike/internal/spikedb"
)

func TestBuildAndQuerySnapshot(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, root, "go/main.go", `package main

func greet() {
	helper()
}
`)
	writeTestFile(t, root, "go/helper.go", `package main

func helper() {}
`)
	writeTestFile(t, root, "go/helper_test.go", `package main

import "testing"

func TestHelper(t *testing.T) {
	helper()
}
`)
	writeTestFile(t, root, "ts/index.ts", `import { helper } from "./helper"

export function runThing() {
  return helper()
}
`)
	writeTestFile(t, root, "ts/helper.ts", `export function helper() {
  return 1
}
`)
	writeTestFile(t, root, "py/app.py", `from util.alias import helper

def create_alias():
    return helper()
`)
	writeTestFile(t, root, "py/util/alias.py", `def helper():
    return 1
`)
	writeTestFile(t, root, "c/helper.h", `int run_helper(void);
`)
	writeTestFile(t, root, "c/helper.c", `int run_helper(void) {
  return 1;
}
`)
	writeTestFile(t, root, "c/main.c", `#include "helper.h"

int main(void) {
  return run_helper();
}
`)

	dbPath := filepath.Join(t.TempDir(), "spike.db")
	store, err := spikedb.Open(dbPath)
	if err != nil {
		t.Fatalf("open spike db: %v", err)
	}
	defer store.Close()

	svc, err := New(store.DB())
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	result, err := svc.Build(context.Background(), BuildRequest{RootPath: root})
	if err != nil {
		t.Fatalf("build snapshot: %v", err)
	}
	if result.Snapshot.FileCount != 10 {
		t.Fatalf("expected 10 files, got %d", result.Snapshot.FileCount)
	}
	if result.Snapshot.ChunkCount == 0 {
		t.Fatalf("expected chunks to be created")
	}
	if result.Snapshot.SymbolCount < 8 {
		t.Fatalf("expected symbols to be created, got %d", result.Snapshot.SymbolCount)
	}

	file, err := svc.GetFile(context.Background(), result.Snapshot.SnapshotID, "go/main.go", true)
	if err != nil {
		t.Fatalf("get file: %v", err)
	}
	if file.Language != "go" {
		t.Fatalf("expected go language, got %q", file.Language)
	}
	if file.Source == "" {
		t.Fatalf("expected file source")
	}

	chunk, err := svc.GetChunk(context.Background(), result.Snapshot.SnapshotID, "", "go/main.go", 5)
	if err != nil {
		t.Fatalf("get chunk by file/line: %v", err)
	}
	if chunk.Name != "greet" {
		t.Fatalf("expected greet chunk, got %q", chunk.Name)
	}

	ctxPack, err := svc.GetContext(context.Background(), result.Snapshot.SnapshotID, chunk.ChunkID, "", 0)
	if err != nil {
		t.Fatalf("get context: %v", err)
	}
	if ctxPack.Anchor.ChunkID != chunk.ChunkID {
		t.Fatalf("unexpected anchor chunk")
	}

	hits, err := svc.SearchSemantic(context.Background(), result.Snapshot.SnapshotID, "helper", 10)
	if err != nil {
		t.Fatalf("search semantic: %v", err)
	}
	if len(hits.Hits) == 0 {
		t.Fatalf("expected search hits")
	}

	symbols, err := svc.ResolveSymbol(context.Background(), result.Snapshot.SnapshotID, "greet", "go", 10)
	if err != nil {
		t.Fatalf("resolve symbol: %v", err)
	}
	if len(symbols) != 1 || symbols[0].Name != "greet" {
		t.Fatalf("unexpected symbol results: %+v", symbols)
	}

	imports, err := svc.GetImports(context.Background(), result.Snapshot.SnapshotID, "py/app.py")
	if err != nil {
		t.Fatalf("get imports: %v", err)
	}
	if len(imports) != 1 || imports[0].ImportPath != "util.alias" {
		t.Fatalf("unexpected imports: %+v", imports)
	}

	importers, err := svc.GetImporters(context.Background(), result.Snapshot.SnapshotID, "./helper")
	if err != nil {
		t.Fatalf("get importers: %v", err)
	}
	if len(importers) != 1 || importers[0].FilePath != "ts/index.ts" {
		t.Fatalf("unexpected importers: %+v", importers)
	}

	cImports, err := svc.GetImports(context.Background(), result.Snapshot.SnapshotID, "c/main.c")
	if err != nil {
		t.Fatalf("get C imports: %v", err)
	}
	if len(cImports) != 1 || cImports[0].ImportPath != "helper.h" {
		t.Fatalf("unexpected C imports: %+v", cImports)
	}

	caps, err := svc.GetCapabilities(context.Background(), result.Snapshot.SnapshotID)
	if err != nil {
		t.Fatalf("get capabilities: %v", err)
	}
	if len(caps) == 0 {
		t.Fatalf("expected capabilities")
	}

	refs, err := svc.GetReferences(context.Background(), result.Snapshot.SnapshotID, "helper", "go", 10)
	if err != nil {
		t.Fatalf("get references: %v", err)
	}
	if len(refs) < 2 || !containsReferenceFile(refs, "go/main.go") {
		t.Fatalf("unexpected references: %+v", refs)
	}

	callers, err := svc.GetCallers(context.Background(), result.Snapshot.SnapshotID, "helper", "go", 10)
	if err != nil {
		t.Fatalf("get callers: %v", err)
	}
	if len(callers) < 2 || !containsCallerName(callers, "greet") {
		t.Fatalf("unexpected callers: %+v", callers)
	}

	greetSymbols, err := svc.ResolveSymbol(context.Background(), result.Snapshot.SnapshotID, "greet", "go", 10)
	if err != nil {
		t.Fatalf("resolve greet symbol: %v", err)
	}
	if len(greetSymbols) != 1 {
		t.Fatalf("expected one greet symbol, got %+v", greetSymbols)
	}

	callees, err := svc.GetCallees(context.Background(), result.Snapshot.SnapshotID, greetSymbols[0].SymbolID, "", 10)
	if err != nil {
		t.Fatalf("get callees: %v", err)
	}
	if len(callees) == 0 || callees[0].CalleeName != "helper" {
		t.Fatalf("unexpected callees: %+v", callees)
	}

	pack, err := svc.BuildContextPack(context.Background(), ContextPackRequest{
		SnapshotID:  result.Snapshot.SnapshotID,
		SymbolQuery: "greet",
		Limit:       10,
	})
	if err != nil {
		t.Fatalf("build context pack: %v", err)
	}
	if len(pack.AnchorSymbols) == 0 || pack.AnchorSymbols[0].Name != "greet" {
		t.Fatalf("unexpected context pack anchors: %+v", pack.AnchorSymbols)
	}
	if len(pack.Callees) == 0 || pack.Callees[0].CalleeName != "helper" {
		t.Fatalf("unexpected context pack callees: %+v", pack.Callees)
	}
	if len(pack.Tests) == 0 || pack.Tests[0].FilePath != "go/helper_test.go" {
		t.Fatalf("unexpected context pack tests: %+v", pack.Tests)
	}

	tests, err := svc.GetTestsImpact(context.Background(), result.Snapshot.SnapshotID, []string{"helper", "greet"}, 10)
	if err != nil {
		t.Fatalf("get tests impact: %v", err)
	}
	if len(tests) == 0 || tests[0].FilePath != "go/helper_test.go" {
		t.Fatalf("unexpected tests impact: %+v", tests)
	}

	guide, err := svc.BuildGuide(context.Background(), GuideRequest{
		SnapshotID:  result.Snapshot.SnapshotID,
		SymbolQuery: "greet",
		Limit:       10,
	})
	if err != nil {
		t.Fatalf("build guide: %v", err)
	}
	if guide.TaskUnderstanding == "" {
		t.Fatalf("expected task understanding")
	}
	if len(guide.EvidenceBackedFindings) == 0 {
		t.Fatalf("expected guide findings")
	}
	if len(guide.RelevantFiles) == 0 || !containsString(guide.RelevantFiles, "go/main.go") {
		t.Fatalf("unexpected guide files: %+v", guide.RelevantFiles)
	}
	if len(guide.RuntimeChecksForDownstreamAgent) == 0 {
		t.Fatalf("expected runtime checks")
	}
	if len(guide.SuggestedHandoffPlan) == 0 {
		t.Fatalf("expected handoff plan")
	}
	if !strings.Contains(guide.GuideMarkdown, "Task Understanding") {
		t.Fatalf("expected guide markdown sections, got %q", guide.GuideMarkdown)
	}
}

func TestBuildContextPackPlansBroadRuntimeQueries(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, root, "server.py", `from app.auth.views.login import login_user
from app.dashboard.views.aliases import aliases_dashboard

def start_server():
    return login_user() or aliases_dashboard()
`)
	writeTestFile(t, root, "email_handler.py", `def start_email_handler():
    return "email handler ready"
`)
	writeTestFile(t, root, "job_runner.py", `def process_job():
    return "job runner ready"
`)
	writeTestFile(t, root, "app/auth/views/login.py", `def login_user():
    return "login ok"
`)
	writeTestFile(t, root, "app/dashboard/views/aliases.py", `def aliases_dashboard():
    return "dashboard ready"
`)
	writeTestFile(t, root, "tests/auth/test_login.py", `from app.auth.views.login import login_user

def test_login_user():
    assert login_user() == "login ok"
`)
	writeTestFile(t, root, "app/models.py", `class User:
    def can_manage_aliases(self):
        return True
`)
	writeTestFile(t, root, "tests/test_email_handler.py", `def test_email_handler():
    assert True
`)
	writeTestFile(t, root, "tests/jobs/test_job_runner.py", `def test_job_runner():
    assert True
`)
	writeTestFile(t, root, "static/assets/plugins/datatables/datatables.js", `function datatables() { return true }`)

	dbPath := filepath.Join(t.TempDir(), "spike.db")
	store, err := spikedb.Open(dbPath)
	if err != nil {
		t.Fatalf("open spike db: %v", err)
	}
	defer store.Close()

	svc, err := New(store.DB())
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	result, err := svc.Build(context.Background(), BuildRequest{RootPath: root})
	if err != nil {
		t.Fatalf("build snapshot: %v", err)
	}

	query := "How can I tell that the web server, email handler, and job runner are up and that users can sign in from the dashboard UI and manage aliases?"
	pack, err := svc.BuildContextPack(context.Background(), ContextPackRequest{
		SnapshotID: result.Snapshot.SnapshotID,
		Query:      query,
		Limit:      12,
	})
	if err != nil {
		t.Fatalf("build context pack: %v", err)
	}
	if len(pack.AnchorChunks) < 2 {
		t.Fatalf("expected multiple source anchors for broad query, got %+v", pack.AnchorChunks)
	}
	for _, chunk := range pack.AnchorChunks {
		if isGuideAnchorCandidatePath(chunk.FilePath) {
			t.Fatalf("unexpected low-signal anchor path: %s", chunk.FilePath)
		}
	}
	expectedSourceAnchors := []string{
		"server.py",
		"email_handler.py",
		"job_runner.py",
		"app/auth/views/login.py",
		"app/dashboard/views/aliases.py",
	}
	if countMatchingStrings(chunkFilePaths(pack.AnchorChunks), expectedSourceAnchors) < 3 {
		t.Fatalf("expected runtime-oriented anchors, got %+v", chunkFilePaths(pack.AnchorChunks))
	}
	if containsPrefix(pack.SupportingFiles, "static/") {
		t.Fatalf("did not expect static assets in supporting files: %+v", pack.SupportingFiles)
	}

	guide, err := svc.BuildGuide(context.Background(), GuideRequest{
		SnapshotID: result.Snapshot.SnapshotID,
		Query:      query,
		Limit:      12,
	})
	if err != nil {
		t.Fatalf("build guide: %v", err)
	}
	if countMatchingStrings(guide.RelevantFiles, expectedSourceAnchors) < 3 {
		t.Fatalf("expected source runtime files in guide, got %+v", guide.RelevantFiles)
	}
	if containsPrefix(guide.RelevantFiles, "static/") {
		t.Fatalf("did not expect static assets in guide files: %+v", guide.RelevantFiles)
	}
	if !strings.Contains(guide.GuideMarkdown, "web server bootstrap surface") {
		t.Fatalf("expected web server surface in guide markdown, got %q", guide.GuideMarkdown)
	}
	if !strings.Contains(guide.GuideMarkdown, "auth and sign-in surface") {
		t.Fatalf("expected auth surface in guide markdown, got %q", guide.GuideMarkdown)
	}
	if !containsString(guide.RuntimeChecksForDownstreamAgent, "Start the web server from `server.py` and confirm the bootstrap entrypoints respond, including `/health` when present.") {
		t.Fatalf("expected runtime-oriented web server check, got %+v", guide.RuntimeChecksForDownstreamAgent)
	}
	if !containsString(guide.RelevantFlows, "start_server -> login_user") {
		t.Fatalf("expected runtime flow to be surfaced, got %+v", guide.RelevantFlows)
	}
	if containsString(guide.RelevantFlows, "test_login_user -> login_user") {
		t.Fatalf("did not expect test-only flow to lead surfaced runtime guide, got %+v", guide.RelevantFlows)
	}
}

func TestBuildGuideKeepsNarrowBehaviorQueriesOnTheCausalPath(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, root, "server.py", `def create_app():
    return "server"
`)
	writeTestFile(t, root, "app/api/views/new_custom_alias.py", `class LOG:
    @staticmethod
    def d(message, user):
        return None

    @staticmethod
    def w(message, user):
        return None

def jsonify(**kwargs):
    return kwargs

def verify_prefix_suffix(alias_prefix, alias_suffix):
    return alias_prefix != "wrong"

from app.alias_suffix import check_suffix_signature
from app.models import User

def new_custom_alias_v2(user: User, suffix: str):
    if not user.can_create_new_alias():
        LOG.d("user %s cannot create any custom alias", user)
        return jsonify(error="quota"), 400
    try:
        alias_suffix = check_suffix_signature(suffix)
        if not alias_suffix:
            LOG.w("Alias creation time expired for %s", user)
            return jsonify(error="Alias creation time is expired, please retry"), 412
    except Exception:
        LOG.w("Alias suffix is tampered, user %s", user)
        return jsonify(error="Tampered suffix"), 400
    if not verify_prefix_suffix("ok", alias_suffix):
        return jsonify(error="wrong alias prefix or suffix"), 400
    return jsonify(alias="ok"), 201
`)
	writeTestFile(t, root, "app/alias_suffix.py", `class itsdangerous:
    class BadSignature(Exception):
        pass

class signer:
    @staticmethod
    def unsign(signed_suffix, max_age=600):
        if signed_suffix == "tampered":
            raise itsdangerous.BadSignature()
        return b"ok"

def check_suffix_signature(suffix: str):
    try:
        return signer.unsign(suffix, max_age=600).decode()
    except itsdangerous.BadSignature:
        return None
`)
	writeTestFile(t, root, "app/models.py", `class User:
    def can_create_new_alias(self):
        return True

class Alias:
    @classmethod
    def create(cls, **kwargs):
        rate_limiter.check_bucket_limit("alias", 5, 1)
        return kwargs
`)
	writeTestFile(t, root, "tests/api/test_new_custom_alias.py", `from app.alias_suffix import check_suffix_signature
from app.api.views.new_custom_alias import new_custom_alias_v2

def test_new_custom_alias():
    assert check_suffix_signature("ok") is not None
`)

	dbPath := filepath.Join(t.TempDir(), "spike.db")
	store, err := spikedb.Open(dbPath)
	if err != nil {
		t.Fatalf("open spike db: %v", err)
	}
	defer store.Close()

	svc, err := New(store.DB())
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	result, err := svc.Build(context.Background(), BuildRequest{RootPath: root})
	if err != nil {
		t.Fatalf("build snapshot: %v", err)
	}

	query := "I am debugging intermittent validation failures during custom alias creation related to how signed suffixes are verified. Trace which component validates signed suffixes, how alias creation limits are enforced, and what shows up in the server console."
	guide, err := svc.BuildGuide(context.Background(), GuideRequest{
		SnapshotID: result.Snapshot.SnapshotID,
		Query:      query,
		Limit:      12,
	})
	if err != nil {
		t.Fatalf("build guide: %v", err)
	}
	if !containsString(guide.RelevantFiles, "app/api/views/new_custom_alias.py") {
		t.Fatalf("expected new_custom_alias route file in guide, got %+v", guide.RelevantFiles)
	}
	if !containsString(guide.RelevantFiles, "app/alias_suffix.py") {
		t.Fatalf("expected alias suffix helper in guide, got %+v", guide.RelevantFiles)
	}
	if !containsString(guide.RelevantFiles, "app/models.py") {
		t.Fatalf("expected model file in guide, got %+v", guide.RelevantFiles)
	}
	if !containsString(guide.RelevantSymbols, "check_suffix_signature") {
		t.Fatalf("expected check_suffix_signature in guide symbols, got %+v", guide.RelevantSymbols)
	}
	if !containsString(guide.RelevantSymbols, "can_create_new_alias") {
		t.Fatalf("expected can_create_new_alias in guide symbols, got %+v", guide.RelevantSymbols)
	}
	if strings.Contains(guide.GuideMarkdown, "web server bootstrap surface") {
		t.Fatalf("did not expect broad web-server surface in narrow behavior guide, got %q", guide.GuideMarkdown)
	}
	if containsString(guide.RuntimeChecksForDownstreamAgent, "Start the web server from `server.py` and confirm the bootstrap entrypoints respond, including `/health` when present.") {
		t.Fatalf("did not expect web-server runtime walkthrough in narrow behavior guide, got %+v", guide.RuntimeChecksForDownstreamAgent)
	}
	if !strings.Contains(guide.GuideMarkdown, "HTTP 412") || !strings.Contains(guide.GuideMarkdown, "Alias creation time is expired, please retry") {
		t.Fatalf("expected expired-suffix behavior facts in guide markdown, got %q", guide.GuideMarkdown)
	}
	if !strings.Contains(guide.GuideMarkdown, "returns `None`") {
		t.Fatalf("expected helper return-none clarification in guide markdown, got %q", guide.GuideMarkdown)
	}
	if !strings.Contains(guide.GuideMarkdown, "quota validation happens before signed-suffix validation") {
		t.Fatalf("expected ordering clarification in guide markdown, got %q", guide.GuideMarkdown)
	}
	if strings.Contains(guide.GuideMarkdown, "request body cannot be empty") {
		t.Fatalf("did not expect unrelated request-body branch in prompt-aligned guide markdown, got %q", guide.GuideMarkdown)
	}
}

func containsReferenceFile(refs []ReferenceRecord, want string) bool {
	for _, ref := range refs {
		if ref.FilePath == want {
			return true
		}
	}
	return false
}

func containsCallerName(calls []CallRecord, want string) bool {
	for _, call := range calls {
		if call.CallerName == want {
			return true
		}
	}
	return false
}

func containsString(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

func containsPrefix(items []string, prefix string) bool {
	for _, item := range items {
		if strings.HasPrefix(item, prefix) {
			return true
		}
	}
	return false
}

func countMatchingStrings(items []string, want []string) int {
	allowed := map[string]struct{}{}
	for _, item := range want {
		allowed[item] = struct{}{}
	}
	count := 0
	for _, item := range items {
		if _, ok := allowed[item]; ok {
			count++
		}
	}
	return count
}

func chunkFilePaths(chunks []ChunkRecord) []string {
	out := make([]string, 0, len(chunks))
	for _, chunk := range chunks {
		out = append(out, chunk.FilePath)
	}
	return out
}

func TestSchemaIncludesCodeIntelTables(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "spike.db")
	store, err := spikedb.Open(dbPath)
	if err != nil {
		t.Fatalf("open spike db: %v", err)
	}
	defer store.Close()

	required := []string{
		"code_snapshots",
		"code_files",
		"code_chunks",
		"code_symbols",
		"code_imports",
		"code_capabilities",
	}
	for _, table := range required {
		var name string
		err := store.DB().QueryRow(`SELECT name FROM sqlite_master WHERE name = ?`, table).Scan(&name)
		if err != nil {
			t.Fatalf("missing table %s: %v", table, err)
		}
	}
}

func writeTestFile(t *testing.T, root string, rel string, content string) {
	t.Helper()
	abs := filepath.Join(root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", rel, err)
	}
	if err := os.WriteFile(abs, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", rel, err)
	}
}

func openDB(t *testing.T, path string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	return db
}

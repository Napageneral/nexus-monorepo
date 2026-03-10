package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Napageneral/spike/internal/broker"
	"github.com/Napageneral/spike/internal/control"
	spikegit "github.com/Napageneral/spike/internal/git"
	prlmstore "github.com/Napageneral/spike/internal/prlm/store"
	prlmtree "github.com/Napageneral/spike/internal/prlm/tree"
	"github.com/Napageneral/spike/internal/spikedb"
)

// testUIDir resolves the real dist/ directory relative to the test package.
// The test package is at service/cmd/spike-engine; dist/ is at app/dist/.
func testUIDir(t *testing.T) string {
	t.Helper()
	uiDir, err := filepath.Abs(filepath.Join("..", "..", "..", "app", "dist"))
	if err != nil {
		t.Fatalf("resolve test ui dir: %v", err)
	}
	if _, err := os.Stat(filepath.Join(uiDir, "index.html")); err != nil {
		t.Skipf("dist/ directory not found at %s (UI files not built?), skipping test", uiDir)
	}
	return uiDir
}

func TestServeSyncPersistsCompletedJob(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "hello.txt"), []byte("hello\n"), 0o644); err != nil {
		t.Fatalf("write corpus file: %v", err)
	}

	runtimeDB := filepath.Join(root, "runtime.db")
	store, err := prlmstore.NewSQLiteStore(runtimeDB)
	if err != nil {
		t.Fatalf("new sqlite store: %v", err)
	}
	oracle, err := prlmtree.NewOracleTree(store, prlmtree.OracleTreeOptions{})
	if err != nil {
		t.Fatalf("new oracle tree: %v", err)
	}
	if _, err := oracle.Init(context.Background(), "oracle-test", root, 120000); err != nil {
		t.Fatalf("init tree: %v", err)
	}

	controlStore, err := control.Open(filepath.Join(root, "control.db"))
	if err != nil {
		t.Fatalf("open control db: %v", err)
	}

	srv := &oracleServer{
		trees: map[string]*servedTree{
			"oracle-test": {
				treeID: "oracle-test",
				store:  store,
				oracle: oracle,
			},
		},
		control: controlStore,
		gitAdapter: mustNewGitAdapterForTest(t,
			filepath.Join(root, "mirrors"),
			filepath.Join(root, "worktrees"),
		),
		syncJobs: make(chan syncJobTask, 16),
	}
	srv.startSyncWorker()
	defer srv.close()

	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	payload := syncRequest{TreeID: "oracle-test", Hydrate: false}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal sync payload: %v", err)
	}
	resp, err := http.Post(httpSrv.URL+"/sync", "application/json", bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("post /sync: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("expected /sync status 202, got %d", resp.StatusCode)
	}

	var syncResp struct {
		OK     bool   `json:"ok"`
		JobID  string `json:"job_id"`
		Status string `json:"status"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&syncResp); err != nil {
		t.Fatalf("decode /sync response: %v", err)
	}
	if !syncResp.OK || syncResp.JobID == "" || syncResp.Status != "queued" {
		t.Fatalf("unexpected /sync response: %#v", syncResp)
	}

	deadline := time.Now().Add(5 * time.Second)
	var doneJob *control.Job
	for time.Now().Before(deadline) {
		getResp, err := http.Post(httpSrv.URL+"/jobs/get", "application/json", bytes.NewReader([]byte(`{"job_id":"`+syncResp.JobID+`"}`)))
		if err != nil {
			t.Fatalf("post /jobs/get: %v", err)
		}
		if getResp.StatusCode != http.StatusOK {
			_ = getResp.Body.Close()
			t.Fatalf("expected /jobs/get status 200, got %d", getResp.StatusCode)
		}
		var payload struct {
			Job control.Job `json:"job"`
		}
		if err := json.NewDecoder(getResp.Body).Decode(&payload); err != nil {
			_ = getResp.Body.Close()
			t.Fatalf("decode /jobs/get response: %v", err)
		}
		_ = getResp.Body.Close()
		if payload.Job.Status == "completed" {
			doneJob = &payload.Job
			break
		}
		if payload.Job.Status == "failed" {
			t.Fatalf("sync job failed unexpectedly: %#v", payload.Job)
		}
		time.Sleep(25 * time.Millisecond)
	}
	if doneJob == nil {
		t.Fatalf("job did not complete before deadline")
	}
	if doneJob.ID != syncResp.JobID || doneJob.JobType != "sync" {
		t.Fatalf("unexpected completed job payload: %#v", doneJob)
	}

	jobsResp, err := http.Post(httpSrv.URL+"/jobs/list", "application/json", bytes.NewReader([]byte(`{"tree_id":"oracle-test"}`)))
	if err != nil {
		t.Fatalf("post /jobs/list: %v", err)
	}
	defer jobsResp.Body.Close()
	if jobsResp.StatusCode != http.StatusOK {
		t.Fatalf("expected /jobs/list status 200, got %d", jobsResp.StatusCode)
	}
	var out struct {
		Jobs []control.Job `json:"jobs"`
	}
	if err := json.NewDecoder(jobsResp.Body).Decode(&out); err != nil {
		t.Fatalf("decode /jobs/list response: %v", err)
	}
	if len(out.Jobs) != 1 || out.Jobs[0].ID != syncResp.JobID {
		t.Fatalf("unexpected /jobs/list payload: %#v", out)
	}
}

func TestNexAskRequiresIndexID(t *testing.T) {
	srv := &oracleServer{}
	_, err := srv.nexAsk(map[string]interface{}{
		"tree_id": "legacy-tree",
		"query":   "what is this?",
	})
	if err == nil || !strings.Contains(err.Error(), "index_id and query are required") {
		t.Fatalf("expected index_id validation error, got %v", err)
	}
}

func TestHandleAskRequiresIndexID(t *testing.T) {
	srv := &oracleServer{
		trees: map[string]*servedTree{},
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	resp, err := http.Post(httpSrv.URL+"/ask", "application/json", bytes.NewReader([]byte(`{"tree_id":"legacy-tree","query":"what is this?"}`)))
	if err != nil {
		t.Fatalf("post /ask: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected /ask 400, got %d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read /ask body: %v", err)
	}
	if !strings.Contains(string(body), "index_id and query are required") {
		t.Fatalf("expected index_id validation message, got %q", strings.TrimSpace(string(body)))
	}
}

func TestNewOracleServerAllowsMissingTreeOnStartup(t *testing.T) {
	root := t.TempDir()
	configDir := filepath.Join(root, "trees")
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		t.Fatalf("mkdir config dir: %v", err)
	}
	runtimeDir := filepath.Join(root, "runtime")
	if err := os.MkdirAll(runtimeDir, 0o755); err != nil {
		t.Fatalf("mkdir runtime dir: %v", err)
	}
	dbPath := filepath.Join(runtimeDir, "runtime.db")
	profile := strings.Join([]string{
		"tree_id: oracle-test",
		"db: " + dbPath,
		"runtime_dir: " + runtimeDir,
		"capacity: 120000",
		"max_children: 12",
		"max_parallel: 2",
		"ask_model: gpt-5.3-codex:high",
		"hydrate_model: gpt-5.3-codex:high",
		"",
	}, "\n")
	if err := os.WriteFile(filepath.Join(configDir, "oracle-test.yaml"), []byte(profile), 0o644); err != nil {
		t.Fatalf("write profile: %v", err)
	}

	server, err := newOracleServer(configDir, oracleServerOptions{
		ControlDB:       filepath.Join(root, "control.db"),
		GitMirrorsDir:   filepath.Join(root, "mirrors"),
		GitWorktreesDir: filepath.Join(root, "worktrees"),
	})
	if err != nil {
		t.Fatalf("new oracle server: %v", err)
	}
	defer server.close()

	httpSrv := httptest.NewServer(server.handler())
	defer httpSrv.Close()

	resp, err := http.Get(httpSrv.URL + "/status")
	if err != nil {
		t.Fatalf("get /status: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected /status 200, got %d", resp.StatusCode)
	}
	var status statusResponse
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		t.Fatalf("decode /status response: %v", err)
	}
	if len(status.Trees) != 0 {
		t.Fatalf("expected zero initialized trees on clean startup, got %#v", status.Trees)
	}
}

func TestServeSyncGitBindingInitializesMissingTree(t *testing.T) {
	root := t.TempDir()
	ctx := context.Background()

	originBare := filepath.Join(root, "origin.git")
	runGitCmd(t, "", "init", "--bare", originBare)

	source := filepath.Join(root, "source")
	if err := os.MkdirAll(source, 0o755); err != nil {
		t.Fatalf("mkdir source: %v", err)
	}
	runGitCmd(t, source, "init")
	runGitCmd(t, source, "config", "user.email", "test@example.com")
	runGitCmd(t, source, "config", "user.name", "Spike Test")
	writeFile(t, filepath.Join(source, "hello.txt"), "hello from git\n")
	runGitCmd(t, source, "add", "hello.txt")
	runGitCmd(t, source, "commit", "-m", "initial")
	runGitCmd(t, source, "branch", "-M", "main")
	runGitCmd(t, source, "remote", "add", "origin", originBare)
	runGitCmd(t, source, "push", "-u", "origin", "main")

	runtimeDB := filepath.Join(root, "runtime.db")
	store, err := prlmstore.NewSQLiteStore(runtimeDB)
	if err != nil {
		t.Fatalf("new sqlite store: %v", err)
	}
	oracle, err := prlmtree.NewOracleTree(store, prlmtree.OracleTreeOptions{})
	if err != nil {
		t.Fatalf("new oracle tree: %v", err)
	}

	controlStore, err := control.Open(filepath.Join(root, "control.db"))
	if err != nil {
		t.Fatalf("open control db: %v", err)
	}
	adapter := mustNewGitAdapterForTest(t,
		filepath.Join(root, "mirrors"),
		filepath.Join(root, "worktrees"),
	)

	srv := &oracleServer{
		trees: map[string]*servedTree{
			"oracle-test": {
				treeID:   "oracle-test",
				capacity: 120000,
				store:    store,
				oracle:   oracle,
			},
		},
		control:    controlStore,
		gitAdapter: adapter,
		syncJobs:   make(chan syncJobTask, 16),
	}
	srv.startSyncWorker()
	defer srv.close()

	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	syncPayload := syncRequest{
		TreeID:    "oracle-test",
		RepoID:    "repo-test",
		RemoteURL: originBare,
		Ref:       "refs/heads/main",
	}
	raw, err := json.Marshal(syncPayload)
	if err != nil {
		t.Fatalf("marshal sync payload: %v", err)
	}
	resp, err := http.Post(httpSrv.URL+"/sync", "application/json", bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("post /sync: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("expected /sync status 202, got %d", resp.StatusCode)
	}
	var syncResp struct {
		JobID string `json:"job_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&syncResp); err != nil {
		t.Fatalf("decode /sync response: %v", err)
	}
	if strings.TrimSpace(syncResp.JobID) == "" {
		t.Fatalf("expected job id in /sync response")
	}

	job := waitForSyncJob(t, httpSrv.URL, syncResp.JobID)
	if job.Status != "completed" {
		t.Fatalf("expected completed job, got %s (%s)", job.Status, job.Error)
	}

	var result map[string]any
	if err := json.Unmarshal([]byte(job.ResultJSON), &result); err != nil {
		t.Fatalf("unmarshal job result: %v", err)
	}
	gitResult, ok := result["git"].(map[string]any)
	if !ok {
		t.Fatalf("expected git result payload, got: %#v", result["git"])
	}
	worktreePath, _ := gitResult["worktree_path"].(string)
	if strings.TrimSpace(worktreePath) == "" {
		t.Fatalf("expected worktree_path in git result")
	}
	reinitialized, _ := gitResult["tree_reinitialized"].(bool)
	if !reinitialized {
		t.Fatalf("expected tree_reinitialized=true in git result")
	}

	status, err := oracle.Status(ctx, "oracle-test")
	if err != nil {
		t.Fatalf("tree status: %v", err)
	}
	if filepath.Clean(status.RootPath) != filepath.Clean(worktreePath) {
		t.Fatalf("expected tree root path %q, got %q", worktreePath, status.RootPath)
	}

	sessionListResp, err := http.Post(httpSrv.URL+"/sessions/list", "application/json", bytes.NewReader([]byte(`{"tree_id":"oracle-test"}`)))
	if err != nil {
		t.Fatalf("post /sessions/list: %v", err)
	}
	defer sessionListResp.Body.Close()
	if sessionListResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(sessionListResp.Body)
		t.Fatalf("expected /sessions/list status 200, got %d body=%s", sessionListResp.StatusCode, strings.TrimSpace(string(body)))
	}
}

func TestServeSyncGitBindingReinitializesTreeToPinnedWorktree(t *testing.T) {
	root := t.TempDir()
	ctx := context.Background()

	originBare := filepath.Join(root, "origin.git")
	runGitCmd(t, "", "init", "--bare", originBare)

	source := filepath.Join(root, "source")
	if err := os.MkdirAll(source, 0o755); err != nil {
		t.Fatalf("mkdir source: %v", err)
	}
	runGitCmd(t, source, "init")
	runGitCmd(t, source, "config", "user.email", "test@example.com")
	runGitCmd(t, source, "config", "user.name", "Spike Test")
	writeFile(t, filepath.Join(source, "hello.txt"), "hello from git\n")
	runGitCmd(t, source, "add", "hello.txt")
	runGitCmd(t, source, "commit", "-m", "initial")
	runGitCmd(t, source, "branch", "-M", "main")
	runGitCmd(t, source, "remote", "add", "origin", originBare)
	runGitCmd(t, source, "push", "-u", "origin", "main")

	standaloneScope := filepath.Join(root, "standalone")
	if err := os.MkdirAll(standaloneScope, 0o755); err != nil {
		t.Fatalf("mkdir standalone scope: %v", err)
	}
	writeFile(t, filepath.Join(standaloneScope, "local.txt"), "local\n")

	runtimeDB := filepath.Join(root, "runtime.db")
	store, err := prlmstore.NewSQLiteStore(runtimeDB)
	if err != nil {
		t.Fatalf("new sqlite store: %v", err)
	}
	oracle, err := prlmtree.NewOracleTree(store, prlmtree.OracleTreeOptions{})
	if err != nil {
		t.Fatalf("new oracle tree: %v", err)
	}
	if _, err := oracle.Init(ctx, "oracle-test", standaloneScope, 120000); err != nil {
		t.Fatalf("init tree: %v", err)
	}

	controlStore, err := control.Open(filepath.Join(root, "control.db"))
	if err != nil {
		t.Fatalf("open control db: %v", err)
	}
	adapter := mustNewGitAdapterForTest(t,
		filepath.Join(root, "mirrors"),
		filepath.Join(root, "worktrees"),
	)

	srv := &oracleServer{
		trees: map[string]*servedTree{
			"oracle-test": {
				treeID:   "oracle-test",
				capacity: 120000,
				store:    store,
				oracle:   oracle,
			},
		},
		control:    controlStore,
		gitAdapter: adapter,
		syncJobs:   make(chan syncJobTask, 16),
	}
	srv.startSyncWorker()
	defer srv.close()

	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	syncPayload := syncRequest{
		TreeID:    "oracle-test",
		RepoID:    "repo-test",
		RemoteURL: originBare,
		Ref:       "refs/heads/main",
	}
	raw, err := json.Marshal(syncPayload)
	if err != nil {
		t.Fatalf("marshal sync payload: %v", err)
	}
	resp, err := http.Post(httpSrv.URL+"/sync", "application/json", bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("post /sync: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("expected /sync status 202, got %d", resp.StatusCode)
	}
	var syncResp struct {
		JobID string `json:"job_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&syncResp); err != nil {
		t.Fatalf("decode /sync response: %v", err)
	}
	if strings.TrimSpace(syncResp.JobID) == "" {
		t.Fatalf("expected job id in /sync response")
	}

	job := waitForSyncJob(t, httpSrv.URL, syncResp.JobID)
	if job.Status != "completed" {
		t.Fatalf("expected completed job, got %s (%s)", job.Status, job.Error)
	}

	var result map[string]any
	if err := json.Unmarshal([]byte(job.ResultJSON), &result); err != nil {
		t.Fatalf("unmarshal job result: %v", err)
	}
	gitResult, ok := result["git"].(map[string]any)
	if !ok {
		t.Fatalf("expected git result payload, got: %#v", result["git"])
	}
	treeVersionResult, ok := result["tree_version"].(map[string]any)
	if !ok {
		t.Fatalf("expected tree_version result payload, got: %#v", result["tree_version"])
	}
	treeVersionID, _ := treeVersionResult["id"].(string)
	if strings.TrimSpace(treeVersionID) == "" {
		t.Fatalf("expected tree_version.id in sync job result")
	}
	treeVersionStatus, _ := treeVersionResult["status"].(string)
	if treeVersionStatus != "synced" {
		t.Fatalf("expected tree_version.status synced, got %q", treeVersionStatus)
	}
	worktreePath, _ := gitResult["worktree_path"].(string)
	if strings.TrimSpace(worktreePath) == "" {
		t.Fatalf("expected worktree_path in git result")
	}
	commitSHA, _ := gitResult["commit_sha"].(string)
	if len(strings.TrimSpace(commitSHA)) != 40 {
		t.Fatalf("expected full commit sha in git result, got %q", commitSHA)
	}
	reinitialized, _ := gitResult["tree_reinitialized"].(bool)
	if !reinitialized {
		t.Fatalf("expected tree_reinitialized=true in git result")
	}

	status, err := oracle.Status(ctx, "oracle-test")
	if err != nil {
		t.Fatalf("tree status: %v", err)
	}
	if filepath.Clean(status.RootPath) != filepath.Clean(worktreePath) {
		t.Fatalf("expected tree root path %q, got %q", worktreePath, status.RootPath)
	}
	treeVersions, err := controlStore.ListTreeVersions(control.TreeVersionFilter{
		RepoID: "repo-test",
		Limit:  10,
	})
	if err != nil {
		t.Fatalf("list tree versions: %v", err)
	}
	if len(treeVersions) != 1 {
		t.Fatalf("expected exactly one tree version row, got %#v", treeVersions)
	}
	if treeVersions[0].ID != treeVersionID || treeVersions[0].Status != "synced" {
		t.Fatalf("unexpected persisted tree version: %#v", treeVersions[0])
	}
}

func TestServeGitHubInstallationEndpoints(t *testing.T) {
	root := t.TempDir()
	store, err := spikedb.Open(filepath.Join(root, "spike.db"))
	if err != nil {
		t.Fatalf("open spike db: %v", err)
	}
	defer store.Close()

	controlStore, err := control.Open(filepath.Join(root, "control.db"))
	if err != nil {
		t.Fatalf("open control db: %v", err)
	}
	defer controlStore.Close()

	ctx := context.Background()
	err = store.UpsertGitHubInstallation(ctx, spikedb.GitHubInstallation{
		InstallationID:  42,
		AccountLogin:    "napageneral",
		AccountType:     "Organization",
		AppSlug:         "ask-spike",
		PermissionsJSON: "{}",
		MetadataJSON:    "{}",
	})
	if err != nil {
		t.Fatalf("seed installation: %v", err)
	}

	srv := &oracleServer{
		trees:      map[string]*servedTree{},
		spikeStore: store,
		control:    controlStore,
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	// List installations
	listResp, err := http.Post(httpSrv.URL+spikeGitHubInstallationsListPath, "application/json", bytes.NewReader([]byte(`{}`)))
	if err != nil {
		t.Fatalf("post %s: %v", spikeGitHubInstallationsListPath, err)
	}
	defer listResp.Body.Close()
	if listResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(listResp.Body)
		t.Fatalf("expected %s 200, got %d body=%s", spikeGitHubInstallationsListPath, listResp.StatusCode, strings.TrimSpace(string(body)))
	}
	var listOut struct {
		Installations []spikedb.GitHubInstallation `json:"installations"`
	}
	if err := json.NewDecoder(listResp.Body).Decode(&listOut); err != nil {
		t.Fatalf("decode %s response: %v", spikeGitHubInstallationsListPath, err)
	}
	if len(listOut.Installations) != 1 || listOut.Installations[0].InstallationID != 42 {
		t.Fatalf("unexpected installations list: %#v", listOut)
	}

	// Get installation
	getResp, err := http.Post(httpSrv.URL+spikeGitHubInstallationsGetPath, "application/json", bytes.NewReader([]byte(`{"installation_id":42}`)))
	if err != nil {
		t.Fatalf("post %s: %v", spikeGitHubInstallationsGetPath, err)
	}
	defer getResp.Body.Close()
	if getResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(getResp.Body)
		t.Fatalf("expected %s 200, got %d body=%s", spikeGitHubInstallationsGetPath, getResp.StatusCode, strings.TrimSpace(string(body)))
	}
	var getOut struct {
		Installation spikedb.GitHubInstallation `json:"installation"`
	}
	if err := json.NewDecoder(getResp.Body).Decode(&getOut); err != nil {
		t.Fatalf("decode %s response: %v", spikeGitHubInstallationsGetPath, err)
	}
	if getOut.Installation.AccountLogin != "napageneral" {
		t.Fatalf("unexpected installation: %#v", getOut)
	}

	// Remove installation via spikeStore (direct DB call in this test).
	err = store.DeleteGitHubInstallation(ctx, 42)
	if err != nil {
		t.Fatalf("delete installation: %v", err)
	}

	// Verify it's gone from the list
	listResp2, err := http.Post(httpSrv.URL+spikeGitHubInstallationsListPath, "application/json", bytes.NewReader([]byte(`{}`)))
	if err != nil {
		t.Fatalf("post %s after delete: %v", spikeGitHubInstallationsListPath, err)
	}
	defer listResp2.Body.Close()
	if listResp2.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(listResp2.Body)
		t.Fatalf("expected %s 200 after delete, got %d body=%s", spikeGitHubInstallationsListPath, listResp2.StatusCode, strings.TrimSpace(string(body)))
	}
	var listOut2 struct {
		Installations []spikedb.GitHubInstallation `json:"installations"`
	}
	if err := json.NewDecoder(listResp2.Body).Decode(&listOut2); err != nil {
		t.Fatalf("decode %s response after delete: %v", spikeGitHubInstallationsListPath, err)
	}
	if len(listOut2.Installations) != 0 {
		t.Fatalf("expected empty installations list after delete, got: %#v", listOut2)
	}
}

func TestServeSyncUsesBoundGitHubConnectorWithoutRemoteURL(t *testing.T) {
	root := t.TempDir()
	ctx := context.Background()

	originBare := filepath.Join(root, "origin.git")
	runGitCmd(t, "", "init", "--bare", originBare)

	source := filepath.Join(root, "source")
	if err := os.MkdirAll(source, 0o755); err != nil {
		t.Fatalf("mkdir source: %v", err)
	}
	runGitCmd(t, source, "init")
	runGitCmd(t, source, "config", "user.email", "test@example.com")
	runGitCmd(t, source, "config", "user.name", "Spike Test")
	writeFile(t, filepath.Join(source, "hello.txt"), "hello from github connector\n")
	runGitCmd(t, source, "add", "hello.txt")
	runGitCmd(t, source, "commit", "-m", "initial")
	runGitCmd(t, source, "branch", "-M", "main")
	runGitCmd(t, source, "remote", "add", "origin", originBare)
	runGitCmd(t, source, "push", "-u", "origin", "main")

	runtimeDB := filepath.Join(root, "runtime.db")
	store, err := prlmstore.NewSQLiteStore(runtimeDB)
	if err != nil {
		t.Fatalf("new sqlite store: %v", err)
	}
	oracle, err := prlmtree.NewOracleTree(store, prlmtree.OracleTreeOptions{})
	if err != nil {
		t.Fatalf("new oracle tree: %v", err)
	}
	if _, err := oracle.Init(ctx, "oracle-test", root, 120000); err != nil {
		t.Fatalf("init tree: %v", err)
	}

	controlStore, err := control.Open(filepath.Join(root, "control.db"))
	if err != nil {
		t.Fatalf("open control db: %v", err)
	}
	if _, err := controlStore.UpsertGitHubConnectorBinding(control.GitHubConnectorBindingInput{
		TreeID:  "oracle-test",
		Service: "github",
		Account: "installation-42",
		AuthID:  "custom",
	}); err != nil {
		t.Fatalf("upsert github connector binding: %v", err)
	}

	privateKeyPEM := mustGenerateRSAPrivateKeyPEMForServeTest(t)
	githubAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/app/installations/42/access_tokens":
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"token":                "ghs_spike_test_42",
				"expires_at":           "2026-02-27T00:00:00Z",
				"repository_selection": "all",
			})
		case r.Method == http.MethodGet && r.URL.Path == "/repos/acme/repo-test":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"full_name":      "acme/repo-test",
				"clone_url":      originBare,
				"default_branch": "main",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer githubAPI.Close()

	stateDir := filepath.Join(root, "nexus-state")
	writeGitHubConnectorSecretForServeTest(t, stateDir, "installation-42", "9001", "42", privateKeyPEM, githubAPI.URL)

	srv := &oracleServer{
		trees: map[string]*servedTree{
			"oracle-test": {
				treeID:   "oracle-test",
				capacity: 120000,
				store:    store,
				oracle:   oracle,
			},
		},
		control:           controlStore,
		gitAdapter:        mustNewGitAdapterForTest(t, filepath.Join(root, "mirrors"), filepath.Join(root, "worktrees")),
		connectorStateDir: stateDir,
		syncJobs:          make(chan syncJobTask, 16),
	}
	srv.startSyncWorker()
	defer srv.close()

	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	syncPayload := syncRequest{
		TreeID:  "oracle-test",
		RepoID:  "acme/repo-test",
		Hydrate: false,
	}
	raw, err := json.Marshal(syncPayload)
	if err != nil {
		t.Fatalf("marshal sync payload: %v", err)
	}
	resp, err := http.Post(httpSrv.URL+"/sync", "application/json", bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("post /sync: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusAccepted {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected /sync 202, got %d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var syncResp struct {
		JobID string `json:"job_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&syncResp); err != nil {
		t.Fatalf("decode /sync response: %v", err)
	}

	job := waitForSyncJob(t, httpSrv.URL, syncResp.JobID)
	if job.Status != "completed" {
		t.Fatalf("expected completed sync job, got %s (%s)", job.Status, job.Error)
	}

	var result struct {
		Git struct {
			RemoteURL    string `json:"remote_url"`
			RemoteSource string `json:"remote_source"`
			Ref          string `json:"ref"`
			RepoID       string `json:"repo_id"`
		} `json:"git"`
		Connector struct {
			Service string `json:"service"`
			Account string `json:"account"`
			AuthID  string `json:"auth_id"`
		} `json:"connector"`
	}
	if err := json.Unmarshal([]byte(job.ResultJSON), &result); err != nil {
		t.Fatalf("unmarshal sync result: %v", err)
	}
	if result.Git.RemoteSource != "github" || result.Connector.Service != "github" {
		t.Fatalf("expected github connector source, got result=%s", job.ResultJSON)
	}
	if result.Git.RemoteURL != originBare {
		t.Fatalf("expected public remote URL %q, got %q", originBare, result.Git.RemoteURL)
	}
	if strings.Contains(result.Git.RemoteURL, "ghs_") {
		t.Fatalf("remote_url should not leak token: %q", result.Git.RemoteURL)
	}
	if result.Git.Ref != "refs/heads/main" {
		t.Fatalf("expected resolved ref refs/heads/main, got %q", result.Git.Ref)
	}
	if result.Git.RepoID != "acme/repo-test" {
		t.Fatalf("expected canonical repo_id acme/repo-test, got %q", result.Git.RepoID)
	}
	repoRow, err := controlStore.GetRepository("acme/repo-test")
	if err != nil {
		t.Fatalf("get repository row: %v", err)
	}
	if repoRow.RemoteURL != originBare {
		t.Fatalf("expected persisted remote_url %q, got %q", originBare, repoRow.RemoteURL)
	}
}

func TestServeTreeVersionsListEndpoint(t *testing.T) {
	root := t.TempDir()
	controlStore, err := control.Open(filepath.Join(root, "control.db"))
	if err != nil {
		t.Fatalf("open control db: %v", err)
	}
	defer controlStore.Close()

	if _, err := controlStore.UpsertRepository("repo-one", "https://example.com/repo-one.git"); err != nil {
		t.Fatalf("upsert repository repo-one: %v", err)
	}
	if _, err := controlStore.UpsertRepoRef("repo-one", "refs/heads/main", "1111111111111111111111111111111111111111"); err != nil {
		t.Fatalf("upsert repo ref repo-one: %v", err)
	}
	tvOne, err := controlStore.EnsureTreeVersion(control.TreeVersionInput{
		TreeID:    "oracle-test",
		RepoID:    "repo-one",
		RefName:   "refs/heads/main",
		CommitSHA: "1111111111111111111111111111111111111111",
		RootPath:  "/tmp/worktrees/repo-one/1111",
		Status:    "synced",
	})
	if err != nil {
		t.Fatalf("ensure tree version repo-one: %v", err)
	}
	if _, err := controlStore.UpsertRepository("repo-two", "https://example.com/repo-two.git"); err != nil {
		t.Fatalf("upsert repository repo-two: %v", err)
	}
	if _, err := controlStore.UpsertRepoRef("repo-two", "refs/heads/main", "2222222222222222222222222222222222222222"); err != nil {
		t.Fatalf("upsert repo ref repo-two: %v", err)
	}
	if _, err := controlStore.EnsureTreeVersion(control.TreeVersionInput{
		TreeID:    "oracle-test",
		RepoID:    "repo-two",
		RefName:   "refs/heads/main",
		CommitSHA: "2222222222222222222222222222222222222222",
		RootPath:  "/tmp/worktrees/repo-two/2222",
		Status:    "failed",
	}); err != nil {
		t.Fatalf("ensure tree version repo-two: %v", err)
	}

	srv := &oracleServer{
		control: controlStore,
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	reqBody := `{"repo_id":"repo-one","status":"synced","limit":10}`
	resp, err := http.Post(httpSrv.URL+"/tree_versions/list", "application/json", bytes.NewReader([]byte(reqBody)))
	if err != nil {
		t.Fatalf("post /tree_versions/list: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected /tree_versions/list 200, got %d", resp.StatusCode)
	}
	var payload struct {
		TreeVersions []control.TreeVersion `json:"tree_versions"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode /tree_versions/list response: %v", err)
	}
	if len(payload.TreeVersions) != 1 {
		t.Fatalf("expected exactly one filtered tree version, got %#v", payload.TreeVersions)
	}
	if payload.TreeVersions[0].ID != tvOne.ID || payload.TreeVersions[0].RepoID != "repo-one" || payload.TreeVersions[0].Status != "synced" {
		t.Fatalf("unexpected filtered tree version payload: %#v", payload.TreeVersions[0])
	}

	repoReqBody := `{"repo_id":"repo-two","limit":10}`
	repoResp, err := http.Post(httpSrv.URL+"/repositories/list", "application/json", bytes.NewReader([]byte(repoReqBody)))
	if err != nil {
		t.Fatalf("post /repositories/list: %v", err)
	}
	defer repoResp.Body.Close()
	if repoResp.StatusCode != http.StatusOK {
		t.Fatalf("expected /repositories/list 200, got %d", repoResp.StatusCode)
	}
	var repoPayload struct {
		Repositories []control.Repository `json:"repositories"`
	}
	if err := json.NewDecoder(repoResp.Body).Decode(&repoPayload); err != nil {
		t.Fatalf("decode /repositories/list response: %v", err)
	}
	if len(repoPayload.Repositories) != 1 || repoPayload.Repositories[0].RepoID != "repo-two" {
		t.Fatalf("unexpected repositories payload: %#v", repoPayload.Repositories)
	}

	refReqBody := `{"repo_id":"repo-two","ref_name":"refs/heads/main","limit":10}`
	refResp, err := http.Post(httpSrv.URL+"/repo_refs/list", "application/json", bytes.NewReader([]byte(refReqBody)))
	if err != nil {
		t.Fatalf("post /repo_refs/list: %v", err)
	}
	defer refResp.Body.Close()
	if refResp.StatusCode != http.StatusOK {
		t.Fatalf("expected /repo_refs/list 200, got %d", refResp.StatusCode)
	}
	var refPayload struct {
		RepoRefs []control.RepoRef `json:"repo_refs"`
	}
	if err := json.NewDecoder(refResp.Body).Decode(&refPayload); err != nil {
		t.Fatalf("decode /repo_refs/list response: %v", err)
	}
	if len(refPayload.RepoRefs) != 1 || refPayload.RepoRefs[0].RepoID != "repo-two" || refPayload.RepoRefs[0].RefName != "refs/heads/main" {
		t.Fatalf("unexpected repo_refs payload: %#v", refPayload.RepoRefs)
	}

	refGetResp, err := http.Post(httpSrv.URL+"/repo_refs/get", "application/json", bytes.NewReader([]byte(`{"repo_id":"repo-two","ref_name":"refs/heads/main"}`)))
	if err != nil {
		t.Fatalf("post /repo_refs/get: %v", err)
	}
	defer refGetResp.Body.Close()
	if refGetResp.StatusCode != http.StatusOK {
		t.Fatalf("expected /repo_refs/get 200, got %d", refGetResp.StatusCode)
	}
	var refGetPayload struct {
		RepoRef control.RepoRef `json:"repo_ref"`
	}
	if err := json.NewDecoder(refGetResp.Body).Decode(&refGetPayload); err != nil {
		t.Fatalf("decode /repo_refs/get response: %v", err)
	}
	if refGetPayload.RepoRef.RepoID != "repo-two" || refGetPayload.RepoRef.RefName != "refs/heads/main" {
		t.Fatalf("unexpected repo_ref get payload: %#v", refGetPayload.RepoRef)
	}

	repoGetResp, err := http.Post(httpSrv.URL+"/repositories/get", "application/json", bytes.NewReader([]byte(`{"repo_id":"repo-one"}`)))
	if err != nil {
		t.Fatalf("post /repositories/get: %v", err)
	}
	defer repoGetResp.Body.Close()
	if repoGetResp.StatusCode != http.StatusOK {
		t.Fatalf("expected /repositories/get 200, got %d", repoGetResp.StatusCode)
	}
	var repoGetPayload struct {
		Repository control.Repository `json:"repository"`
	}
	if err := json.NewDecoder(repoGetResp.Body).Decode(&repoGetPayload); err != nil {
		t.Fatalf("decode /repositories/get response: %v", err)
	}
	if repoGetPayload.Repository.RepoID != "repo-one" {
		t.Fatalf("unexpected repository get payload: %#v", repoGetPayload.Repository)
	}

	tvGetResp, err := http.Post(httpSrv.URL+"/tree_versions/get", "application/json", bytes.NewReader([]byte(`{"id":"`+tvOne.ID+`"}`)))
	if err != nil {
		t.Fatalf("post /tree_versions/get: %v", err)
	}
	defer tvGetResp.Body.Close()
	if tvGetResp.StatusCode != http.StatusOK {
		t.Fatalf("expected /tree_versions/get 200, got %d", tvGetResp.StatusCode)
	}
	var tvGetPayload struct {
		TreeVersion control.TreeVersion `json:"tree_version"`
	}
	if err := json.NewDecoder(tvGetResp.Body).Decode(&tvGetPayload); err != nil {
		t.Fatalf("decode /tree_versions/get response: %v", err)
	}
	if tvGetPayload.TreeVersion.ID != tvOne.ID || tvGetPayload.TreeVersion.RepoID != "repo-one" {
		t.Fatalf("unexpected tree_version get payload: %#v", tvGetPayload.TreeVersion)
	}

	missingRepoResp, err := http.Post(httpSrv.URL+"/repositories/get", "application/json", bytes.NewReader([]byte(`{"repo_id":"missing"}`)))
	if err != nil {
		t.Fatalf("post /repositories/get missing: %v", err)
	}
	defer missingRepoResp.Body.Close()
	if missingRepoResp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected /repositories/get missing 404, got %d", missingRepoResp.StatusCode)
	}

	missingTVResp, err := http.Post(httpSrv.URL+"/tree_versions/get", "application/json", bytes.NewReader([]byte(`{"id":"tv-missing"}`)))
	if err != nil {
		t.Fatalf("post /tree_versions/get missing: %v", err)
	}
	defer missingTVResp.Body.Close()
	if missingTVResp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected /tree_versions/get missing 404, got %d", missingTVResp.StatusCode)
	}

	missingRefResp, err := http.Post(httpSrv.URL+"/repo_refs/get", "application/json", bytes.NewReader([]byte(`{"repo_id":"repo-two","ref_name":"refs/heads/missing"}`)))
	if err != nil {
		t.Fatalf("post /repo_refs/get missing: %v", err)
	}
	defer missingRefResp.Body.Close()
	if missingRefResp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected /repo_refs/get missing 404, got %d", missingRefResp.StatusCode)
	}
}

func TestServeAskRequestsEndpoints(t *testing.T) {
	root := t.TempDir()
	runtimeDB := filepath.Join(root, "runtime.db")
	store, err := prlmstore.NewSQLiteStore(runtimeDB)
	if err != nil {
		t.Fatalf("new sqlite store: %v", err)
	}
	defer store.Close()

	now := time.Now().UTC().UnixMilli()
	if _, err := store.DB().Exec(`
		INSERT INTO ask_requests (
			request_id, tree_id, scope_key, ref_name, commit_sha, tree_flavor, tree_version_id,
			query_text, status, root_turn_id, answer_preview, error_code, error_message, created_at, completed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		"req-old",
		"oracle-test",
		"scope-a",
		"refs/heads/main",
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"oracle-test",
		"tv-a",
		"old query",
		"running",
		"",
		"",
		"",
		"",
		now-3000,
		nil,
	); err != nil {
		t.Fatalf("insert ask request req-old: %v", err)
	}
	if _, err := store.DB().Exec(`
		INSERT INTO ask_requests (
			request_id, tree_id, scope_key, ref_name, commit_sha, tree_flavor, tree_version_id,
			query_text, status, root_turn_id, answer_preview, error_code, error_message, created_at, completed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		"req-mid",
		"oracle-test",
		"scope-a",
		"refs/heads/main",
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"oracle-test",
		"tv-a",
		"mid query",
		"completed",
		"turn-mid",
		"answer mid",
		"",
		"",
		now-2000,
		now-1500,
	); err != nil {
		t.Fatalf("insert ask request req-mid: %v", err)
	}
	if _, err := store.DB().Exec(`
		INSERT INTO ask_requests (
			request_id, tree_id, scope_key, ref_name, commit_sha, tree_flavor, tree_version_id,
			query_text, status, root_turn_id, answer_preview, error_code, error_message, created_at, completed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		"req-new",
		"oracle-test",
		"scope-b",
		"refs/heads/dev",
		"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		"oracle-test",
		"tv-b",
		"new query",
		"failed",
		"turn-new",
		"",
		"ask_failed",
		"boom",
		now-1000,
		now-900,
	); err != nil {
		t.Fatalf("insert ask request req-new: %v", err)
	}
	if _, err := store.DB().Exec(`
		INSERT INTO ask_request_executions (
			request_id, node_id, phase, attempt, origin, status, execution_backend,
			session_key, run_id, working_dir, answer_preview, error_message, started_at, completed_at
		) VALUES
			(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
			(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
			(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		"req-mid", "root", "interpret", 1, "ask", "completed", "broker", "session-mid-root", "", "/tmp/mid/root", "mid root preview", "", now-1950, now-1900,
		"req-mid", "root", "synthesize", 1, "ask", "completed", "broker", "session-mid-final", "", "/tmp/mid/root", "mid final preview", "", now-1850, now-1800,
		"req-new", "root", "interpret", 1, "ask", "failed", "broker", "session-new-root", "", "/tmp/new/root", "", "step failed", now-950, now-925,
	); err != nil {
		t.Fatalf("insert ask request executions: %v", err)
	}

	srv := &oracleServer{
		trees: map[string]*servedTree{
			"oracle-test": {store: store},
		},
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	filteredResp, err := http.Post(httpSrv.URL+"/ask_requests/list", "application/json", bytes.NewReader([]byte(`{"tree_id":"oracle-test","status":"completed","scope_key":"scope-a","limit":10}`)))
	if err != nil {
		t.Fatalf("post /ask_requests/list filtered: %v", err)
	}
	defer filteredResp.Body.Close()
	if filteredResp.StatusCode != http.StatusOK {
		t.Fatalf("expected /ask_requests/list filtered 200, got %d", filteredResp.StatusCode)
	}
	var filteredPayload struct {
		AskRequests []askRequestRecord `json:"ask_requests"`
	}
	if err := json.NewDecoder(filteredResp.Body).Decode(&filteredPayload); err != nil {
		t.Fatalf("decode /ask_requests/list filtered response: %v", err)
	}
	if len(filteredPayload.AskRequests) != 1 || filteredPayload.AskRequests[0].RequestID != "req-mid" {
		t.Fatalf("unexpected /ask_requests/list filtered payload: %#v", filteredPayload.AskRequests)
	}
	if filteredPayload.AskRequests[0].RootTurnID != "turn-mid" || filteredPayload.AskRequests[0].Status != "completed" {
		t.Fatalf("unexpected filtered ask_request row: %#v", filteredPayload.AskRequests[0])
	}
	if filteredPayload.AskRequests[0].ExecutionCount != 2 ||
		filteredPayload.AskRequests[0].LatestExecutionStatus != "completed" ||
		filteredPayload.AskRequests[0].LatestExecutionPhase != "synthesize" ||
		filteredPayload.AskRequests[0].LatestExecutionSessionKey != "session-mid-final" {
		t.Fatalf("unexpected filtered execution summary: %#v", filteredPayload.AskRequests[0])
	}

	orderedResp, err := http.Post(httpSrv.URL+"/ask_requests/list", "application/json", bytes.NewReader([]byte(`{"tree_id":"oracle-test","limit":10}`)))
	if err != nil {
		t.Fatalf("post /ask_requests/list ordered: %v", err)
	}
	defer orderedResp.Body.Close()
	if orderedResp.StatusCode != http.StatusOK {
		t.Fatalf("expected /ask_requests/list ordered 200, got %d", orderedResp.StatusCode)
	}
	var orderedPayload struct {
		AskRequests []askRequestRecord `json:"ask_requests"`
	}
	if err := json.NewDecoder(orderedResp.Body).Decode(&orderedPayload); err != nil {
		t.Fatalf("decode /ask_requests/list ordered response: %v", err)
	}
	if len(orderedPayload.AskRequests) != 3 {
		t.Fatalf("expected three ask_requests rows, got %#v", orderedPayload.AskRequests)
	}
	if orderedPayload.AskRequests[0].RequestID != "req-new" || orderedPayload.AskRequests[1].RequestID != "req-mid" || orderedPayload.AskRequests[2].RequestID != "req-old" {
		t.Fatalf("expected created_at DESC order, got %#v", orderedPayload.AskRequests)
	}
	if orderedPayload.AskRequests[0].ExecutionCount != 1 ||
		orderedPayload.AskRequests[0].LatestExecutionStatus != "failed" ||
		orderedPayload.AskRequests[0].LatestExecutionError != "step failed" {
		t.Fatalf("unexpected req-new execution summary: %#v", orderedPayload.AskRequests[0])
	}
	if orderedPayload.AskRequests[2].ExecutionCount != 0 ||
		orderedPayload.AskRequests[2].LatestExecutionStatus != "" ||
		orderedPayload.AskRequests[2].LatestExecutionSessionKey != "" {
		t.Fatalf("unexpected req-old execution summary: %#v", orderedPayload.AskRequests[2])
	}

	getResp, err := http.Post(httpSrv.URL+"/ask_requests/get", "application/json", bytes.NewReader([]byte(`{"tree_id":"oracle-test","request_id":"req-mid"}`)))
	if err != nil {
		t.Fatalf("post /ask_requests/get: %v", err)
	}
	defer getResp.Body.Close()
	if getResp.StatusCode != http.StatusOK {
		t.Fatalf("expected /ask_requests/get 200, got %d", getResp.StatusCode)
	}
	var getPayload struct {
		AskRequest askRequestRecord `json:"ask_request"`
	}
	if err := json.NewDecoder(getResp.Body).Decode(&getPayload); err != nil {
		t.Fatalf("decode /ask_requests/get response: %v", err)
	}
	if getPayload.AskRequest.RequestID != "req-mid" || getPayload.AskRequest.ScopeKey != "scope-a" {
		t.Fatalf("unexpected /ask_requests/get payload: %#v", getPayload.AskRequest)
	}
	if getPayload.AskRequest.ExecutionCount != 2 ||
		getPayload.AskRequest.LatestExecutionNodeID != "root" ||
		getPayload.AskRequest.LatestExecutionPhase != "synthesize" ||
		getPayload.AskRequest.LatestExecutionBackend != "broker" ||
		getPayload.AskRequest.LatestExecutionWorkDir != "/tmp/mid/root" {
		t.Fatalf("unexpected /ask_requests/get execution summary: %#v", getPayload.AskRequest)
	}

	missingResp, err := http.Post(httpSrv.URL+"/ask_requests/get", "application/json", bytes.NewReader([]byte(`{"tree_id":"oracle-test","request_id":"missing"}`)))
	if err != nil {
		t.Fatalf("post /ask_requests/get missing: %v", err)
	}
	defer missingResp.Body.Close()
	if missingResp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected /ask_requests/get missing 404, got %d", missingResp.StatusCode)
	}
}

func TestServeAskRequestsInspectEndpoint(t *testing.T) {
	root := t.TempDir()
	runtimeDB := filepath.Join(root, "runtime.db")
	store, err := prlmstore.NewSQLiteStore(runtimeDB)
	if err != nil {
		t.Fatalf("new sqlite store: %v", err)
	}
	defer store.Close()

	br, err := broker.NewWithDB(store.DB())
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	engine := &controlPlaneEngine{}
	br.SetEngine(engine)

	sessionLabel := "oracle-test:root:stateless:req-inspect"
	if _, err := br.CreateSession(sessionLabel, broker.SessionOptions{
		PersonaID:     "main",
		Origin:        "ask",
		ScopeKey:      "scope-a",
		RefName:       "refs/heads/main",
		CommitSHA:     "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		TreeFlavor:    "oracle-test",
		TreeVersionID: "tv-a",
		SessionDir:    root,
	}); err != nil {
		t.Fatalf("create session: %v", err)
	}
	execResult, err := br.Execute(context.Background(), sessionLabel, "inspect root turn")
	if err != nil {
		t.Fatalf("execute session: %v", err)
	}

	startedAt := time.Now().UTC().UnixMilli()
	completedAt := startedAt + 7
	if _, err := store.DB().Exec(`
		INSERT INTO tool_calls (
			id, turn_id, message_id, tool_name, tool_number, params_json, result_json, error,
			status, spawned_session_label, started_at, completed_at, sequence,
			scope_key, ref_name, commit_sha, tree_flavor, tree_version_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		"call-inspect-1",
		execResult.TurnID,
		execResult.MessageID,
		"read_file",
		1,
		`{"path":"README.md"}`,
		`{"ok":true}`,
		"",
		"completed",
		"",
		startedAt,
		completedAt,
		1,
		"scope-a",
		"refs/heads/main",
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"oracle-test",
		"tv-a",
	); err != nil {
		t.Fatalf("insert tool call: %v", err)
	}

	now := time.Now().UTC().UnixMilli()
	if _, err := store.DB().Exec(`
		INSERT INTO ask_requests (
			request_id, tree_id, scope_key, ref_name, commit_sha, tree_flavor, tree_version_id,
			query_text, status, root_turn_id, answer_preview, error_code, error_message, created_at, completed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		"req-inspect",
		"oracle-test",
		"scope-a",
		"refs/heads/main",
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"oracle-test",
		"tv-a",
		"inspect root turn",
		"completed",
		execResult.TurnID,
		"ok: inspect root turn",
		"",
		"",
		now-500,
		now-300,
	); err != nil {
		t.Fatalf("insert ask request req-inspect: %v", err)
	}
	if _, err := store.DB().Exec(`
		INSERT INTO ask_request_executions (
			request_id, node_id, phase, attempt, origin, status, execution_backend,
			session_key, run_id, working_dir, answer_preview, error_message, started_at, completed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		"req-inspect",
		"root",
		"synthesize",
		1,
		"ask",
		"completed",
		"broker",
		sessionLabel,
		"",
		root,
		"final preview",
		"",
		now-250,
		now-200,
	); err != nil {
		t.Fatalf("insert ask_request_execution req-inspect: %v", err)
	}
	if _, err := store.DB().Exec(`
		INSERT INTO ask_requests (
			request_id, tree_id, scope_key, ref_name, commit_sha, tree_flavor, tree_version_id,
			query_text, status, root_turn_id, answer_preview, error_code, error_message, created_at, completed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		"req-no-root",
		"oracle-test",
		"scope-b",
		"refs/heads/dev",
		"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		"oracle-test",
		"tv-b",
		"inspect with no root",
		"running",
		"",
		"",
		"",
		"",
		now-100,
		nil,
	); err != nil {
		t.Fatalf("insert ask request req-no-root: %v", err)
	}

	srv := &oracleServer{
		trees: map[string]*servedTree{
			"oracle-test": {
				store:  store,
				broker: br,
			},
		},
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	resp, err := http.Post(httpSrv.URL+"/ask_requests/inspect", "application/json", bytes.NewReader([]byte(`{"tree_id":"oracle-test","request_id":"req-inspect"}`)))
	if err != nil {
		t.Fatalf("post /ask_requests/inspect: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected /ask_requests/inspect 200, got %d", resp.StatusCode)
	}
	var payload struct {
		AskRequest    askRequestRecord            `json:"ask_request"`
		RootTurn      *askInspectorTurn           `json:"root_turn"`
		RootMessages  []askInspectorMessage       `json:"root_messages"`
		RootToolCalls []askInspectorToolCall      `json:"root_tool_calls"`
		RootSession   *askInspectorSession        `json:"root_session"`
		Executions    []askRequestExecutionRecord `json:"executions"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode /ask_requests/inspect response: %v", err)
	}
	if payload.AskRequest.RequestID != "req-inspect" {
		t.Fatalf("unexpected ask_request row: %#v", payload.AskRequest)
	}
	if payload.RootTurn == nil || payload.RootTurn.ID != execResult.TurnID {
		t.Fatalf("expected root_turn id %q, got %#v", execResult.TurnID, payload.RootTurn)
	}
	if len(payload.RootMessages) == 0 {
		t.Fatalf("expected non-empty root_messages")
	}
	if len(payload.RootToolCalls) != 1 || payload.RootToolCalls[0].ToolName != "read_file" {
		t.Fatalf("unexpected root_tool_calls: %#v", payload.RootToolCalls)
	}
	if payload.RootSession == nil || payload.RootSession.Label != sessionLabel || payload.RootSession.ThreadID != execResult.TurnID {
		t.Fatalf("unexpected root_session: %#v", payload.RootSession)
	}
	if len(payload.Executions) != 1 || payload.Executions[0].NodeID != "root" || payload.Executions[0].SessionKey != sessionLabel {
		t.Fatalf("unexpected executions payload: %#v", payload.Executions)
	}

	noRootResp, err := http.Post(httpSrv.URL+"/ask_requests/inspect", "application/json", bytes.NewReader([]byte(`{"tree_id":"oracle-test","request_id":"req-no-root"}`)))
	if err != nil {
		t.Fatalf("post /ask_requests/inspect req-no-root: %v", err)
	}
	defer noRootResp.Body.Close()
	if noRootResp.StatusCode != http.StatusOK {
		t.Fatalf("expected /ask_requests/inspect req-no-root 200, got %d", noRootResp.StatusCode)
	}
	var noRootPayload struct {
		AskRequest    askRequestRecord            `json:"ask_request"`
		RootTurn      *askInspectorTurn           `json:"root_turn"`
		RootMessages  []askInspectorMessage       `json:"root_messages"`
		RootToolCalls []askInspectorToolCall      `json:"root_tool_calls"`
		RootSession   *askInspectorSession        `json:"root_session"`
		Executions    []askRequestExecutionRecord `json:"executions"`
	}
	if err := json.NewDecoder(noRootResp.Body).Decode(&noRootPayload); err != nil {
		t.Fatalf("decode /ask_requests/inspect req-no-root response: %v", err)
	}
	if noRootPayload.AskRequest.RequestID != "req-no-root" {
		t.Fatalf("unexpected req-no-root ask_request row: %#v", noRootPayload.AskRequest)
	}
	if noRootPayload.RootTurn != nil || len(noRootPayload.RootMessages) != 0 || len(noRootPayload.RootToolCalls) != 0 || noRootPayload.RootSession != nil {
		t.Fatalf("expected null/empty root artifacts for req-no-root, got %#v", noRootPayload)
	}
	if len(noRootPayload.Executions) != 0 {
		t.Fatalf("expected empty executions for req-no-root, got %#v", noRootPayload.Executions)
	}

	missingResp, err := http.Post(httpSrv.URL+"/ask_requests/inspect", "application/json", bytes.NewReader([]byte(`{"tree_id":"oracle-test","request_id":"missing"}`)))
	if err != nil {
		t.Fatalf("post /ask_requests/inspect missing: %v", err)
	}
	defer missingResp.Body.Close()
	if missingResp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected /ask_requests/inspect missing 404, got %d", missingResp.StatusCode)
	}
}

func TestServeAskRequestsTimelineEndpoint(t *testing.T) {
	root := t.TempDir()
	runtimeDB := filepath.Join(root, "runtime.db")
	store, err := prlmstore.NewSQLiteStore(runtimeDB)
	if err != nil {
		t.Fatalf("new sqlite store: %v", err)
	}
	defer store.Close()

	br, err := broker.NewWithDB(store.DB())
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	engine := &controlPlaneEngine{}
	br.SetEngine(engine)

	requestID := "req-timeline"
	rootLabel := "tv-a:root:stateless:req-timeline:100"
	childOneLabel := "tv-a:root.c1:stateless:req-timeline:200"
	childTwoLabel := "tv-a:root.c2:stateless:req-timeline:300"
	otherLabel := "tv-a:root.c9:stateless:req-other:999"

	labels := []string{rootLabel, childOneLabel, childTwoLabel, otherLabel}
	results := make(map[string]*broker.TurnResult, len(labels))
	for _, label := range labels {
		if _, err := br.CreateSession(label, broker.SessionOptions{
			PersonaID:     "oracle",
			Origin:        "ask",
			ScopeKey:      "scope-a",
			RefName:       "refs/heads/main",
			CommitSHA:     "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			TreeFlavor:    "oracle-test",
			TreeVersionID: "tv-a",
			SessionDir:    root,
		}); err != nil {
			t.Fatalf("create session %s: %v", label, err)
		}
		turnResult, err := br.Execute(context.Background(), label, "timeline payload for "+label)
		if err != nil {
			t.Fatalf("execute session %s: %v", label, err)
		}
		results[label] = turnResult
	}

	startedAt := time.Now().UTC().UnixMilli()
	completedAt := startedAt + 5
	if _, err := store.DB().Exec(`
		INSERT INTO tool_calls (
			id, turn_id, message_id, tool_name, tool_number, params_json, result_json, error,
			status, spawned_session_label, started_at, completed_at, sequence,
			scope_key, ref_name, commit_sha, tree_flavor, tree_version_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		"call-timeline-1",
		results[childOneLabel].TurnID,
		results[childOneLabel].MessageID,
		"grep",
		1,
		`{"pattern":"TODO"}`,
		`{"matches":3}`,
		"",
		"completed",
		"",
		startedAt,
		completedAt,
		1,
		"scope-a",
		"refs/heads/main",
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"oracle-test",
		"tv-a",
	); err != nil {
		t.Fatalf("insert timeline tool call: %v", err)
	}

	now := time.Now().UTC().UnixMilli()
	if _, err := store.DB().Exec(`
		INSERT INTO ask_requests (
			request_id, tree_id, scope_key, ref_name, commit_sha, tree_flavor, tree_version_id,
			query_text, status, root_turn_id, answer_preview, error_code, error_message, created_at, completed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		requestID,
		"oracle-test",
		"scope-a",
		"refs/heads/main",
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"oracle-test",
		"tv-a",
		"timeline question",
		"completed",
		results[rootLabel].TurnID,
		"timeline answer",
		"",
		"",
		now-200,
		now-50,
	); err != nil {
		t.Fatalf("insert ask request req-timeline: %v", err)
	}
	if _, err := store.DB().Exec(`
		INSERT INTO ask_request_executions (
			request_id, node_id, phase, attempt, origin, status, execution_backend,
			session_key, run_id, working_dir, answer_preview, error_message, started_at, completed_at
		) VALUES
			(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
			(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
			(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		requestID, "root", "interpret", 1, "ask", "completed", "broker", rootLabel, "", root, "root preview", "", now-190, now-180,
		requestID, "root.c1", "leaf", 1, "ask", "completed", "broker", childOneLabel, "", root, "child one preview", "", now-170, now-160,
		requestID, "root.c2", "leaf", 1, "ask", "completed", "broker", childTwoLabel, "", root, "child two preview", "", now-150, now-140,
	); err != nil {
		t.Fatalf("insert ask_request_executions req-timeline: %v", err)
	}

	srv := &oracleServer{
		trees: map[string]*servedTree{
			"oracle-test": {
				store:  store,
				broker: br,
			},
		},
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	resp, err := http.Post(httpSrv.URL+"/ask_requests/timeline", "application/json", bytes.NewReader([]byte(`{"tree_id":"oracle-test","request_id":"req-timeline","limit":20}`)))
	if err != nil {
		t.Fatalf("post /ask_requests/timeline: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected /ask_requests/timeline 200, got %d", resp.StatusCode)
	}
	var payload struct {
		AskRequest    askRequestRecord            `json:"ask_request"`
		RequestToken  string                      `json:"request_token"`
		TimelineNodes []askTimelineNode           `json:"timeline_nodes"`
		Executions    []askRequestExecutionRecord `json:"executions"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode /ask_requests/timeline response: %v", err)
	}
	if payload.AskRequest.RequestID != requestID || payload.RequestToken != "req-timeline" {
		t.Fatalf("unexpected timeline header payload: %#v", payload)
	}
	if len(payload.TimelineNodes) != 3 {
		t.Fatalf("expected 3 timeline nodes (excluding other token), got %#v", payload.TimelineNodes)
	}
	if payload.TimelineNodes[0].NodeID != "root" || payload.TimelineNodes[1].NodeID != "root.c1" || payload.TimelineNodes[2].NodeID != "root.c2" {
		t.Fatalf("unexpected timeline node ordering: %#v", payload.TimelineNodes)
	}
	if !payload.TimelineNodes[0].IsRoot || payload.TimelineNodes[0].ThreadID != results[rootLabel].TurnID {
		t.Fatalf("unexpected root timeline node: %#v", payload.TimelineNodes[0])
	}
	if payload.TimelineNodes[0].ExecutionStatus != "completed" ||
		payload.TimelineNodes[0].ExecutionBackend != "broker" ||
		payload.TimelineNodes[0].Phase != "interpret" {
		t.Fatalf("unexpected root execution timeline fields: %#v", payload.TimelineNodes[0])
	}
	if payload.TimelineNodes[1].ToolCallCount != 1 {
		t.Fatalf("expected child node tool_call_count=1, got %#v", payload.TimelineNodes[1])
	}
	if payload.TimelineNodes[1].SessionLabel != childOneLabel || payload.TimelineNodes[1].WorkingDir != root {
		t.Fatalf("unexpected child one session linkage: %#v", payload.TimelineNodes[1])
	}
	if strings.TrimSpace(payload.TimelineNodes[1].AssistantPreview) == "" {
		t.Fatalf("expected assistant preview in timeline child node")
	}
	if payload.TimelineNodes[2].ToolCallCount != 0 {
		t.Fatalf("expected child two tool_call_count=0, got %#v", payload.TimelineNodes[2])
	}
	if len(payload.Executions) != 3 || payload.Executions[0].NodeID != "root" || payload.Executions[1].NodeID != "root.c1" || payload.Executions[2].NodeID != "root.c2" {
		t.Fatalf("unexpected executions timeline payload: %#v", payload.Executions)
	}

	missingResp, err := http.Post(httpSrv.URL+"/ask_requests/timeline", "application/json", bytes.NewReader([]byte(`{"tree_id":"oracle-test","request_id":"missing"}`)))
	if err != nil {
		t.Fatalf("post /ask_requests/timeline missing: %v", err)
	}
	defer missingResp.Body.Close()
	if missingResp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected /ask_requests/timeline missing 404, got %d", missingResp.StatusCode)
	}
}

func TestServeAskRequestsTimelineUsesExecutionRecordsWithoutBroker(t *testing.T) {
	root := t.TempDir()
	runtimeDB := filepath.Join(root, "runtime.db")
	store, err := prlmstore.NewSQLiteStore(runtimeDB)
	if err != nil {
		t.Fatalf("new sqlite store: %v", err)
	}
	defer store.Close()

	now := time.Now().UTC().UnixMilli()
	if _, err := store.DB().Exec(`
		INSERT INTO ask_requests (
			request_id, tree_id, scope_key, ref_name, commit_sha, tree_flavor, tree_version_id,
			query_text, status, root_turn_id, answer_preview, error_code, error_message, created_at, completed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		"req-exec-only",
		"oracle-test",
		"scope-a",
		"refs/heads/main",
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"oracle-test",
		"tv-a",
		"timeline execution only",
		"running",
		"",
		"",
		"",
		"",
		now-200,
		nil,
	); err != nil {
		t.Fatalf("insert ask request req-exec-only: %v", err)
	}
	if _, err := store.DB().Exec(`
		INSERT INTO ask_request_executions (
			request_id, node_id, phase, attempt, origin, status, execution_backend,
			session_key, run_id, working_dir, answer_preview, error_message, started_at, completed_at
		) VALUES
			(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
			(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		"req-exec-only", "root", "interpret", 1, "ask", "completed", "broker", "exec-only-root", "", filepath.Join(root, "sandbox-root"), "root preview", "", now-180, now-170,
		"req-exec-only", "root.c1", "leaf", 2, "ask", "failed", "broker", "exec-only-child", "", filepath.Join(root, "sandbox-child"), "", "child failed", now-160, now-150,
	); err != nil {
		t.Fatalf("insert ask_request_executions req-exec-only: %v", err)
	}

	srv := &oracleServer{
		trees: map[string]*servedTree{
			"oracle-test": {store: store},
		},
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	resp, err := http.Post(httpSrv.URL+"/ask_requests/timeline", "application/json", bytes.NewReader([]byte(`{"tree_id":"oracle-test","request_id":"req-exec-only","limit":20}`)))
	if err != nil {
		t.Fatalf("post /ask_requests/timeline exec-only: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected /ask_requests/timeline exec-only 200, got %d", resp.StatusCode)
	}
	var payload struct {
		AskRequest    askRequestRecord            `json:"ask_request"`
		TimelineNodes []askTimelineNode           `json:"timeline_nodes"`
		Executions    []askRequestExecutionRecord `json:"executions"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode /ask_requests/timeline exec-only response: %v", err)
	}
	if payload.AskRequest.RequestID != "req-exec-only" {
		t.Fatalf("unexpected exec-only ask request payload: %#v", payload.AskRequest)
	}
	if len(payload.TimelineNodes) != 2 {
		t.Fatalf("expected 2 exec-only timeline nodes, got %#v", payload.TimelineNodes)
	}
	if !payload.TimelineNodes[0].IsRoot || payload.TimelineNodes[0].ThreadID != "" {
		t.Fatalf("expected root node with no broker thread enrichment, got %#v", payload.TimelineNodes[0])
	}
	if payload.TimelineNodes[0].SessionLabel != "exec-only-root" ||
		payload.TimelineNodes[0].ExecutionStatus != "completed" ||
		payload.TimelineNodes[0].WorkingDir != filepath.Join(root, "sandbox-root") {
		t.Fatalf("unexpected exec-only root timeline node: %#v", payload.TimelineNodes[0])
	}
	if payload.TimelineNodes[1].ExecutionStatus != "failed" ||
		payload.TimelineNodes[1].Phase != "leaf" ||
		payload.TimelineNodes[1].Attempt != 2 ||
		payload.TimelineNodes[1].AssistantPreview != "child failed" {
		t.Fatalf("unexpected exec-only child timeline node: %#v", payload.TimelineNodes[1])
	}
	if len(payload.Executions) != 2 {
		t.Fatalf("expected 2 exec-only executions, got %#v", payload.Executions)
	}
}

func TestServeSpikeInspectorUIRoutes(t *testing.T) {
	srv := &oracleServer{uiDir: testUIDir(t)}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	redirectClient := &http.Client{
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	controlResp, err := redirectClient.Get(httpSrv.URL + "/app")
	if err != nil {
		t.Fatalf("get /app: %v", err)
	}
	defer controlResp.Body.Close()
	if controlResp.StatusCode != http.StatusTemporaryRedirect {
		t.Fatalf("expected /app redirect status %d, got %d", http.StatusTemporaryRedirect, controlResp.StatusCode)
	}
	if got := controlResp.Header.Get("Location"); got != "/app/spike/" {
		t.Fatalf("expected /app redirect location /app/spike/, got %q", got)
	}

	entryResp, err := redirectClient.Get(httpSrv.URL + "/app/spike")
	if err != nil {
		t.Fatalf("get /app/spike: %v", err)
	}
	defer entryResp.Body.Close()
	if entryResp.StatusCode != http.StatusTemporaryRedirect {
		t.Fatalf("expected /app/spike redirect status %d, got %d", http.StatusTemporaryRedirect, entryResp.StatusCode)
	}
	if got := entryResp.Header.Get("Location"); got != "/app/spike/" {
		t.Fatalf("expected /app/spike redirect location /app/spike/, got %q", got)
	}

	uiResp, err := http.Get(httpSrv.URL + "/app/spike/inspector")
	if err != nil {
		t.Fatalf("get /app/spike/inspector: %v", err)
	}
	defer uiResp.Body.Close()
	if uiResp.StatusCode != http.StatusOK {
		t.Fatalf("expected /app/spike/inspector status 200, got %d", uiResp.StatusCode)
	}
	if ctype := uiResp.Header.Get("Content-Type"); !strings.Contains(strings.ToLower(ctype), "text/html") {
		t.Fatalf("expected HTML content type, got %q", ctype)
	}
	body, err := io.ReadAll(uiResp.Body)
	if err != nil {
		t.Fatalf("read /app/spike/inspector body: %v", err)
	}
	content := string(body)
	if !strings.Contains(content, "Spike Ask Inspector") {
		t.Fatalf("expected UI title in /app/spike/inspector body")
	}
	if !strings.Contains(content, "spike.ask-requests.inspect") || !strings.Contains(content, "spike.ask-requests.timeline") {
		t.Fatalf("expected inspector API wiring in UI body")
	}
	if !strings.Contains(content, "spike.repositories.list") ||
		!strings.Contains(content, "spike.repo-refs.list") ||
		!strings.Contains(content, "spike.tree-versions.list") ||
		!strings.Contains(content, "spike.ask-requests.list") {
		t.Fatalf("expected navigator list API wiring in UI body")
	}
	if !strings.Contains(content, "Navigator") || !strings.Contains(content, "Tree Versions") || !strings.Contains(content, "Ask Requests") {
		t.Fatalf("expected navigator sections in UI body")
	}
	if !strings.Contains(content, "id=\"api-token\"") || !strings.Contains(content, "Authorization") {
		t.Fatalf("expected API token wiring in UI body")
	}
	if !strings.Contains(content, "id=\"ask-status\"") || !strings.Contains(content, "Failed Only") {
		t.Fatalf("expected ask status controls in UI body")
	}
	if !strings.Contains(content, "payload.status = askStatus") {
		t.Fatalf("expected ask status filter wiring in UI body")
	}
	if !strings.Contains(content, "Execution Records") || !strings.Contains(content, "renderExecutions") {
		t.Fatalf("expected execution records panel wiring in UI body")
	}
	if !strings.Contains(content, "latest_execution_status") ||
		!strings.Contains(content, "legacy_root_turn_id") ||
		!strings.Contains(content, "working_dir=") {
		t.Fatalf("expected execution-first ask summary and timeline wiring in UI body")
	}
}

func TestServeRuntimeAppsManifestAndAppRoute(t *testing.T) {
	srv := &oracleServer{
		trees: map[string]*servedTree{
			"oracle-test": {
				treeID: "oracle-test",
			},
		},
		authToken: "runtime-secret",
		uiDir:     testUIDir(t),
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	unauthAppsResp, err := http.Get(httpSrv.URL + "/api/apps")
	if err != nil {
		t.Fatalf("get /api/apps unauth: %v", err)
	}
	if unauthAppsResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected unauthenticated /api/apps 401, got %d", unauthAppsResp.StatusCode)
	}
	_ = unauthAppsResp.Body.Close()

	appsReq, _ := http.NewRequest(http.MethodGet, httpSrv.URL+"/api/apps", nil)
	appsReq.Header.Set("Authorization", "Bearer runtime-secret")
	appsResp, err := http.DefaultClient.Do(appsReq)
	if err != nil {
		t.Fatalf("get /api/apps auth: %v", err)
	}
	if appsResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(appsResp.Body)
		_ = appsResp.Body.Close()
		t.Fatalf("expected /api/apps 200, got %d body=%s", appsResp.StatusCode, strings.TrimSpace(string(body)))
	}
	var appsOut struct {
		OK    bool `json:"ok"`
		Items []struct {
			AppID     string `json:"app_id"`
			EntryPath string `json:"entry_path"`
			TreeID    string `json:"tree_id"`
		} `json:"items"`
	}
	if err := json.NewDecoder(appsResp.Body).Decode(&appsOut); err != nil {
		_ = appsResp.Body.Close()
		t.Fatalf("decode /api/apps response: %v", err)
	}
	_ = appsResp.Body.Close()
	if !appsOut.OK || len(appsOut.Items) != 1 {
		t.Fatalf("unexpected /api/apps payload: %#v", appsOut)
	}
	if appsOut.Items[0].AppID == "" || !strings.HasPrefix(appsOut.Items[0].EntryPath, "/app/spike/") {
		t.Fatalf("unexpected app descriptor: %#v", appsOut.Items[0])
	}

	appReq, _ := http.NewRequest(http.MethodGet, httpSrv.URL+"/app/spike/?tree_id=oracle-test", nil)
	appReq.Header.Set("Authorization", "Bearer runtime-secret")
	appResp, err := http.DefaultClient.Do(appReq)
	if err != nil {
		t.Fatalf("get /app/spike/ auth: %v", err)
	}
	if appResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(appResp.Body)
		_ = appResp.Body.Close()
		t.Fatalf("expected /app/spike/ 200, got %d body=%s", appResp.StatusCode, strings.TrimSpace(string(body)))
	}
	body, _ := io.ReadAll(appResp.Body)
	_ = appResp.Body.Close()
	if !strings.Contains(string(body), "Spike Runtime Workspace") {
		t.Fatalf("expected runtime app html marker, got: %s", strings.TrimSpace(string(body)))
	}
	if !strings.Contains(string(body), "Connect GitHub App") || !strings.Contains(string(body), "Request Timeline") {
		t.Fatalf("expected tenant runtime product flow controls in app html")
	}
}

func TestServeGitHubConnectorSetupWritesSecret(t *testing.T) {
	root := t.TempDir()
	controlStore, err := control.Open(filepath.Join(root, "control.db"))
	if err != nil {
		t.Fatalf("open control db: %v", err)
	}

	store, err := spikedb.Open(filepath.Join(root, "spike.db"))
	if err != nil {
		t.Fatalf("open spike db: %v", err)
	}
	defer store.Close()

	srv := &oracleServer{
		trees: map[string]*servedTree{
			"oracle-test": {
				treeID: "oracle-test",
			},
		},
		control:           controlStore,
		spikeStore:        store,
		connectorStateDir: filepath.Join(root, "state"),
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	privateKeyPEM := mustGenerateRSAPrivateKeyPEMForServeTest(t)
	payload := map[string]any{
		"app_id":                     "9001",
		"installation_id":            "42",
		"installation_account_login": "napageneral",
		"api_base_url":               "https://api.github.com",
		"private_key_pem":            privateKeyPEM,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal setup payload: %v", err)
	}
	resp, err := http.Post(httpSrv.URL+spikeGitHubSetupPath, "application/json", bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("post %s: %v", spikeGitHubSetupPath, err)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		t.Fatalf("expected %s 200, got %d body=%s", spikeGitHubSetupPath, resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var out struct {
		OK           bool `json:"ok"`
		Installation struct {
			InstallationID int64  `json:"installation_id"`
			AppID          string `json:"app_id"`
			SecretPath     string `json:"secret_path"`
		} `json:"installation"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		_ = resp.Body.Close()
		t.Fatalf("decode %s response: %v", spikeGitHubSetupPath, err)
	}
	_ = resp.Body.Close()
	if !out.OK || out.Installation.InstallationID != 42 || out.Installation.AppID != "9001" {
		t.Fatalf("unexpected %s payload: %#v", spikeGitHubSetupPath, out)
	}

	secretPath := filepath.Join(
		root,
		"state",
		"credentials",
		"github",
		"installations",
		"42",
		"secret.json",
	)
	secretRaw, err := os.ReadFile(secretPath)
	if err != nil {
		t.Fatalf("read connector secret file: %v", err)
	}
	var secret map[string]string
	if err := json.Unmarshal(secretRaw, &secret); err != nil {
		t.Fatalf("decode connector secret file: %v", err)
	}
	if strings.TrimSpace(secret["app_id"]) != "9001" || strings.TrimSpace(secret["installation_id"]) != "42" {
		t.Fatalf("unexpected connector secret values: %#v", secret)
	}
	if !strings.Contains(secret["private_key_pem"], "BEGIN RSA PRIVATE KEY") {
		t.Fatalf("expected private key pem in secret file")
	}
}

func TestServeGitHubConnectorInstallStartAndCallback(t *testing.T) {
	root := t.TempDir()
	controlStore, err := control.Open(filepath.Join(root, "control.db"))
	if err != nil {
		t.Fatalf("open control db: %v", err)
	}
	privateKeyPEM := mustGenerateRSAPrivateKeyPEMForServeTest(t)

	store, err := spikedb.Open(filepath.Join(root, "spike.db"))
	if err != nil {
		t.Fatalf("open spike db: %v", err)
	}
	defer store.Close()

	githubAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/app/installations/42/access_tokens":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"token":"inst-token","expires_at":"2030-01-01T00:00:00Z","repository_selection":"all"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/app/installations/42":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":42,"account":{"login":"napageneral"}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer githubAPI.Close()

	srv := &oracleServer{
		trees: map[string]*servedTree{
			"oracle-test": {
				treeID: "oracle-test",
			},
		},
		control:             controlStore,
		spikeStore:          store,
		connectorStateDir:   filepath.Join(root, "state"),
		githubAppSlug:       "ask-spike",
		githubAppID:         9001,
		githubAppPrivateKey: privateKeyPEM,
		githubAppAPIBaseURL: githubAPI.URL,
		githubInstallSecret: "state-secret-123",
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	noRedirect := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	startOut, err := srv.nexGitHubConnectorInstallStart(map[string]interface{}{
		"connectionProfileId": spikeManagedGitHubConnectionProfileID,
	})
	if err != nil {
		t.Fatalf("nexGitHubConnectorInstallStart: %v", err)
	}
	startPayload, ok := startOut.(map[string]interface{})
	if !ok {
		t.Fatalf("unexpected install start payload type: %T", startOut)
	}
	startLocation, ok := startPayload["install_url"].(string)
	if !ok {
		t.Fatalf("install start payload missing install_url: %#v", startPayload)
	}
	if startLocation == "" {
		t.Fatalf("expected install start redirect location")
	}
	parsedStart, err := url.Parse(startLocation)
	if err != nil {
		t.Fatalf("parse install start location: %v", err)
	}
	if parsedStart.Host != "github.com" || parsedStart.Path != "/apps/ask-spike/installations/new" {
		t.Fatalf("unexpected install start location: %s", startLocation)
	}
	stateParam := strings.TrimSpace(parsedStart.Query().Get("state"))
	if stateParam == "" {
		t.Fatalf("expected state query in install start redirect")
	}
	decodedState, err := decodeGitHubInstallState(stateParam, srv.githubInstallSecret, 20*time.Minute, time.Now().UTC())
	if err != nil {
		t.Fatalf("decode install state: %v", err)
	}
	if decodedState.ConnectionProfileID != spikeManagedGitHubConnectionProfileID {
		t.Fatalf("unexpected connection profile in state: %#v", decodedState)
	}

	callbackURL := httpSrv.URL + githubAdapterCallbackPath + "?installation_id=42&state=" + url.QueryEscape(stateParam)
	callbackResp, err := noRedirect.Get(callbackURL)
	if err != nil {
		t.Fatalf("get %s: %v", githubAdapterCallbackPath, err)
	}
	if callbackResp.StatusCode != http.StatusTemporaryRedirect {
		body, _ := io.ReadAll(callbackResp.Body)
		_ = callbackResp.Body.Close()
		t.Fatalf("expected %s 307, got %d body=%s", githubAdapterCallbackPath, callbackResp.StatusCode, strings.TrimSpace(string(body)))
	}
	callbackLocation := strings.TrimSpace(callbackResp.Header.Get("Location"))
	_ = callbackResp.Body.Close()
	if callbackLocation == "" {
		t.Fatalf("expected callback redirect location")
	}
	parsedCallback, err := url.Parse(callbackLocation)
	if err != nil {
		t.Fatalf("parse callback location: %v", err)
	}
	if parsedCallback.Path != "/" {
		t.Fatalf("unexpected callback redirect path: %s", callbackLocation)
	}
	if got := strings.TrimSpace(parsedCallback.Query().Get("github_connect")); got != "connected" {
		t.Fatalf("expected callback github_connect connected, got %q", got)
	}

	ctx := context.Background()
	installation, err := store.GetGitHubInstallation(ctx, 42)
	if err != nil {
		t.Fatalf("get github installation: %v", err)
	}
	if installation.AccountLogin != "napageneral" {
		t.Fatalf("unexpected installation after callback: %#v", installation)
	}

	secretPath := filepath.Join(
		root,
		"state",
		"credentials",
		"github",
		"installations",
		"42",
		"secret.json",
	)
	secretRaw, err := os.ReadFile(secretPath)
	if err != nil {
		t.Fatalf("read connector secret file: %v", err)
	}
	var secret map[string]string
	if err := json.Unmarshal(secretRaw, &secret); err != nil {
		t.Fatalf("decode connector secret file: %v", err)
	}
	if strings.TrimSpace(secret["app_id"]) != "9001" || strings.TrimSpace(secret["installation_id"]) != "42" {
		t.Fatalf("unexpected connector secret values: %#v", secret)
	}
	if strings.TrimSpace(secret["installation_account_login"]) != "napageneral" {
		t.Fatalf("expected installation account login in secret file, got %#v", secret)
	}
}

func TestNexGitHubConnectorInstallStartRequiresManagedConnectionProfile(t *testing.T) {
	srv := &oracleServer{
		githubAppSlug:       "ask-spike",
		githubAppID:         9001,
		githubAppPrivateKey: "private-key",
		githubInstallSecret: "state-secret-123",
	}

	if _, err := srv.nexGitHubConnectorInstallStart(nil); err == nil || !strings.Contains(err.Error(), "connectionProfileId is required") {
		t.Fatalf("expected missing connectionProfileId error, got %v", err)
	}

	_, err := srv.nexGitHubConnectorInstallStart(map[string]interface{}{
		"connectionProfileId": spikeBringYourOwnGitHubAppConnectionID,
	})
	if err == nil {
		t.Fatalf("expected unsupported connection profile error")
	}
	if !strings.Contains(err.Error(), spikeManagedGitHubConnectionProfileID) {
		t.Fatalf("expected managed connection profile requirement, got %v", err)
	}
}

func TestServeGitHubConnectorInstallCallbackRejectsUnsupportedConnectionProfile(t *testing.T) {
	srv := &oracleServer{
		githubAppSlug:       "ask-spike",
		githubAppID:         9001,
		githubAppPrivateKey: "private-key",
		githubInstallSecret: "state-secret-123",
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	state, err := encodeGitHubInstallState(githubInstallStatePayload{
		IssuedAt:            time.Now().UTC().Unix(),
		Nonce:               "nonce-123",
		ConnectionProfileID: spikeBringYourOwnGitHubAppConnectionID,
	}, srv.githubInstallSecret)
	if err != nil {
		t.Fatalf("encode state: %v", err)
	}

	noRedirect := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	callbackURL := httpSrv.URL + githubAdapterCallbackPath + "?installation_id=42&state=" + url.QueryEscape(state)
	callbackResp, err := noRedirect.Get(callbackURL)
	if err != nil {
		t.Fatalf("get %s: %v", githubAdapterCallbackPath, err)
	}
	defer callbackResp.Body.Close()
	if callbackResp.StatusCode != http.StatusTemporaryRedirect {
		body, _ := io.ReadAll(callbackResp.Body)
		t.Fatalf("expected %s 307, got %d body=%s", githubAdapterCallbackPath, callbackResp.StatusCode, strings.TrimSpace(string(body)))
	}
	redirectLocation := strings.TrimSpace(callbackResp.Header.Get("Location"))
	parsedRedirect, err := url.Parse(redirectLocation)
	if err != nil {
		t.Fatalf("parse redirect location: %v", err)
	}
	if got := strings.TrimSpace(parsedRedirect.Query().Get("github_connect")); got != "error" {
		t.Fatalf("expected github_connect=error, got %q", got)
	}
	if got := strings.TrimSpace(parsedRedirect.Query().Get("github_detail")); got != "invalid_connection_profile" {
		t.Fatalf("expected github_detail invalid_connection_profile, got %q", got)
	}
}

func TestServeGitHubConnectorRepoBranchCommitEndpoints(t *testing.T) {
	root := t.TempDir()

	privateKeyPEM := mustGenerateRSAPrivateKeyPEMForServeTest(t)
	githubAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/app/installations/42/access_tokens":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"token":"inst-token","expires_at":"2030-01-01T00:00:00Z","repository_selection":"all"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/installation/repositories":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"repositories":[{"full_name":"acme/widget","clone_url":"https://github.com/acme/widget.git","default_branch":"main"}]}`))
		case r.Method == http.MethodGet && r.URL.Path == "/repos/acme/widget":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"full_name":"acme/widget","clone_url":"https://github.com/acme/widget.git","default_branch":"main"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/repos/acme/widget/branches":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{"name":"main","commit":{"sha":"abc123"}},{"name":"dev","commit":{"sha":"def456"}}]`))
		case r.Method == http.MethodGet && r.URL.Path == "/repos/acme/widget/commits":
			if strings.TrimSpace(r.URL.Query().Get("sha")) != "main" {
				http.Error(w, "unexpected sha", http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{"sha":"abc123","html_url":"https://github.com/acme/widget/commit/abc123","commit":{"message":"Initial commit\n\nBody","author":{"date":"2026-02-27T10:00:00Z"}}}]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer githubAPI.Close()

	writeGitHubInstallationSecretForServeTest(
		t,
		filepath.Join(root, "state"),
		"42",
		"9001",
		privateKeyPEM,
		githubAPI.URL,
	)

	srv := &oracleServer{
		connectorStateDir: filepath.Join(root, "state"),
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	reposResp, err := http.Post(httpSrv.URL+spikeGitHubReposPath, "application/json", bytes.NewReader([]byte(`{"installation_id":42}`)))
	if err != nil {
		t.Fatalf("post %s: %v", spikeGitHubReposPath, err)
	}
	if reposResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(reposResp.Body)
		_ = reposResp.Body.Close()
		t.Fatalf("expected %s 200, got %d body=%s", spikeGitHubReposPath, reposResp.StatusCode, strings.TrimSpace(string(body)))
	}
	var reposOut struct {
		OK    bool `json:"ok"`
		Items []struct {
			RepoID        string `json:"repo_id"`
			DefaultBranch string `json:"default_branch"`
		} `json:"items"`
	}
	if err := json.NewDecoder(reposResp.Body).Decode(&reposOut); err != nil {
		_ = reposResp.Body.Close()
		t.Fatalf("decode %s response: %v", spikeGitHubReposPath, err)
	}
	_ = reposResp.Body.Close()
	if !reposOut.OK || len(reposOut.Items) != 1 || reposOut.Items[0].RepoID != "acme/widget" {
		t.Fatalf("unexpected %s payload: %#v", spikeGitHubReposPath, reposOut)
	}

	branchesPayload := `{"installation_id":42,"repo_id":"acme/widget"}`
	branchesResp, err := http.Post(httpSrv.URL+spikeGitHubBranchesPath, "application/json", bytes.NewReader([]byte(branchesPayload)))
	if err != nil {
		t.Fatalf("post %s: %v", spikeGitHubBranchesPath, err)
	}
	if branchesResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(branchesResp.Body)
		_ = branchesResp.Body.Close()
		t.Fatalf("expected %s 200, got %d body=%s", spikeGitHubBranchesPath, branchesResp.StatusCode, strings.TrimSpace(string(body)))
	}
	var branchesOut struct {
		OK    bool `json:"ok"`
		Items []struct {
			Name      string `json:"name"`
			IsDefault bool   `json:"is_default"`
		} `json:"items"`
	}
	if err := json.NewDecoder(branchesResp.Body).Decode(&branchesOut); err != nil {
		_ = branchesResp.Body.Close()
		t.Fatalf("decode %s response: %v", spikeGitHubBranchesPath, err)
	}
	_ = branchesResp.Body.Close()
	if !branchesOut.OK || len(branchesOut.Items) < 1 {
		t.Fatalf("unexpected %s payload: %#v", spikeGitHubBranchesPath, branchesOut)
	}
	if branchesOut.Items[0].Name != "main" || !branchesOut.Items[0].IsDefault {
		t.Fatalf("unexpected default branch payload: %#v", branchesOut.Items)
	}

	commitsPayload := `{"installation_id":42,"repo_id":"acme/widget","ref":"main"}`
	commitsResp, err := http.Post(httpSrv.URL+spikeGitHubCommitsPath, "application/json", bytes.NewReader([]byte(commitsPayload)))
	if err != nil {
		t.Fatalf("post %s: %v", spikeGitHubCommitsPath, err)
	}
	if commitsResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(commitsResp.Body)
		_ = commitsResp.Body.Close()
		t.Fatalf("expected %s 200, got %d body=%s", spikeGitHubCommitsPath, commitsResp.StatusCode, strings.TrimSpace(string(body)))
	}
	var commitsOut struct {
		OK    bool `json:"ok"`
		Items []struct {
			SHA     string `json:"sha"`
			Message string `json:"message"`
		} `json:"items"`
	}
	if err := json.NewDecoder(commitsResp.Body).Decode(&commitsOut); err != nil {
		_ = commitsResp.Body.Close()
		t.Fatalf("decode %s response: %v", spikeGitHubCommitsPath, err)
	}
	_ = commitsResp.Body.Close()
	if !commitsOut.OK || len(commitsOut.Items) != 1 {
		t.Fatalf("unexpected %s payload: %#v", spikeGitHubCommitsPath, commitsOut)
	}
	if commitsOut.Items[0].SHA != "abc123" || commitsOut.Items[0].Message != "Initial commit" {
		t.Fatalf("unexpected commit payload: %#v", commitsOut.Items[0])
	}
}

func waitForSyncJob(t *testing.T, baseURL string, jobID string) control.Job {
	t.Helper()
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		getResp, err := http.Post(baseURL+"/jobs/get", "application/json", bytes.NewReader([]byte(`{"job_id":"`+jobID+`"}`)))
		if err != nil {
			t.Fatalf("post /jobs/get: %v", err)
		}
		if getResp.StatusCode != http.StatusOK {
			_ = getResp.Body.Close()
			t.Fatalf("expected /jobs/get status 200, got %d", getResp.StatusCode)
		}
		var payload struct {
			Job control.Job `json:"job"`
		}
		if err := json.NewDecoder(getResp.Body).Decode(&payload); err != nil {
			_ = getResp.Body.Close()
			t.Fatalf("decode /jobs/get response: %v", err)
		}
		_ = getResp.Body.Close()
		switch payload.Job.Status {
		case "completed", "failed":
			return payload.Job
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("job %s did not reach terminal state before deadline", jobID)
	return control.Job{}
}

func mustNewGitAdapterForTest(t *testing.T, mirrorsRoot string, worktreesRoot string) *spikegit.Adapter {
	t.Helper()
	adapter, err := spikegit.NewAdapter(spikegit.AdapterOptions{
		MirrorsRoot:   mirrorsRoot,
		WorktreesRoot: worktreesRoot,
	})
	if err != nil {
		t.Fatalf("new git adapter: %v", err)
	}
	return adapter
}

func runGitCmd(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	if strings.TrimSpace(dir) != "" {
		cmd.Dir = dir
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s failed: %v\n%s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return string(out)
}

func writeFile(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func mustGenerateRSAPrivateKeyPEMForServeTest(t *testing.T) string {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate rsa key: %v", err)
	}
	block := &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	}
	return string(pem.EncodeToMemory(block))
}

func writeGitHubConnectorSecretForServeTest(
	t *testing.T,
	stateDir string,
	account string,
	appID string,
	installationID string,
	privateKeyPEM string,
	apiBaseURL string,
) {
	t.Helper()
	account = strings.ToLower(strings.TrimSpace(account))
	if account == "" {
		account = "default"
	}
	secretDir := filepath.Join(stateDir, "credentials", "github", "accounts", account, "secrets")
	if err := os.MkdirAll(secretDir, 0o755); err != nil {
		t.Fatalf("mkdir connector secret dir: %v", err)
	}
	payload := map[string]string{
		"app_id":          strings.TrimSpace(appID),
		"installation_id": strings.TrimSpace(installationID),
		"private_key_pem": strings.TrimSpace(privateKeyPEM),
		"api_base_url":    strings.TrimSpace(apiBaseURL),
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal connector secret payload: %v", err)
	}
	secretPath := filepath.Join(secretDir, "custom.json")
	if err := os.WriteFile(secretPath, raw, 0o600); err != nil {
		t.Fatalf("write connector secret: %v", err)
	}
}

func writeGitHubInstallationSecretForServeTest(
	t *testing.T,
	stateDir string,
	installationID string,
	appID string,
	privateKeyPEM string,
	apiBaseURL string,
) {
	t.Helper()
	secretDir := filepath.Join(stateDir, "credentials", "github", "installations", installationID)
	if err := os.MkdirAll(secretDir, 0o755); err != nil {
		t.Fatalf("mkdir installation secret dir: %v", err)
	}
	payload := map[string]string{
		"app_id":          strings.TrimSpace(appID),
		"installation_id": strings.TrimSpace(installationID),
		"private_key_pem": strings.TrimSpace(privateKeyPEM),
		"api_base_url":    strings.TrimSpace(apiBaseURL),
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal installation secret payload: %v", err)
	}
	secretPath := filepath.Join(secretDir, "secret.json")
	if err := os.WriteFile(secretPath, raw, 0o600); err != nil {
		t.Fatalf("write installation secret: %v", err)
	}
}

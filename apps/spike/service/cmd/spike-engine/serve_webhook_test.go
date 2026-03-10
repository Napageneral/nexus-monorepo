package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Napageneral/spike/internal/control"
	prlmstore "github.com/Napageneral/spike/internal/prlm/store"
	prlmtree "github.com/Napageneral/spike/internal/prlm/tree"
)

func TestServeGitHubWebhookPushAndDuplicateDelivery(t *testing.T) {
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
	writeFile(t, filepath.Join(source, "hello.txt"), "hello webhook\n")
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

	srv := &oracleServer{
		trees: map[string]*servedTree{
			"oracle-test": {
				treeID:   "oracle-test",
				capacity: 120000,
				store:    store,
				oracle:   oracle,
			},
		},
		control:             controlStore,
		gitAdapter:          mustNewGitAdapterForTest(t, filepath.Join(root, "mirrors"), filepath.Join(root, "worktrees")),
		syncJobs:            make(chan syncJobTask, 16),
		authToken:           "api-token-required",
		githubWebhookSecret: "webhook-secret",
	}
	srv.startSyncWorker()
	defer srv.close()

	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	payload := map[string]any{
		"ref": "refs/heads/main",
		"repository": map[string]any{
			"full_name":      "acme/widget",
			"clone_url":      originBare,
			"default_branch": "main",
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	signature := signGitHubPayload("webhook-secret", body)

	resp := postGitHubWebhook(t, httpSrv.URL+githubAdapterWebhookPath, "push", "delivery-1", signature, body)
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("expected webhook status 202, got %d", resp.StatusCode)
	}
	var webhookResp struct {
		OK         bool `json:"ok"`
		Duplicate  bool `json:"duplicate"`
		QueuedJobs []struct {
			JobID string `json:"job_id"`
		} `json:"queued_jobs"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&webhookResp); err != nil {
		_ = resp.Body.Close()
		t.Fatalf("decode webhook response: %v", err)
	}
	_ = resp.Body.Close()
	if !webhookResp.OK || webhookResp.Duplicate || len(webhookResp.QueuedJobs) != 1 || strings.TrimSpace(webhookResp.QueuedJobs[0].JobID) == "" {
		t.Fatalf("unexpected webhook queue response: %#v", webhookResp)
	}

	deadline := time.Now().Add(8 * time.Second)
	var job *control.Job
	for time.Now().Before(deadline) {
		got, getErr := controlStore.GetJob(webhookResp.QueuedJobs[0].JobID)
		if getErr != nil {
			t.Fatalf("get queued webhook job: %v", getErr)
		}
		if got.Status == "completed" || got.Status == "failed" {
			job = got
			break
		}
		time.Sleep(25 * time.Millisecond)
	}
	if job == nil {
		t.Fatalf("webhook queued job did not reach terminal state before deadline")
	}
	if job.Status != "completed" {
		t.Fatalf("expected queued webhook sync job to complete, got %s (%s)", job.Status, job.Error)
	}

	dupResp := postGitHubWebhook(t, httpSrv.URL+githubAdapterWebhookPath, "push", "delivery-1", signature, body)
	if dupResp.StatusCode != http.StatusAccepted {
		t.Fatalf("expected duplicate webhook status 202, got %d", dupResp.StatusCode)
	}
	var dupPayload struct {
		OK        bool `json:"ok"`
		Duplicate bool `json:"duplicate"`
	}
	if err := json.NewDecoder(dupResp.Body).Decode(&dupPayload); err != nil {
		_ = dupResp.Body.Close()
		t.Fatalf("decode duplicate webhook response: %v", err)
	}
	_ = dupResp.Body.Close()
	if !dupPayload.OK || !dupPayload.Duplicate {
		t.Fatalf("expected duplicate webhook marker, got %#v", dupPayload)
	}
}

func TestServeGitHubWebhookRejectsInvalidSignature(t *testing.T) {
	srv := &oracleServer{
		trees: map[string]*servedTree{
			"oracle-test": {treeID: "oracle-test"},
		},
		control:             &control.Store{},
		githubWebhookSecret: "secret",
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	body := []byte(`{"ref":"refs/heads/main","repository":{"full_name":"acme/widget","clone_url":"https://example.com/acme/widget.git","default_branch":"main"}}`)
	resp := postGitHubWebhook(t, httpSrv.URL+githubAdapterWebhookPath+"?tree_id=oracle-test", "push", "delivery-invalid", "sha256=deadbeef", body)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected invalid signature status 401, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
}

func signGitHubPayload(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

func postGitHubWebhook(t *testing.T, url string, event string, deliveryID string, signature string, body []byte) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		t.Fatalf("new webhook request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Event", event)
	req.Header.Set("X-GitHub-Delivery", deliveryID)
	req.Header.Set("X-Hub-Signature-256", signature)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("post webhook request: %v", err)
	}
	return resp
}

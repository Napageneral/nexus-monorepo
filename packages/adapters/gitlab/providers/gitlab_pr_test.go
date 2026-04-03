package providers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	core "github.com/nexus-project/gitlab/internal/gitadapter"
)

func TestGitLabGetPullRequests_MapsHeadCommitSHA(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{
				"iid":           42,
				"title":         "Ship it",
				"description":   "desc",
				"state":         "opened",
				"created_at":    "2026-03-09T10:00:00Z",
				"updated_at":    "2026-03-09T11:00:00Z",
				"sha":           "6c71262370e3ebd290c4f2cf10cdee4531f03937",
				"source_branch": "feature",
				"target_branch": "main",
				"author":        map[string]any{"username": "alice", "name": "Alice"},
			},
		})
	}))
	defer server.Close()

	provider := &GitLabProvider{}
	prs, err := provider.GetPullRequests(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "token",
	}, core.Repository{ID: "99", FullName: "acme-org/api-server", Name: "api-server"}, time.Time{})
	if err != nil {
		t.Fatalf("GetPullRequests returned error: %v", err)
	}
	if len(prs) != 1 {
		t.Fatalf("len(prs) = %d, want 1", len(prs))
	}
	if prs[0].HeadCommitSHA != "6c71262370e3ebd290c4f2cf10cdee4531f03937" {
		t.Fatalf("HeadCommitSHA = %q", prs[0].HeadCommitSHA)
	}
}

func TestGitLabGetPullRequestSourceArchive_UsesHeadCommitSHA(t *testing.T) {
	var requestedPath string
	var requestedQuery string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestedPath = r.URL.Path
		requestedQuery = r.URL.RawQuery
		_, _ = w.Write([]byte("archive"))
	}))
	defer server.Close()

	provider := &GitLabProvider{}
	archive, err := provider.GetPullRequestSourceArchive(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "token",
	}, core.Repository{ID: "99", FullName: "acme-org/api-server", Name: "api-server"}, core.PullRequest{
		ID:            "42",
		HeadCommitSHA: "6c71262370e3ebd290c4f2cf10cdee4531f03937",
	})
	if err != nil {
		t.Fatalf("GetPullRequestSourceArchive returned error: %v", err)
	}
	if requestedPath != "/api/v4/projects/99/repository/archive.tar.gz" {
		t.Fatalf("requested path = %q", requestedPath)
	}
	if requestedQuery != "sha=6c71262370e3ebd290c4f2cf10cdee4531f03937" {
		t.Fatalf("requested query = %q", requestedQuery)
	}
	if archive == nil || archive.ArchiveFormat != "tar.gz" {
		t.Fatalf("unexpected archive: %#v", archive)
	}
}

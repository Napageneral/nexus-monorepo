package providers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	core "github.com/nexus-project/github/internal/gitadapter"
)

func TestGitHubGetPullRequests_MapsHeadCommitSHA(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{
				"number":     42,
				"title":      "Ship it",
				"body":       "desc",
				"state":      "open",
				"created_at": "2026-03-09T10:00:00Z",
				"updated_at": "2026-03-09T11:00:00Z",
				"user":       map[string]any{"login": "alice"},
				"head":       map[string]any{"ref": "feature", "sha": "6c71262370e3ebd290c4f2cf10cdee4531f03937"},
				"base":       map[string]any{"ref": "main"},
			},
		})
	}))
	defer server.Close()

	provider := &GitHubProvider{}
	prs, err := provider.GetPullRequests(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "token",
	}, core.Repository{FullName: "acme-org/api-server", Name: "api-server"}, time.Time{})
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

func TestGitHubGetOpenPullRequests_UsesOpenOnlyListing(t *testing.T) {
	var requestedState string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestedState = r.URL.Query().Get("state")
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{
				"number":     42,
				"title":      "Ship it",
				"body":       "desc",
				"state":      "open",
				"created_at": "2026-03-09T10:00:00Z",
				"updated_at": "2026-03-09T11:00:00Z",
				"user":       map[string]any{"login": "alice"},
				"head":       map[string]any{"ref": "feature", "sha": "6c71262370e3ebd290c4f2cf10cdee4531f03937"},
				"base":       map[string]any{"ref": "main"},
			},
		})
	}))
	defer server.Close()

	provider := &GitHubProvider{}
	prs, err := provider.GetOpenPullRequests(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "token",
	}, core.Repository{FullName: "acme-org/api-server", Name: "api-server"})
	if err != nil {
		t.Fatalf("GetOpenPullRequests returned error: %v", err)
	}
	if requestedState != "open" {
		t.Fatalf("state query = %q, want open", requestedState)
	}
	if len(prs) != 1 || prs[0].ID != "42" {
		t.Fatalf("prs = %#v", prs)
	}
}

func TestGitHubGetPullRequestSourceArchive_UsesHeadCommitSHA(t *testing.T) {
	var requestedPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestedPath = r.URL.Path
		_, _ = w.Write([]byte("archive"))
	}))
	defer server.Close()

	provider := &GitHubProvider{}
	archive, err := provider.GetPullRequestSourceArchive(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "token",
	}, core.Repository{FullName: "acme-org/api-server", Name: "api-server"}, core.PullRequest{
		ID:            "42",
		HeadCommitSHA: "6c71262370e3ebd290c4f2cf10cdee4531f03937",
	})
	if err != nil {
		t.Fatalf("GetPullRequestSourceArchive returned error: %v", err)
	}
	if requestedPath != "/repos/acme-org/api-server/tarball/6c71262370e3ebd290c4f2cf10cdee4531f03937" {
		t.Fatalf("requested path = %q", requestedPath)
	}
	if archive == nil || archive.ArchiveFormat != "tar.gz" {
		t.Fatalf("unexpected archive: %#v", archive)
	}
}

func TestGitHubGetPullRequestComments_IncludesIssueAndReviewComments(t *testing.T) {
	var issueCommentsRequested bool
	var reviewCommentsRequested bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/repos/acme-org/api-server/issues/42/comments":
			issueCommentsRequested = true
			if got := r.URL.Query().Get("since"); got != "2026-03-09T09:00:00Z" {
				t.Fatalf("issue comments since = %q", got)
			}
			_ = json.NewEncoder(w).Encode([]map[string]any{
				{
					"id":         99,
					"body":       "thread comment",
					"created_at": "2026-03-09T09:30:00Z",
					"updated_at": "2026-03-09T09:31:00Z",
					"user":       map[string]any{"login": "octocat"},
				},
			})
		case "/repos/acme-org/api-server/pulls/42/comments":
			reviewCommentsRequested = true
			if got := r.URL.Query().Get("since"); got != "2026-03-09T09:00:00Z" {
				t.Fatalf("review comments since = %q", got)
			}
			_ = json.NewEncoder(w).Encode([]map[string]any{
				{
					"id":         100,
					"body":       "inline note",
					"created_at": "2026-03-09T10:00:00Z",
					"updated_at": "2026-03-09T10:01:00Z",
					"path":       "src/api.ts",
					"line":       17,
					"user":       map[string]any{"login": "reviewer"},
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := &GitHubProvider{}
	comments, err := provider.GetPullRequestComments(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "token",
	}, core.Repository{FullName: "acme-org/api-server", Name: "api-server"}, "42", time.Date(2026, 3, 9, 9, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("GetPullRequestComments returned error: %v", err)
	}
	if !issueCommentsRequested || !reviewCommentsRequested {
		t.Fatalf("issue=%v review=%v, want both endpoints requested", issueCommentsRequested, reviewCommentsRequested)
	}
	if len(comments) != 2 {
		t.Fatalf("len(comments) = %d, want 2", len(comments))
	}
	if comments[0].ID != "99" || comments[0].Inline {
		t.Fatalf("first comment = %#v, want issue comment first", comments[0])
	}
	if comments[1].ID != "100" || !comments[1].Inline || comments[1].FilePath != "src/api.ts" || comments[1].Line != 17 {
		t.Fatalf("second comment = %#v, want inline review comment", comments[1])
	}
}

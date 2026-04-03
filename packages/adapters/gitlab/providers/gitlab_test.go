package providers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	core "github.com/nexus-project/gitlab/internal/gitadapter"
)

func TestGitLabListRepositories_ProjectIDMapping(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{"id": 99, "name": "api", "path_with_namespace": "team/platform/api", "http_url_to_repo": "https://gitlab.com/team/platform/api.git", "default_branch": "main"},
		})
	}))
	defer server.Close()

	provider := &GitLabProvider{}
	repos, err := provider.ListRepositories(context.Background(), core.AccountConfig{Host: server.URL, Token: "token"})
	if err != nil {
		t.Fatalf("ListRepositories returned error: %v", err)
	}
	if repos[0].ID != "99" || repos[0].FullName != "team/platform/api" {
		t.Fatalf("unexpected repo mapping: %#v", repos[0])
	}
	if repos[0].RemoteURL != "https://gitlab.com/team/platform/api.git" {
		t.Fatalf("unexpected remote url: %#v", repos[0].RemoteURL)
	}
}

func TestGitLabGetCommitDiff_ConcatenatesDiffs(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{"new_path": "a.go", "diff": "@@ -1 +1 @@\n-a\n+b"},
			{"new_path": "b.go", "diff": "@@ -2 +2 @@\n-c\n+d"},
		})
	}))
	defer server.Close()

	provider := &GitLabProvider{}
	diff, err := provider.GetCommitDiff(context.Background(), core.AccountConfig{Host: server.URL, Token: "token"}, core.Repository{ID: "99"}, "abc")
	if err != nil {
		t.Fatalf("GetCommitDiff returned error: %v", err)
	}
	text := string(diff)
	if !strings.Contains(text, "a.go") || !strings.Contains(text, "b.go") {
		t.Fatalf("diff missing concatenated paths: %q", text)
	}
}

func TestGitLabGetPullRequestComments_InlineNote(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{
				"id":         7,
				"body":       "note",
				"created_at": "2026-03-09T12:00:00Z",
				"updated_at": "2026-03-09T12:00:00Z",
				"author":     map[string]any{"username": "bob", "name": "Bob"},
				"position":   map[string]any{"new_path": "main.go", "new_line": 13},
			},
		})
	}))
	defer server.Close()

	provider := &GitLabProvider{}
	comments, err := provider.GetPullRequestComments(context.Background(), core.AccountConfig{Host: server.URL, Token: "token"}, core.Repository{ID: "99"}, "42", time.Time{})
	if err != nil {
		t.Fatalf("GetPullRequestComments returned error: %v", err)
	}
	if !comments[0].Inline || comments[0].FilePath != "main.go" || comments[0].Line != 13 {
		t.Fatalf("unexpected comment mapping: %#v", comments[0])
	}
}

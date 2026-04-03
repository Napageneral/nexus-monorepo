package providers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"

	core "github.com/nexus-project/github/internal/gitadapter"
)

func TestGitHubValidateCredentials_OK(t *testing.T) {
	var seenAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"login": "octocat",
			"email": "octocat@example.com",
		})
	}))
	defer server.Close()

	provider := &GitHubProvider{}
	err := provider.ValidateCredentials(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "ghp_test",
	})
	if err != nil {
		t.Fatalf("ValidateCredentials returned error: %v", err)
	}
	if seenAuth != "Bearer ghp_test" {
		t.Fatalf("Authorization header = %q, want Bearer token", seenAuth)
	}
	if details := provider.ValidationDetails(); details["user"] != "octocat@example.com" {
		t.Fatalf("ValidationDetails user = %#v, want email", details["user"])
	}
}

func TestGitHubValidateCredentials_Unauthorized(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusUnauthorized)
	}))
	defer server.Close()

	provider := &GitHubProvider{}
	err := provider.ValidateCredentials(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "ghp_bad",
	})
	if err == nil || !strings.Contains(err.Error(), "401") {
		t.Fatalf("ValidateCredentials error = %v, want 401 failure", err)
	}
}

func TestGitHubValidateCredentials_RateLimitUsesResetHeader(t *testing.T) {
	resetUnix := time.Now().Add(2 * time.Second).Unix()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-RateLimit-Remaining", "0")
		w.Header().Set("X-RateLimit-Reset", fmt.Sprintf("%d", resetUnix))
		http.Error(w, "API rate limit exceeded", http.StatusForbidden)
	}))
	defer server.Close()

	provider := &GitHubProvider{}
	err := provider.ValidateCredentials(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "ghp_rate_limited",
	})
	if err == nil {
		t.Fatalf("ValidateCredentials returned nil error, want rate limit failure")
	}
	var apiErr *core.APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("ValidateCredentials error = %v, want APIError", err)
	}
	if apiErr.RetryAfterMs <= 0 {
		t.Fatalf("RetryAfterMs = %d, want positive reset-derived delay", apiErr.RetryAfterMs)
	}
}

func TestGitHubValidateCredentials_FallsBackToGraphQLViewerWhenRestUserRateLimited(t *testing.T) {
	requests := make([]string, 0, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.URL.Path)
		switch r.URL.Path {
		case "/user":
			w.Header().Set("X-RateLimit-Remaining", "0")
			w.Header().Set("X-RateLimit-Reset", fmt.Sprintf("%d", time.Now().Add(2*time.Second).Unix()))
			http.Error(w, "API rate limit exceeded", http.StatusForbidden)
		case "/graphql":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":{"viewer":{"login":"Napageneral","email":""}}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := &GitHubProvider{}
	err := provider.ValidateCredentials(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "ghp_rate_limited",
	})
	if err != nil {
		t.Fatalf("ValidateCredentials returned error: %v", err)
	}
	expected := []string{"/user", "/graphql"}
	if !slices.Equal(requests, expected) {
		t.Fatalf("request sequence = %#v, want %#v", requests, expected)
	}
	if details := provider.ValidationDetails(); details["user"] != "Napageneral" {
		t.Fatalf("ValidationDetails user = %#v, want GraphQL viewer login", details["user"])
	}
}

func TestGitHubGetCurrentUser_PrefersGraphQLViewerAndFallsBackToPublicUser(t *testing.T) {
	t.Run("graphql viewer", func(t *testing.T) {
		requests := make([]string, 0, 1)
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requests = append(requests, r.URL.Path)
			switch r.URL.Path {
			case "/graphql":
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"data":{"viewer":{"login":"Napageneral","email":""}}}`))
			default:
				http.NotFound(w, r)
			}
		}))
		defer server.Close()

		provider := &GitHubProvider{}
		user, err := provider.GetCurrentUser(context.Background(), core.AccountConfig{
			Host:     server.URL,
			Token:    "ghp_test",
			Username: "Napageneral",
		})
		if err != nil {
			t.Fatalf("GetCurrentUser returned error: %v", err)
		}
		if user != "Napageneral" {
			t.Fatalf("GetCurrentUser user = %q, want Napageneral", user)
		}
		expected := []string{"/graphql"}
		if !slices.Equal(requests, expected) {
			t.Fatalf("request sequence = %#v, want %#v", requests, expected)
		}
	})

	t.Run("public user fallback", func(t *testing.T) {
		requests := make([]string, 0, 2)
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requests = append(requests, r.URL.Path)
			switch r.URL.Path {
			case "/graphql":
				http.Error(w, "boom", http.StatusForbidden)
			case "/users/Napageneral":
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"login":"Napageneral","email":""}`))
			default:
				http.NotFound(w, r)
			}
		}))
		defer server.Close()

		provider := &GitHubProvider{}
		user, err := provider.GetCurrentUser(context.Background(), core.AccountConfig{
			Host:     server.URL,
			Token:    "ghp_test",
			Username: "Napageneral",
		})
		if err != nil {
			t.Fatalf("GetCurrentUser returned error: %v", err)
		}
		if user != "Napageneral" {
			t.Fatalf("GetCurrentUser user = %q, want Napageneral", user)
		}
		expected := []string{"/graphql", "/users/Napageneral"}
		if !slices.Equal(requests, expected) {
			t.Fatalf("request sequence = %#v, want %#v", requests, expected)
		}
	})
}

func TestGitHubGetCommits_EmptyRepositoryReturnsNoCommits(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/repos/Napageneral/empty/branches":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{"name":"main"}]`))
		case "/repos/Napageneral/empty/commits":
			http.Error(w, `{"message":"Git Repository is empty.","status":"409"}`, http.StatusConflict)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := &GitHubProvider{}
	commits, err := provider.GetCommits(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "ghp_test",
	}, core.Repository{
		FullName:      "Napageneral/empty",
		Name:          "empty",
		DefaultBranch: "main",
	}, time.Time{})
	if err != nil {
		t.Fatalf("GetCommits returned error: %v", err)
	}
	if len(commits) != 0 {
		t.Fatalf("len(commits) = %d, want 0", len(commits))
	}
}

func TestGitHubGetCommits_DedupesSharedCommitAcrossBranches(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/repos/Napageneral/demo/branches":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{"name":"main"},{"name":"feature"}]`))
		case "/repos/Napageneral/demo/commits":
			w.Header().Set("Content-Type", "application/json")
			switch r.URL.Query().Get("sha") {
			case "main":
				_, _ = w.Write([]byte(`[
					{"sha":"shared","commit":{"message":"shared commit","author":{"name":"A","email":"a@example.com","date":"2026-04-01T00:00:00Z"}},"parents":[]},
					{"sha":"main-only","commit":{"message":"main commit","author":{"name":"B","email":"b@example.com","date":"2026-04-02T00:00:00Z"}},"parents":[]}
				]`))
			case "feature":
				_, _ = w.Write([]byte(`[
					{"sha":"shared","commit":{"message":"shared commit","author":{"name":"A","email":"a@example.com","date":"2026-04-01T00:00:00Z"}},"parents":[]},
					{"sha":"feature-only","commit":{"message":"feature commit","author":{"name":"C","email":"c@example.com","date":"2026-04-03T00:00:00Z"}},"parents":[]}
				]`))
			default:
				http.NotFound(w, r)
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := &GitHubProvider{}
	commits, err := provider.GetCommits(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "ghp_test",
	}, core.Repository{
		FullName:      "Napageneral/demo",
		Name:          "demo",
		DefaultBranch: "main",
	}, time.Time{})
	if err != nil {
		t.Fatalf("GetCommits returned error: %v", err)
	}
	if len(commits) != 3 {
		t.Fatalf("len(commits) = %d, want 3 unique commits", len(commits))
	}
	var shared core.Commit
	foundShared := false
	for _, commit := range commits {
		if commit.SHA == "shared" {
			shared = commit
			foundShared = true
			break
		}
	}
	if !foundShared {
		t.Fatalf("shared commit not found in %#v", commits)
	}
	expectedRefs := []string{"refs/heads/main", "refs/heads/feature"}
	if !slices.Equal(shared.Refs, expectedRefs) {
		t.Fatalf("shared refs = %#v, want %#v", shared.Refs, expectedRefs)
	}
}

func TestGitHubGetCommits_SkipsBranchListingWhenTrackedBranchesProvided(t *testing.T) {
	branchesHit := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/repos/Napageneral/demo/branches":
			branchesHit = true
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{"name":"main"},{"name":"feature"}]`))
		case "/repos/Napageneral/demo/commits":
			w.Header().Set("Content-Type", "application/json")
			if r.URL.Query().Get("sha") != "main" {
				http.NotFound(w, r)
				return
			}
			_, _ = w.Write([]byte(`[
				{"sha":"main-only","commit":{"message":"main commit","author":{"name":"B","email":"b@example.com","date":"2026-04-02T00:00:00Z"}},"parents":[]}
			]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := &GitHubProvider{}
	commits, err := provider.GetCommits(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "ghp_test",
	}, core.Repository{
		FullName:        "Napageneral/demo",
		Name:            "demo",
		DefaultBranch:   "main",
		TrackedBranches: []string{"main"},
	}, time.Time{})
	if err != nil {
		t.Fatalf("GetCommits returned error: %v", err)
	}
	if branchesHit {
		t.Fatalf("expected GetCommits to skip branch enumeration when tracked branches are provided")
	}
	if len(commits) != 1 || commits[0].SHA != "main-only" {
		t.Fatalf("unexpected commits = %#v", commits)
	}
}

func TestGitHubListRepositories(t *testing.T) {
	page2Hit := false
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/user/repos":
			if r.URL.Query().Get("page") == "2" {
				page2Hit = true
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode([]map[string]any{
					{
						"id":             2,
						"full_name":      "nexus-project/spike",
						"name":           "spike",
						"clone_url":      "https://github.com/nexus-project/spike.git",
						"default_branch": "develop",
					},
				})
				return
			}
			w.Header().Set("Link", "<"+server.URL+`/user/repos?per_page=100&page=2>; rel="next"`)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{"id":1,"full_name":"nexus-project/nex","name":"nex","clone_url":"https://github.com/nexus-project/nex.git","default_branch":"main"}]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := &GitHubProvider{}
	repos, err := provider.ListRepositories(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "ghp_test",
	})
	if err != nil {
		t.Fatalf("ListRepositories returned error: %v", err)
	}
	if !page2Hit {
		t.Fatalf("expected pagination to follow next link")
	}
	if len(repos) != 2 {
		t.Fatalf("len(repos) = %d, want 2", len(repos))
	}
	if repos[0].FullName != "nexus-project/nex" || repos[1].FullName != "nexus-project/spike" {
		t.Fatalf("unexpected repositories: %#v", repos)
	}
	if repos[0].RemoteURL != "https://github.com/nexus-project/nex.git" {
		t.Fatalf("repos[0].RemoteURL = %q, want clone url", repos[0].RemoteURL)
	}
	if repos[1].RemoteURL != "https://github.com/nexus-project/spike.git" {
		t.Fatalf("repos[1].RemoteURL = %q, want clone url", repos[1].RemoteURL)
	}
}

func TestGitHubGetPullRequests_StopsPaginationAtSinceBoundary(t *testing.T) {
	pageTwoHit := false
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/repos/nexus-project/nex/pulls":
			w.Header().Set("Content-Type", "application/json")
			if r.URL.Query().Get("page") == "2" {
				pageTwoHit = true
				_, _ = w.Write([]byte(`[]`))
				return
			}
			w.Header().Set("Link", "<"+server.URL+`/repos/nexus-project/nex/pulls?state=all&sort=updated&direction=desc&per_page=100&page=2>; rel="next"`)
			_, _ = w.Write([]byte(`[
				{"number":42,"title":"fresh","body":"","state":"open","merged_at":"","created_at":"2026-03-01T00:00:00Z","updated_at":"2026-03-02T00:00:00Z","user":{"login":"octocat"},"head":{"ref":"feature","sha":"abc"},"base":{"ref":"main"},"requested_reviewers":[]},
				{"number":41,"title":"old","body":"","state":"closed","merged_at":"","created_at":"2024-01-01T00:00:00Z","updated_at":"2024-01-02T00:00:00Z","user":{"login":"octocat"},"head":{"ref":"feature-old","sha":"def"},"base":{"ref":"main"},"requested_reviewers":[]}
			]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := &GitHubProvider{}
	prs, err := provider.GetPullRequests(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "ghp_test",
	}, core.Repository{
		FullName: "nexus-project/nex",
		Name:     "nex",
	}, time.Date(2025, time.January, 1, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("GetPullRequests returned error: %v", err)
	}
	if pageTwoHit {
		t.Fatalf("expected pagination to stop once the since boundary was crossed")
	}
	if len(prs) != 1 || prs[0].ID != "42" {
		t.Fatalf("prs = %#v, want only the fresh PR", prs)
	}
}

func TestGitHubDiscoverRepositoriesForSetup_FallsBackToUserWorkspaceListing(t *testing.T) {
	requests := make([]string, 0, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.URL.Path)
		switch r.URL.Path {
		case "/orgs/jonahe1/repos":
			http.NotFound(w, r)
		case "/users/jonahe1/repos":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{"id":1,"full_name":"jonahe1/grid","name":"grid","clone_url":"https://github.com/jonahe1/grid.git","default_branch":"main"}]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := &GitHubProvider{}
	repos, err := provider.DiscoverRepositoriesForSetup(context.Background(), core.AccountConfig{
		Host:      server.URL,
		Token:     "ghp_test",
		Workspace: "jonahe1",
	})
	if err != nil {
		t.Fatalf("DiscoverRepositoriesForSetup returned error: %v", err)
	}
	expected := []string{"/orgs/jonahe1/repos", "/users/jonahe1/repos"}
	if !slices.Equal(requests, expected) {
		t.Fatalf("request sequence = %#v, want %#v", requests, expected)
	}
	if len(repos) != 1 || repos[0].FullName != "jonahe1/grid" {
		t.Fatalf("unexpected repositories: %#v", repos)
	}
}

func TestGitHubCreateBranch_ResolvesBranchRefToSHA(t *testing.T) {
	const resolvedSHA = "1234567890abcdef1234567890abcdef12345678"
	requests := make([]string, 0, 2)
	var posted map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.Method+" "+r.URL.Path)
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/repos/nexus-project/nex/git/ref/heads/main":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"object": map[string]any{"sha": resolvedSHA},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/repos/nexus-project/nex/git/refs":
			if err := json.NewDecoder(r.Body).Decode(&posted); err != nil {
				t.Fatalf("decode posted body: %v", err)
			}
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"ref":"refs/heads/feature/test"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := &GitHubProvider{}
	err := provider.CreateBranch(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "ghp_test",
	}, core.Repository{
		FullName:      "nexus-project/nex",
		DefaultBranch: "main",
	}, "feature/test", "main")
	if err != nil {
		t.Fatalf("CreateBranch returned error: %v", err)
	}
	expected := []string{
		"GET /repos/nexus-project/nex/git/ref/heads/main",
		"POST /repos/nexus-project/nex/git/refs",
	}
	if !slices.Equal(requests, expected) {
		t.Fatalf("request sequence = %#v, want %#v", requests, expected)
	}
	if got := posted["sha"]; got != resolvedSHA {
		t.Fatalf("posted sha = %#v, want %q", got, resolvedSHA)
	}
	if got := posted["ref"]; got != "refs/heads/feature/test" {
		t.Fatalf("posted ref = %#v, want branch ref", got)
	}
}

func TestGitHubCreateBranch_UsesDefaultBranchWhenFromRefEmpty(t *testing.T) {
	const resolvedSHA = "abcdef1234567890abcdef1234567890abcdef12"
	requests := make([]string, 0, 2)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.Method+" "+r.URL.Path)
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/repos/nexus-project/nex/git/ref/heads/develop":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"object": map[string]any{"sha": resolvedSHA},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/repos/nexus-project/nex/git/refs":
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"ref":"refs/heads/feature/default"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := &GitHubProvider{}
	err := provider.CreateBranch(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "ghp_test",
	}, core.Repository{
		FullName:      "nexus-project/nex",
		DefaultBranch: "develop",
	}, "feature/default", "")
	if err != nil {
		t.Fatalf("CreateBranch returned error: %v", err)
	}
	expected := []string{
		"GET /repos/nexus-project/nex/git/ref/heads/develop",
		"POST /repos/nexus-project/nex/git/refs",
	}
	if !slices.Equal(requests, expected) {
		t.Fatalf("request sequence = %#v, want %#v", requests, expected)
	}
}

func TestGitHubGetPullRequestComments_MergesIssueAndReviewComments(t *testing.T) {
	requests := make([]string, 0, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.URL.Path)
		switch r.URL.Path {
		case "/repos/nexus-project/nex/pulls/42/comments":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{"id":2002,"body":"inline review","created_at":"2026-04-02T16:00:00Z","updated_at":"2026-04-02T16:00:00Z","path":"README.md","line":12,"user":{"login":"reviewer"}}]`))
		case "/repos/nexus-project/nex/issues/42/comments":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{"id":1001,"body":"top level note","created_at":"2026-04-02T15:59:00Z","updated_at":"2026-04-02T15:59:00Z","user":{"login":"octocat"}}]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := &GitHubProvider{}
	comments, err := provider.GetPullRequestComments(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "ghp_test",
	}, core.Repository{
		FullName: "nexus-project/nex",
		Name:     "nex",
	}, "42", time.Time{})
	if err != nil {
		t.Fatalf("GetPullRequestComments returned error: %v", err)
	}
	expectedRequests := []string{
		"/repos/nexus-project/nex/pulls/42/comments",
		"/repos/nexus-project/nex/issues/42/comments",
	}
	if !slices.Equal(requests, expectedRequests) {
		t.Fatalf("request sequence = %#v, want %#v", requests, expectedRequests)
	}
	if len(comments) != 2 {
		t.Fatalf("len(comments) = %d, want 2", len(comments))
	}
	if comments[0].ID != "1001" || comments[0].Inline {
		t.Fatalf("comments[0] = %#v, want issue comment first", comments[0])
	}
	if comments[1].ID != "2002" || !comments[1].Inline || comments[1].FilePath != "README.md" {
		t.Fatalf("comments[1] = %#v, want inline review comment second", comments[1])
	}
}

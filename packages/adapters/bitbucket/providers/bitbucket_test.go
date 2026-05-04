package providers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	core "github.com/nexus-project/bitbucket/internal/gitadapter"
)

func TestBitbucketValidateCredentials_AppPassword(t *testing.T) {
	var authHeader string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader = r.Header.Get("Authorization")
		_ = json.NewEncoder(w).Encode(map[string]any{"username": "tyler"})
	}))
	defer server.Close()

	provider := &BitbucketProvider{}
	err := provider.ValidateCredentials(context.Background(), core.AccountConfig{
		Host:     server.URL,
		Username: "tyler@example.com",
		Token:    "app-pass",
	})
	if err != nil {
		t.Fatalf("ValidateCredentials returned error: %v", err)
	}
	want := "Basic " + base64.StdEncoding.EncodeToString([]byte("tyler@example.com:app-pass"))
	if authHeader != want {
		t.Fatalf("Authorization header = %q, want %q", authHeader, want)
	}
}

func TestBitbucketValidateCredentials_WorkspaceToken(t *testing.T) {
	var authHeader string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader = r.Header.Get("Authorization")
		_ = json.NewEncoder(w).Encode(map[string]any{"username": "tyler"})
	}))
	defer server.Close()

	provider := &BitbucketProvider{}
	err := provider.ValidateCredentials(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "workspace-token",
	})
	if err != nil {
		t.Fatalf("ValidateCredentials returned error: %v", err)
	}
	if authHeader != "Bearer workspace-token" {
		t.Fatalf("Authorization header = %q, want Bearer token", authHeader)
	}
}

func TestBitbucketValidateCredentials_NormalizesBareAPIHostToV2(t *testing.T) {
	var requestPath string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestPath = r.URL.Path
		_ = json.NewEncoder(w).Encode(map[string]any{"username": "tyler"})
	}))
	defer server.Close()

	host := strings.TrimPrefix(server.URL, "https://")
	provider := &BitbucketProvider{HTTPClient: server.Client()}
	err := provider.ValidateCredentials(context.Background(), core.AccountConfig{
		Host:     host,
		Username: "tyler@example.com",
		Token:    "app-pass",
	})
	if err != nil {
		t.Fatalf("ValidateCredentials returned error: %v", err)
	}
	if requestPath != "/2.0/user" {
		t.Fatalf("request path = %q, want /2.0/user", requestPath)
	}
}

func TestBitbucketListRepositories_Paginated(t *testing.T) {
	var server *httptest.Server
	var workspaceListingQuery string
	var permissionQueries []string
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/2.0/user/workspaces":
			workspaceListingQuery = r.URL.RawQuery
			_ = json.NewEncoder(w).Encode(map[string]any{
				"values": []map[string]any{
					{
						"workspace": map[string]any{
							"slug": "vrtly-workspace",
						},
					},
				},
			})
			return
		case r.URL.Path == "/2.0/user/workspaces/vrtly-workspace/permissions/repositories" && strings.Contains(r.URL.RawQuery, "page=2"):
			permissionQueries = append(permissionQueries, r.URL.RawQuery)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"values": []map[string]any{
					{
						"repository": map[string]any{
							"full_name":  "vrtly-workspace/web",
							"name":       "web",
							"workspace":  map[string]any{"slug": "vrtly-workspace"},
							"mainbranch": map[string]any{"name": "develop"},
						},
					},
				},
			})
			return
		case r.URL.Path == "/2.0/user/workspaces/vrtly-workspace/permissions/repositories":
			permissionQueries = append(permissionQueries, r.URL.RawQuery)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"values": []map[string]any{
					{
						"repository": map[string]any{
							"full_name":  "vrtly-workspace/api",
							"name":       "api",
							"workspace":  map[string]any{"slug": "vrtly-workspace"},
							"mainbranch": map[string]any{"name": "main"},
							"links":      map[string]any{"clone": []map[string]any{{"name": "https", "href": "https://token-user:secret@bitbucket.org/vrtly-workspace/api.git"}}},
						},
					},
				},
				"next": server.URL + "/2.0/user/workspaces/vrtly-workspace/permissions/repositories?page=2",
			})
			return
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := &BitbucketProvider{}
	repos, err := provider.ListRepositories(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "token",
	})
	if err != nil {
		t.Fatalf("ListRepositories returned error: %v", err)
	}
	if len(repos) != 2 {
		t.Fatalf("len(repos) = %d, want 2", len(repos))
	}
	if !strings.Contains(workspaceListingQuery, "pagelen=100") {
		t.Fatalf("workspace listing query = %q, want pagelen=100", workspaceListingQuery)
	}
	if len(permissionQueries) == 0 {
		t.Fatalf("expected workspace-scoped repository permission queries")
	}
	if !strings.Contains(permissionQueries[0], "sort=repository.name") || !strings.Contains(permissionQueries[0], "pagelen=100") {
		t.Fatalf("permission query = %q, want sort=repository.name and pagelen=100", permissionQueries[0])
	}
	if repos[1].DefaultBranch != "develop" {
		t.Fatalf("DefaultBranch = %q, want develop", repos[1].DefaultBranch)
	}
	if repos[0].RemoteURL != "https://bitbucket.org/vrtly-workspace/api.git" {
		t.Fatalf("RemoteURL = %q, want https clone url", repos[0].RemoteURL)
	}
}

func TestBitbucketListRepositories_UsesConfiguredWorkspaceDirectly(t *testing.T) {
	var sawWorkspaceListing bool
	var requestedPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/2.0/user/workspaces":
			sawWorkspaceListing = true
			http.NotFound(w, r)
		case "/2.0/user/workspaces/nexus/permissions/repositories":
			requestedPath = r.URL.Path
			_ = json.NewEncoder(w).Encode(map[string]any{
				"values": []map[string]any{
					{
						"repository": map[string]any{
							"full_name": "nexus/core",
							"name":      "core",
						},
					},
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := &BitbucketProvider{}
	repos, err := provider.ListRepositories(context.Background(), core.AccountConfig{
		Host:      server.URL,
		Token:     "token",
		Workspace: "nexus",
	})
	if err != nil {
		t.Fatalf("ListRepositories returned error: %v", err)
	}
	if sawWorkspaceListing {
		t.Fatalf("expected configured workspace to bypass /user/workspaces")
	}
	if requestedPath != "/2.0/user/workspaces/nexus/permissions/repositories" {
		t.Fatalf("requested path = %q, want workspace permissions path", requestedPath)
	}
	if len(repos) != 1 || repos[0].FullName != "nexus/core" {
		t.Fatalf("repos = %#v, want one workspace-scoped repository", repos)
	}
}

func TestBitbucketGetPullRequests_FieldMapping(t *testing.T) {
	var rawQuery string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rawQuery = r.URL.RawQuery
		_ = json.NewEncoder(w).Encode(map[string]any{
			"values": []map[string]any{
				{
					"id":          42,
					"title":       "Ship it",
					"description": "desc",
					"state":       "MERGED",
					"created_on":  "2026-03-09T10:00:00Z",
					"updated_on":  "2026-03-09T11:00:00Z",
					"author":      map[string]any{"display_name": "Alice"},
					"source": map[string]any{
						"branch": map[string]any{"name": "feature"},
						"commit": map[string]any{"hash": "6c71262370e3ebd290c4f2cf10cdee4531f03937"},
					},
					"destination": map[string]any{"branch": map[string]any{"name": "main"}},
					"reviewers":   []map[string]any{{"display_name": "Bob"}},
				},
			},
		})
	}))
	defer server.Close()

	provider := &BitbucketProvider{}
	prs, err := provider.GetPullRequests(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "token",
	}, core.Repository{FullName: "vrtly-workspace/api", Name: "api"}, time.Date(2026, 3, 9, 10, 30, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("GetPullRequests returned error: %v", err)
	}
	if prs[0].State != "merged" {
		t.Fatalf("State = %q, want merged", prs[0].State)
	}
	if prs[0].Reviewers[0] != "Bob" {
		t.Fatalf("Reviewer = %q, want Bob", prs[0].Reviewers[0])
	}
	if prs[0].HeadCommitSHA != "6c71262370e3ebd290c4f2cf10cdee4531f03937" {
		t.Fatalf("HeadCommitSHA = %q", prs[0].HeadCommitSHA)
	}
	if !strings.Contains(rawQuery, "updated_on") || !strings.Contains(rawQuery, "pagelen=50") {
		t.Fatalf("raw query = %q, want updated_on filter and pagelen", rawQuery)
	}
}

func TestBitbucketGetPullRequests_ExpandsAbbreviatedHeadCommitSHA(t *testing.T) {
	var commitLookupPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/2.0/repositories/vrtly-workspace/api/pullrequests":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"values": []map[string]any{
					{
						"id":         113,
						"title":      "Ship stale PR",
						"state":      "OPEN",
						"created_on": "2026-03-09T10:00:00Z",
						"updated_on": "2026-03-09T11:00:00Z",
						"author":     map[string]any{"display_name": "Alice"},
						"source": map[string]any{
							"branch": map[string]any{"name": "feature/stale"},
							"commit": map[string]any{"hash": "347d1f6299d1"},
						},
						"destination": map[string]any{"branch": map[string]any{"name": "main"}},
					},
				},
			})
			return
		case "/2.0/repositories/vrtly-workspace/api/commit/347d1f6299d1":
			commitLookupPath = r.URL.Path
			_ = json.NewEncoder(w).Encode(map[string]any{
				"hash": "347d1f6299d1d6c235b75446d807a9f278acb408",
			})
			return
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := &BitbucketProvider{}
	prs, err := provider.GetPullRequests(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "token",
	}, core.Repository{FullName: "vrtly-workspace/api", Name: "api"}, time.Time{})
	if err != nil {
		t.Fatalf("GetPullRequests returned error: %v", err)
	}
	if commitLookupPath == "" {
		t.Fatalf("expected abbreviated commit hash lookup")
	}
	if prs[0].HeadCommitSHA != "347d1f6299d1d6c235b75446d807a9f278acb408" {
		t.Fatalf("HeadCommitSHA = %q", prs[0].HeadCommitSHA)
	}
}

func TestBitbucketListPullRequestsPage_DoesNotExpandAbbreviatedHeadCommitSHA(t *testing.T) {
	var commitLookupPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/2.0/repositories/vrtly-workspace/api/pullrequests":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"page":    1,
				"pagelen": 10,
				"values": []map[string]any{
					{
						"id":         113,
						"title":      "Ship stale PR",
						"state":      "OPEN",
						"created_on": "2026-03-09T10:00:00Z",
						"updated_on": "2026-03-09T11:00:00Z",
						"author":     map[string]any{"display_name": "Alice"},
						"source": map[string]any{
							"branch": map[string]any{"name": "feature/stale"},
							"commit": map[string]any{"hash": "347d1f6299d1"},
						},
						"destination": map[string]any{"branch": map[string]any{"name": "main"}},
					},
				},
			})
			return
		case "/2.0/repositories/vrtly-workspace/api/commit/347d1f6299d1":
			commitLookupPath = r.URL.Path
			http.NotFound(w, r)
			return
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := &BitbucketProvider{}
	page, err := provider.ListPullRequestsPage(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "token",
	}, core.Repository{FullName: "vrtly-workspace/api", Name: "api"}, core.PullRequestListOptions{
		States:  []string{"OPEN"},
		PageLen: 10,
		Page:    1,
	})
	if err != nil {
		t.Fatalf("ListPullRequestsPage returned error: %v", err)
	}
	if commitLookupPath != "" {
		t.Fatalf("unexpected abbreviated commit hash lookup: %s", commitLookupPath)
	}
	if len(page.PullRequests) != 1 {
		t.Fatalf("pull request count = %d", len(page.PullRequests))
	}
	if page.PullRequests[0].HeadCommitSHA != "347d1f6299d1" {
		t.Fatalf("HeadCommitSHA = %q", page.PullRequests[0].HeadCommitSHA)
	}
}

func TestBitbucketGetOpenPullRequests_UsesOpenOnlyPages(t *testing.T) {
	requestedStates := make([]string, 0)
	requestedPages := make([]string, 0)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/2.0/repositories/vrtly-workspace/api/pullrequests" {
			http.NotFound(w, r)
			return
		}
		requestedStates = append(requestedStates, r.URL.Query()["state"]...)
		requestedPages = append(requestedPages, r.URL.Query().Get("page"))
		page := r.URL.Query().Get("page")
		if page == "1" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"page":    1,
				"pagelen": 50,
				"next":    "page-2",
				"values": []map[string]any{{
					"id":         113,
					"title":      "Ship stale PR",
					"state":      "OPEN",
					"created_on": "2026-03-09T10:00:00Z",
					"updated_on": "2026-03-09T11:00:00Z",
					"author":     map[string]any{"display_name": "Alice"},
					"source": map[string]any{
						"branch": map[string]any{"name": "feature/stale"},
						"commit": map[string]any{"hash": "347d1f6299d1"},
					},
					"destination": map[string]any{"branch": map[string]any{"name": "main"}},
				}},
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"page":    2,
			"pagelen": 50,
			"values":  []map[string]any{},
		})
	}))
	defer server.Close()

	provider := &BitbucketProvider{}
	prs, err := provider.GetOpenPullRequests(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "token",
	}, core.Repository{FullName: "vrtly-workspace/api", Name: "api"})
	if err != nil {
		t.Fatalf("GetOpenPullRequests returned error: %v", err)
	}
	if strings.Join(requestedStates, ",") != "OPEN,OPEN" {
		t.Fatalf("requested states = %#v, want OPEN on each page", requestedStates)
	}
	if strings.Join(requestedPages, ",") != "1,2" {
		t.Fatalf("requested pages = %#v, want pages 1 and 2", requestedPages)
	}
	if len(prs) != 1 || prs[0].ID != "113" || prs[0].State != "open" {
		t.Fatalf("prs = %#v", prs)
	}
}

func TestBitbucketGetPullRequestSourceArchive_UsesRepositoryHost(t *testing.T) {
	var requestedPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestedPath = r.URL.Path
		_, _ = w.Write([]byte("archive"))
	}))
	defer server.Close()

	provider := &BitbucketProvider{}
	archive, err := provider.GetPullRequestSourceArchive(context.Background(), core.AccountConfig{
		Host:  server.URL + "/2.0",
		Token: "token",
	}, core.Repository{
		FullName:  "vrtly-workspace/api",
		Name:      "api",
		RemoteURL: server.URL + "/vrtly-workspace/api.git",
	}, core.PullRequest{
		ID:            "113",
		HeadCommitSHA: "347d1f6299d1d6c235b75446d807a9f278acb408",
	})
	if err != nil {
		t.Fatalf("GetPullRequestSourceArchive returned error: %v", err)
	}
	if requestedPath != "/vrtly-workspace/api/get/347d1f6299d1d6c235b75446d807a9f278acb408.zip" {
		t.Fatalf("requested path = %q", requestedPath)
	}
	if archive == nil || archive.ArchiveFormat != "zip" {
		t.Fatalf("unexpected archive: %#v", archive)
	}
}

func TestBitbucketGetPullRequestComments_InlineMapping(t *testing.T) {
	var rawQuery string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rawQuery = r.URL.RawQuery
		_ = json.NewEncoder(w).Encode(map[string]any{
			"values": []map[string]any{
				{
					"id":         8,
					"created_on": "2026-03-09T11:00:00Z",
					"updated_on": "2026-03-09T11:00:00Z",
					"content":    map[string]any{"raw": "note"},
					"user":       map[string]any{"display_name": "Bob"},
					"inline":     map[string]any{"path": "main.go", "to": 47},
				},
			},
		})
	}))
	defer server.Close()

	provider := &BitbucketProvider{}
	comments, err := provider.GetPullRequestComments(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "token",
	}, core.Repository{FullName: "vrtly-workspace/api", Name: "api"}, "42", time.Date(2026, 3, 9, 10, 30, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("GetPullRequestComments returned error: %v", err)
	}
	if !comments[0].Inline || comments[0].FilePath != "main.go" || comments[0].Line != 47 {
		t.Fatalf("unexpected comment mapping: %#v", comments[0])
	}
	if strings.Contains(rawQuery, "q=created_on") || !strings.Contains(rawQuery, "pagelen=50") || !strings.Contains(rawQuery, "sort=-created_on") {
		t.Fatalf("raw query = %q, want newest-first local filtering without created_on query", rawQuery)
	}
}

func TestBitbucketGetPullRequestComments_FiltersLocally(t *testing.T) {
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"values": []map[string]any{
				{
					"id":         9,
					"created_on": "2026-03-09T11:00:00Z",
					"updated_on": "2026-03-09T11:00:00Z",
					"content":    map[string]any{"raw": "new note"},
					"user":       map[string]any{"display_name": "Bob"},
				},
				{
					"id":         8,
					"created_on": "2026-03-09T10:00:00Z",
					"updated_on": "2026-03-09T10:00:00Z",
					"content":    map[string]any{"raw": "old note"},
					"user":       map[string]any{"display_name": "Bob"},
				},
			},
			"next": server.URL + "/should-not-be-called",
		})
	}))
	defer server.Close()

	provider := &BitbucketProvider{}
	comments, err := provider.GetPullRequestComments(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "token",
	}, core.Repository{FullName: "vrtly-workspace/api", Name: "api"}, "42", time.Date(2026, 3, 9, 10, 30, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("GetPullRequestComments returned error: %v", err)
	}
	if len(comments) != 1 || comments[0].ID != "9" {
		t.Fatalf("comments = %#v, want only locally filtered new comment", comments)
	}
}

func TestBitbucketGetCommits_UsesFilteredBranchScanWhenSinceProvided(t *testing.T) {
	var branchQuery string
	var commitQueries []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/2.0/repositories/vrtly-workspace/api/refs/branches":
			branchQuery = r.URL.RawQuery
			_ = json.NewEncoder(w).Encode(map[string]any{
				"values": []map[string]any{
					{
						"name":   "feature/live",
						"target": map[string]any{"date": "2026-03-12T16:00:00Z"},
					},
					{
						"name":   "stale/old",
						"target": map[string]any{"date": "2026-03-10T09:00:00Z"},
					},
				},
			})
		case r.URL.Path == "/2.0/repositories/vrtly-workspace/api/commits":
			commitQueries = append(commitQueries, r.URL.RawQuery)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"values": []map[string]any{
					{
						"hash":    "abc123",
						"message": "fresh",
						"date":    "2026-03-12T16:00:00Z",
						"author":  map[string]any{"raw": "Alice <alice@example.com>"},
						"parents": []map[string]any{},
					},
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := &BitbucketProvider{}
	commits, err := provider.GetCommits(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "token",
	}, core.Repository{FullName: "vrtly-workspace/api", Name: "api", DefaultBranch: "main"}, time.Date(2026, 3, 12, 15, 55, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("GetCommits returned error: %v", err)
	}
	if len(commits) != 1 {
		t.Fatalf("len(commits) = %d, want 1", len(commits))
	}
	if len(commitQueries) != 1 || !strings.Contains(commitQueries[0], "include=feature%2Flive") {
		t.Fatalf("commit queries = %v, want a single include=feature/live query", commitQueries)
	}
	if !strings.Contains(branchQuery, "sort=-target.date") {
		t.Fatalf("branch query = %q, want descending target.date sort", branchQuery)
	}
}

func TestBitbucketGetCommits_UsesDefaultBranchForFullBackfillWhenTrackedBranchesUnset(t *testing.T) {
	var branchListCalled bool
	var commitQueries []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/2.0/repositories/vrtly-workspace/api/refs/branches":
			branchListCalled = true
			http.Error(w, "branch listing should not be called", http.StatusInternalServerError)
		case r.URL.Path == "/2.0/repositories/vrtly-workspace/api/commits":
			commitQueries = append(commitQueries, r.URL.RawQuery)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"values": []map[string]any{
					{
						"hash":    "abc123",
						"message": "default branch commit",
						"date":    "2026-03-12T16:00:00Z",
						"author":  map[string]any{"raw": "Alice <alice@example.com>"},
						"parents": []map[string]any{},
					},
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := &BitbucketProvider{}
	commits, err := provider.GetCommits(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "token",
	}, core.Repository{FullName: "vrtly-workspace/api", Name: "api", DefaultBranch: "main"}, time.Time{})
	if err != nil {
		t.Fatalf("GetCommits returned error: %v", err)
	}
	if len(commits) != 1 {
		t.Fatalf("len(commits) = %d, want 1", len(commits))
	}
	if branchListCalled {
		t.Fatalf("branch listing should not be called for default-branch full backfill")
	}
	if len(commitQueries) != 1 || !strings.Contains(commitQueries[0], "include=main") {
		t.Fatalf("commit queries = %v, want a single include=main query", commitQueries)
	}
}

func TestBitbucketGetCommits_RetriesRateLimitedPageInPlace(t *testing.T) {
	var server *httptest.Server
	var pageTwoAttempts int
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/2.0/repositories/vrtly-workspace/api/refs/branches":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"values": []map[string]any{
					{
						"name": "main",
					},
				},
			})
		case r.URL.Path == "/2.0/repositories/vrtly-workspace/api/commits" && strings.Contains(r.URL.RawQuery, "page=2"):
			pageTwoAttempts++
			if pageTwoAttempts == 1 {
				w.Header().Set("Retry-After", "1")
				w.WriteHeader(http.StatusTooManyRequests)
				_, _ = w.Write([]byte("slow down"))
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"values": []map[string]any{
					{
						"hash":    "def456",
						"message": "second page",
						"date":    "2026-03-12T16:05:00Z",
						"author":  map[string]any{"raw": "Bob <bob@example.com>"},
						"parents": []map[string]any{},
					},
				},
			})
		case r.URL.Path == "/2.0/repositories/vrtly-workspace/api/commits":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"values": []map[string]any{
					{
						"hash":    "abc123",
						"message": "first page",
						"date":    "2026-03-12T16:00:00Z",
						"author":  map[string]any{"raw": "Alice <alice@example.com>"},
						"parents": []map[string]any{},
					},
				},
				"next": server.URL + "/2.0/repositories/vrtly-workspace/api/commits?page=2",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := &BitbucketProvider{}
	commits, err := provider.GetCommits(context.Background(), core.AccountConfig{
		Host:  server.URL,
		Token: "token",
	}, core.Repository{FullName: "vrtly-workspace/api", Name: "api", DefaultBranch: "main"}, time.Time{})
	if err != nil {
		t.Fatalf("GetCommits returned error: %v", err)
	}
	if len(commits) != 2 {
		t.Fatalf("len(commits) = %d, want 2", len(commits))
	}
	if pageTwoAttempts != 2 {
		t.Fatalf("page two attempts = %d, want 2", pageTwoAttempts)
	}
}

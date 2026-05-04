package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
	core "github.com/nexus-project/gitlab/internal/gitadapter"
)

type fakeProvider struct {
	id             string
	validate       func(context.Context, AccountConfig) error
	repos          []Repository
	branches       map[string][]string
	commits        map[string][]Commit
	getCommits     func(context.Context, AccountConfig, Repository, time.Time) ([]Commit, error)
	commitErr      map[string]error
	commitDiff     map[string][]byte
	prs            map[string][]PullRequest
	getPRs         func(context.Context, AccountConfig, Repository, time.Time) ([]PullRequest, error)
	openPRs        map[string][]PullRequest
	getOpenPRs     func(context.Context, AccountConfig, Repository) ([]PullRequest, error)
	prErr          map[string]error
	prDiff         map[string][]byte
	prDiffCalls    []string
	prArchive      map[string]*SourceArchive
	prArchiveCalls []string
	comments       map[string][]Comment
	getComments    func(context.Context, AccountConfig, Repository, string, time.Time) ([]Comment, error)
	commentErr     map[string]error
	commitCalls    []string
	createPR       func(context.Context, AccountConfig, Repository, CreatePRRequest) (*PullRequest, error)
	comment        func(context.Context, AccountConfig, Repository, string, string) (*Comment, error)
	merge          func(context.Context, AccountConfig, Repository, string, MergeStrategy) error
	branch         func(context.Context, AccountConfig, Repository, string, string) error
}

func (f *fakeProvider) ID() string          { return f.id }
func (f *fakeProvider) DisplayName() string { return strings.Title(f.id) }
func (f *fakeProvider) ValidateCredentials(ctx context.Context, config AccountConfig) error {
	if f.validate != nil {
		return f.validate(ctx, config)
	}
	return nil
}
func (f *fakeProvider) ListRepositories(context.Context, AccountConfig) ([]Repository, error) {
	return f.repos, nil
}

func (f *fakeProvider) ListBranches(_ context.Context, _ AccountConfig, repo Repository) ([]string, error) {
	return append([]string(nil), f.branches[repo.FullName]...), nil
}

func (f *fakeProvider) GetCommits(ctx context.Context, config AccountConfig, repo Repository, since time.Time) ([]Commit, error) {
	f.commitCalls = append(f.commitCalls, repo.FullName)
	if f.getCommits != nil {
		return f.getCommits(ctx, config, repo, since)
	}
	if err := f.commitErr[repo.FullName]; err != nil {
		return nil, err
	}
	var out []Commit
	for _, commit := range f.commits[repo.FullName] {
		if since.IsZero() || commit.Timestamp >= since.UnixMilli() {
			out = append(out, commit)
		}
	}
	return out, nil
}

func (f *fakeProvider) GetCommitDiff(_ context.Context, _ AccountConfig, _ Repository, sha string) ([]byte, error) {
	return f.commitDiff[sha], nil
}

func (f *fakeProvider) GetPullRequests(ctx context.Context, config AccountConfig, repo Repository, since time.Time) ([]PullRequest, error) {
	if f.getPRs != nil {
		return f.getPRs(ctx, config, repo, since)
	}
	if err := f.prErr[repo.FullName]; err != nil {
		return nil, err
	}
	var out []PullRequest
	for _, pr := range f.prs[repo.FullName] {
		if since.IsZero() || pr.UpdatedAt >= since.UnixMilli() {
			out = append(out, pr)
		}
	}
	return out, nil
}

func (f *fakeProvider) GetOpenPullRequests(ctx context.Context, config AccountConfig, repo Repository) ([]PullRequest, error) {
	if f.getOpenPRs != nil {
		return f.getOpenPRs(ctx, config, repo)
	}
	source := f.openPRs[repo.FullName]
	if source == nil {
		source = f.prs[repo.FullName]
	}
	out := make([]PullRequest, 0, len(source))
	for _, pr := range source {
		if pr.State == "open" {
			out = append(out, pr)
		}
	}
	return out, nil
}

func (f *fakeProvider) GetPullRequestDiff(_ context.Context, _ AccountConfig, _ Repository, prID string) ([]byte, error) {
	f.prDiffCalls = append(f.prDiffCalls, prID)
	return f.prDiff[prID], nil
}

func (f *fakeProvider) GetPullRequestSourceArchive(_ context.Context, _ AccountConfig, _ Repository, pr PullRequest) (*SourceArchive, error) {
	f.prArchiveCalls = append(f.prArchiveCalls, pr.ID)
	if f.prArchive == nil {
		return nil, nil
	}
	return f.prArchive[pr.ID], nil
}

func (f *fakeProvider) GetPullRequestComments(ctx context.Context, config AccountConfig, repo Repository, prID string, since time.Time) ([]Comment, error) {
	if f.getComments != nil {
		return f.getComments(ctx, config, repo, prID, since)
	}
	if err := f.commentErr[prID]; err != nil {
		return nil, err
	}
	var out []Comment
	for _, comment := range f.comments[prID] {
		if since.IsZero() || comment.CreatedAt >= since.UnixMilli() {
			out = append(out, comment)
		}
	}
	return out, nil
}

func (f *fakeProvider) CreatePullRequest(ctx context.Context, config AccountConfig, repo Repository, req CreatePRRequest) (*PullRequest, error) {
	if f.createPR != nil {
		return f.createPR(ctx, config, repo, req)
	}
	return &PullRequest{ID: "1", Title: req.Title, Description: req.Description, Repo: repo}, nil
}

func (f *fakeProvider) PostComment(ctx context.Context, config AccountConfig, repo Repository, prID string, body string) (*Comment, error) {
	if f.comment != nil {
		return f.comment(ctx, config, repo, prID, body)
	}
	return &Comment{ID: "2", Body: body, PRID: prID, Repo: repo}, nil
}

func (f *fakeProvider) MergePullRequest(ctx context.Context, config AccountConfig, repo Repository, prID string, strategy MergeStrategy) error {
	if f.merge != nil {
		return f.merge(ctx, config, repo, prID, strategy)
	}
	return nil
}

func (f *fakeProvider) CreateBranch(ctx context.Context, config AccountConfig, repo Repository, branchName string, fromRef string) error {
	if f.branch != nil {
		return f.branch(ctx, config, repo, branchName, fromRef)
	}
	return nil
}

func setRuntimeContext(t *testing.T, connectionID string, config map[string]any, fields map[string]string) string {
	t.Helper()
	stateDir := t.TempDir()
	contextDir := t.TempDir()
	contextPath := filepath.Join(contextDir, "runtime-context.json")
	token := fields["token"]
	if token == "" {
		token = fields["accessToken"]
	}
	payload := nexadapter.RuntimeContext{
		Version:      1,
		Platform:     "git",
		ConnectionID: connectionID,
		Config:       config,
		Credential: &nexadapter.RuntimeCredential{
			Kind:   "api_key",
			Value:  token,
			Fields: fields,
		},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal runtime context: %v", err)
	}
	if err := os.WriteFile(contextPath, append(raw, '\n'), 0o600); err != nil {
		t.Fatalf("write runtime context: %v", err)
	}
	t.Setenv("NEXUS_ADAPTER_STATE_DIR", stateDir)
	t.Setenv(nexadapter.AdapterContextEnvVar, contextPath)
	return stateDir
}

func TestWatermarkStoreCRUD(t *testing.T) {
	store, err := OpenWatermarkStore(t.TempDir())
	if err != nil {
		t.Fatalf("OpenWatermarkStore returned error: %v", err)
	}
	defer store.Close()

	if err := store.Set("acct", "repo:commits", 123, "sha1"); err != nil {
		t.Fatalf("Set returned error: %v", err)
	}
	watermark, err := store.Get("acct", "repo:commits")
	if err != nil {
		t.Fatalf("Get returned error: %v", err)
	}
	if watermark == nil || watermark.ValueInt != 123 || watermark.ValueText != "sha1" {
		t.Fatalf("unexpected watermark: %#v", watermark)
	}
	items, err := store.ListBySource("acct")
	if err != nil || len(items) != 1 {
		t.Fatalf("ListBySource = %#v, %v", items, err)
	}
	if err := store.Delete("acct", "repo:commits"); err != nil {
		t.Fatalf("Delete returned error: %v", err)
	}
	watermark, err = store.Get("acct", "repo:commits")
	if err != nil || watermark != nil {
		t.Fatalf("expected deleted watermark, got %#v, %v", watermark, err)
	}
}

func TestCommitRecord_MatchesSpecExample(t *testing.T) {
	repo := Repository{FullName: "vrtly-workspace/patient-portal", Name: "patient-portal", RemoteURL: "https://bitbucket.org/vrtly-workspace/patient-portal.git", DefaultBranch: "main"}
	event := buildCommitEvent("vrtly-bitbucket", &fakeProvider{id: "bitbucket"}, repo, Commit{
		SHA:         "abc123def",
		Message:     "fix: resolve null pointer in session handler",
		AuthorEmail: "author@example.com",
		AuthorName:  "Alice Smith",
		Timestamp:   1707235200000,
		Parents:     []string{"def456abc"},
		Refs:        []string{"refs/heads/main"},
		Repo:        repo,
	}, []byte("diff"))
	if event.Payload.ExternalRecordID != "git:bitbucket:vrtly-workspace/patient-portal:abc123def" {
		t.Fatalf("ExternalRecordID = %q", event.Payload.ExternalRecordID)
	}
	if event.Routing.Platform != "git" {
		t.Fatalf("Routing.Platform = %q", event.Routing.Platform)
	}
	if event.Payload.Metadata["forge_provider"] != "bitbucket" {
		t.Fatalf("metadata forge_provider = %#v", event.Payload.Metadata["forge_provider"])
	}
	if event.Routing.ThreadID != "refs/heads/main" || event.Routing.ThreadName != "main" {
		t.Fatalf("thread mismatch: %#v", event)
	}
	if event.Payload.Attachments[0].MIMEType != "text/x-diff" {
		t.Fatalf("attachment mime_type = %q", event.Payload.Attachments[0].MIMEType)
	}
	if event.Payload.Metadata["remote_url"] != repo.RemoteURL {
		t.Fatalf("metadata remote_url = %#v", event.Payload.Metadata["remote_url"])
	}
}

func TestPRRecord_MatchesSpecExample(t *testing.T) {
	repo := Repository{FullName: "acme-org/api-server", Name: "api-server", RemoteURL: "https://github.com/acme-org/api-server.git"}
	event := buildPullRequestEvent("acme-github", &fakeProvider{id: "github"}, repo, PullRequest{
		ID:            "42",
		Title:         "Add rate limiting to auth endpoints",
		Description:   "This PR introduces per-user rate limiting.",
		State:         "open",
		AuthorEmail:   "alice@acme.com",
		AuthorName:    "Alice Smith",
		HeadCommitSHA: "6c71262370e3ebd290c4f2cf10cdee4531f03937",
		SourceBranch:  "feature/rate-limiting",
		TargetBranch:  "main",
		Reviewers:     []string{"Bob Chen", "Carol Davies"},
		UpdatedAt:     1707321600000,
	}, []byte("diff"), &nexadapter.Attachment{
		ID:       "pr/42:source_archive",
		Filename: "pr-42.tar.gz",
		MIMEType: "application/gzip",
		Metadata: map[string]any{
			"artifact_kind": "source_archive",
		},
	})
	if event.Payload.ExternalRecordID != "git:github:acme-org/api-server:pr/42" {
		t.Fatalf("ExternalRecordID = %q", event.Payload.ExternalRecordID)
	}
	if event.Routing.Platform != "git" {
		t.Fatalf("Routing.Platform = %q", event.Routing.Platform)
	}
	if event.Payload.Metadata["forge_provider"] != "github" {
		t.Fatalf("metadata forge_provider = %#v", event.Payload.Metadata["forge_provider"])
	}
	if event.Routing.ThreadID != "pr/42" || !strings.Contains(event.Payload.Content, "PR #42: Add rate limiting") {
		t.Fatalf("unexpected PR event: %#v", event)
	}
	if event.Payload.Metadata["remote_url"] != repo.RemoteURL {
		t.Fatalf("metadata remote_url = %#v", event.Payload.Metadata["remote_url"])
	}
	if event.Payload.Metadata["head_commit_sha"] != "6c71262370e3ebd290c4f2cf10cdee4531f03937" {
		t.Fatalf("metadata head_commit_sha = %#v", event.Payload.Metadata["head_commit_sha"])
	}
	if len(event.Payload.Attachments) != 2 {
		t.Fatalf("expected diff + source archive attachments, got %d", len(event.Payload.Attachments))
	}
	if event.Payload.Attachments[1].Metadata["artifact_kind"] != "source_archive" {
		t.Fatalf("expected source archive attachment metadata, got %#v", event.Payload.Attachments[1].Metadata)
	}
}

func TestCommentRecord_MatchesSpecExample(t *testing.T) {
	repo := Repository{FullName: "acme-org/api-server", Name: "api-server", RemoteURL: "https://github.com/acme-org/api-server.git"}
	pr := PullRequest{ID: "42", Title: "Add rate limiting to auth endpoints"}
	event := buildCommentEvent("acme-github", &fakeProvider{id: "github"}, repo, pr, Comment{
		ID:          "789",
		Body:        "Looks good overall",
		AuthorEmail: "bob@acme.com",
		AuthorName:  "Bob Chen",
		CreatedAt:   1707325200000,
		Inline:      true,
		FilePath:    "src/auth/rate_limiter.go",
		Line:        47,
	})
	if event.Routing.ReplyToID != "git:github:acme-org/api-server:pr/42" {
		t.Fatalf("ReplyToID = %q", event.Routing.ReplyToID)
	}
	if event.Routing.Platform != "git" {
		t.Fatalf("Routing.Platform = %q", event.Routing.Platform)
	}
	if event.Payload.Metadata["forge_provider"] != "github" {
		t.Fatalf("metadata forge_provider = %#v", event.Payload.Metadata["forge_provider"])
	}
	if event.Payload.Metadata["file_path"] != "src/auth/rate_limiter.go" {
		t.Fatalf("metadata file_path = %#v", event.Payload.Metadata["file_path"])
	}
	if event.Payload.Metadata["remote_url"] != repo.RemoteURL {
		t.Fatalf("metadata remote_url = %#v", event.Payload.Metadata["remote_url"])
	}
}

func TestMonitor_AdvancesWatermarksAndIsIncremental(t *testing.T) {
	stateDir := t.TempDir()
	store, err := OpenWatermarkStore(stateDir)
	if err != nil {
		t.Fatalf("OpenWatermarkStore returned error: %v", err)
	}
	defer store.Close()

	repo := Repository{FullName: "team/repo", Name: "repo", DefaultBranch: "main"}
	provider := &fakeProvider{
		id: "github",
		branches: map[string][]string{
			repo.FullName: {"main"},
		},
		commits: map[string][]Commit{
			repo.FullName: {{
				SHA: "c1", Message: "first", AuthorEmail: "a@example.com", AuthorName: "A", Timestamp: 1000, Refs: []string{"refs/heads/main"}, Repo: repo,
			}},
		},
		commitDiff: map[string][]byte{"c1": []byte("diff")},
	}

	var events []nexadapter.AdapterInboundRecord
	emit := func(record any) { events = append(events, record.(nexadapter.AdapterInboundRecord)) }
	if _, err := runMonitorCycle(context.Background(), "acct", provider, AccountConfig{Repositories: []Repository{repo}}, store, emit); err != nil {
		t.Fatalf("runMonitorCycle returned error: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("len(events) = %d, want 1", len(events))
	}

	events = nil
	if _, err := runMonitorCycle(context.Background(), "acct", provider, AccountConfig{Repositories: []Repository{repo}}, store, emit); err != nil {
		t.Fatalf("second runMonitorCycle returned error: %v", err)
	}
	if len(events) != 0 {
		t.Fatalf("second cycle should emit no events, got %d", len(events))
	}
}

func TestMonitor_EmptyTrackedBranchesUsesAllProviderBranches(t *testing.T) {
	stateDir := t.TempDir()
	store, err := OpenWatermarkStore(stateDir)
	if err != nil {
		t.Fatalf("OpenWatermarkStore returned error: %v", err)
	}
	defer store.Close()

	repo := Repository{FullName: "team/repo", Name: "repo", DefaultBranch: "main", TrackedBranches: []string{}}
	provider := &fakeProvider{
		id: "bitbucket",
		branches: map[string][]string{
			repo.FullName: {"main", "feature/live"},
		},
		commits: map[string][]Commit{
			repo.FullName: {
				{SHA: "c-main", Message: "main", AuthorEmail: "a@example.com", AuthorName: "A", Timestamp: 1000, Refs: []string{"refs/heads/main"}, Repo: repo},
				{SHA: "c-feature", Message: "feature", AuthorEmail: "b@example.com", AuthorName: "B", Timestamp: 2000, Refs: []string{"refs/heads/feature/live"}, Repo: repo},
			},
		},
		commitDiff: map[string][]byte{
			"c-main":    []byte("diff-main"),
			"c-feature": []byte("diff-feature"),
		},
	}

	var events []nexadapter.AdapterInboundRecord
	emit := func(record any) { events = append(events, record.(nexadapter.AdapterInboundRecord)) }
	if _, err := runMonitorCycle(context.Background(), "acct", provider, AccountConfig{Repositories: []Repository{repo}}, store, emit); err != nil {
		t.Fatalf("runMonitorCycle returned error: %v", err)
	}

	if len(events) != 2 {
		t.Fatalf("len(events) = %d, want 2", len(events))
	}

	threadIDs := []string{events[0].Routing.ThreadID, events[1].Routing.ThreadID}
	sort.Strings(threadIDs)
	if strings.Join(threadIDs, ",") != "refs/heads/feature/live,refs/heads/main" {
		t.Fatalf("thread ids = %v, want both provider branches", threadIDs)
	}
}

func TestMonitor_CommentFallbackUsesPRWatermark(t *testing.T) {
	stateDir := t.TempDir()
	store, err := OpenWatermarkStore(stateDir)
	if err != nil {
		t.Fatalf("OpenWatermarkStore returned error: %v", err)
	}
	defer store.Close()

	repo := Repository{FullName: "team/repo", Name: "repo", DefaultBranch: "main"}
	provider := &fakeProvider{
		id: "github",
		prs: map[string][]PullRequest{
			repo.FullName: {{
				ID: "42", Title: "PR", AuthorEmail: "a@example.com", AuthorName: "A", UpdatedAt: 2_000, Repo: repo,
			}},
		},
		prDiff: map[string][]byte{"42": []byte("diff")},
		comments: map[string][]Comment{
			"42": {
				{ID: "old", Body: "old", AuthorEmail: "a@example.com", AuthorName: "A", CreatedAt: 900, PRID: "42", Repo: repo},
				{ID: "new", Body: "new", AuthorEmail: "a@example.com", AuthorName: "A", CreatedAt: 1_500, PRID: "42", Repo: repo},
			},
		},
	}
	if err := store.Set("acct", repo.FullName+":pull_requests", 1_000, ""); err != nil {
		t.Fatalf("store.Set returned error: %v", err)
	}

	var events []nexadapter.AdapterInboundRecord
	emit := func(record any) { events = append(events, record.(nexadapter.AdapterInboundRecord)) }
	if _, err := runMonitorCycle(context.Background(), "acct", provider, AccountConfig{Repositories: []Repository{repo}}, store, emit); err != nil {
		t.Fatalf("runMonitorCycle returned error: %v", err)
	}

	if len(events) != 2 {
		t.Fatalf("len(events) = %d, want 2 (pr + new comment)", len(events))
	}
	if events[1].Payload.ExternalRecordID != "git:github:team/repo:pr/42:comment/new" {
		t.Fatalf("unexpected second event id: %q", events[1].Payload.ExternalRecordID)
	}
}

func TestMonitor_EmitsCommentsForOlderOpenPRs(t *testing.T) {
	stateDir := t.TempDir()
	store, err := OpenWatermarkStore(stateDir)
	if err != nil {
		t.Fatalf("OpenWatermarkStore returned error: %v", err)
	}
	defer store.Close()

	repo := Repository{FullName: "team/repo", Name: "repo", DefaultBranch: "main"}
	provider := &fakeProvider{
		id: "bitbucket",
		prs: map[string][]PullRequest{
			repo.FullName: {{
				ID: "115", Title: "Older PR", State: "open", AuthorEmail: "a@example.com", AuthorName: "A", UpdatedAt: 1_000, Repo: repo,
			}},
		},
		comments: map[string][]Comment{
			"115": {{
				ID: "9001", Body: "fresh comment", AuthorEmail: "a@example.com", AuthorName: "A", CreatedAt: 5_000, PRID: "115", Repo: repo,
			}},
		},
	}
	if err := store.Set("acct", repo.FullName+":pull_requests", 4_000, ""); err != nil {
		t.Fatalf("store.Set returned error: %v", err)
	}

	var events []nexadapter.AdapterInboundRecord
	emit := func(record any) { events = append(events, record.(nexadapter.AdapterInboundRecord)) }
	if _, err := runMonitorCycle(context.Background(), "acct", provider, AccountConfig{Repositories: []Repository{repo}}, store, emit); err != nil {
		t.Fatalf("runMonitorCycle returned error: %v", err)
	}

	if len(events) != 1 {
		t.Fatalf("len(events) = %d, want 1", len(events))
	}
	if events[0].Payload.ExternalRecordID != "git:bitbucket:team/repo:pr/115:comment/9001" {
		t.Fatalf("unexpected event id: %q", events[0].Payload.ExternalRecordID)
	}
}

func TestMonitor_UsesOpenOnlyPRDiscoveryForCommentSync(t *testing.T) {
	stateDir := t.TempDir()
	store, err := OpenWatermarkStore(stateDir)
	if err != nil {
		t.Fatalf("OpenWatermarkStore returned error: %v", err)
	}
	defer store.Close()

	repo := Repository{FullName: "team/repo", Name: "repo", DefaultBranch: "main"}
	var prSinceCalls []time.Time
	openCalls := 0
	provider := &fakeProvider{
		id: "gitlab",
		getPRs: func(_ context.Context, _ AccountConfig, _ Repository, since time.Time) ([]PullRequest, error) {
			if since.IsZero() {
				t.Fatalf("monitor should not use zero-since all-PR scan for comment sync")
			}
			prSinceCalls = append(prSinceCalls, since)
			return nil, nil
		},
		getOpenPRs: func(_ context.Context, _ AccountConfig, _ Repository) ([]PullRequest, error) {
			openCalls++
			return []PullRequest{{
				ID: "115", Title: "Older PR", State: "open", AuthorEmail: "a@example.com", AuthorName: "A", UpdatedAt: 1_000, Repo: repo,
			}}, nil
		},
		comments: map[string][]Comment{
			"115": {{
				ID: "9001", Body: "fresh comment", AuthorEmail: "a@example.com", AuthorName: "A", CreatedAt: 5_000, PRID: "115", Repo: repo,
			}},
		},
	}
	if err := store.Set("acct", repo.FullName+":pull_requests", 4_000, ""); err != nil {
		t.Fatalf("store.Set returned error: %v", err)
	}

	var events []nexadapter.AdapterInboundRecord
	emit := func(record any) { events = append(events, record.(nexadapter.AdapterInboundRecord)) }
	if _, err := runMonitorCycle(context.Background(), "acct", provider, AccountConfig{Repositories: []Repository{repo}}, store, emit); err != nil {
		t.Fatalf("runMonitorCycle returned error: %v", err)
	}

	if openCalls != 1 {
		t.Fatalf("openCalls = %d, want 1", openCalls)
	}
	if len(prSinceCalls) != 1 || prSinceCalls[0].IsZero() {
		t.Fatalf("prSinceCalls = %#v, want one non-zero updated-since call", prSinceCalls)
	}
	if len(events) != 1 || events[0].Payload.ExternalRecordID != "git:gitlab:team/repo:pr/115:comment/9001" {
		t.Fatalf("unexpected events: %#v", events)
	}
}

func TestRunMonitorCycle_ReturnsCooldownOnRateLimit(t *testing.T) {
	stateDir := t.TempDir()
	store, err := OpenWatermarkStore(stateDir)
	if err != nil {
		t.Fatalf("OpenWatermarkStore returned error: %v", err)
	}
	defer store.Close()

	repoOne := Repository{FullName: "team/repo-one", Name: "repo-one", DefaultBranch: "main"}
	repoTwo := Repository{FullName: "team/repo-two", Name: "repo-two", DefaultBranch: "main"}
	provider := &fakeProvider{
		id:        "bitbucket",
		commitErr: map[string]error{repoOne.FullName: &core.APIError{StatusCode: 429, Status: "429 Too Many Requests", RetryAfterMs: 12_000}},
		commits: map[string][]Commit{
			repoTwo.FullName: {{
				SHA: "c2", Message: "second", AuthorEmail: "b@example.com", AuthorName: "B", Timestamp: 2_000, Refs: []string{"refs/heads/main"}, Repo: repoTwo,
			}},
		},
		commitDiff: map[string][]byte{"c2": []byte("diff")},
	}

	var events []nexadapter.AdapterInboundRecord
	result, err := runMonitorCycle(context.Background(), "acct", provider, AccountConfig{
		PollIntervalSeconds: 60,
		Repositories:        []Repository{repoOne, repoTwo},
	}, store, func(record any) {
		events = append(events, record.(nexadapter.AdapterInboundRecord))
	})
	if err != nil {
		t.Fatalf("runMonitorCycle returned error: %v", err)
	}
	if result.CooldownDuration != 12*time.Second {
		t.Fatalf("CooldownDuration = %s, want 12s", result.CooldownDuration)
	}
	if result.RateLimitedRepo != repoOne.FullName {
		t.Fatalf("RateLimitedRepo = %q, want %q", result.RateLimitedRepo, repoOne.FullName)
	}
	if got := strings.Join(provider.commitCalls, ","); got != repoOne.FullName {
		t.Fatalf("commit calls = %q, want only first repo", got)
	}
	if len(events) != 0 {
		t.Fatalf("expected no emitted events during rate-limited cycle, got %d", len(events))
	}
}

func TestRateLimitCooldownDuration_FallsBackToPollInterval(t *testing.T) {
	duration := rateLimitCooldownDuration(AccountConfig{PollIntervalSeconds: 45}, &core.APIError{StatusCode: 429})
	if duration != 45*time.Second {
		t.Fatalf("duration = %s, want 45s", duration)
	}
}

func TestRateLimitCooldownDuration_DefaultsToSixtySeconds(t *testing.T) {
	duration := rateLimitCooldownDuration(AccountConfig{}, &core.APIError{StatusCode: 429})
	if duration != 60*time.Second {
		t.Fatalf("duration = %s, want 60s", duration)
	}
}

func TestRunMonitorCycle_RateLimitDoesNotAdvanceWatermarks(t *testing.T) {
	stateDir := t.TempDir()
	store, err := OpenWatermarkStore(stateDir)
	if err != nil {
		t.Fatalf("OpenWatermarkStore returned error: %v", err)
	}
	defer store.Close()

	repo := Repository{FullName: "team/repo", Name: "repo", DefaultBranch: "main"}
	provider := &fakeProvider{
		id:        "bitbucket",
		commitErr: map[string]error{repo.FullName: &core.APIError{StatusCode: 429, Status: "429 Too Many Requests"}},
	}

	result, err := runMonitorCycle(context.Background(), "acct", provider, AccountConfig{
		PollIntervalSeconds: 30,
		Repositories:        []Repository{repo},
	}, store, func(record any) {})
	if err != nil {
		t.Fatalf("runMonitorCycle returned error: %v", err)
	}
	if result.CooldownDuration != 30*time.Second {
		t.Fatalf("CooldownDuration = %s, want 30s", result.CooldownDuration)
	}

	watermark, err := store.Get("acct", repo.FullName+":commits")
	if err != nil {
		t.Fatalf("store.Get returned error: %v", err)
	}
	if watermark != nil {
		t.Fatalf("expected no commit watermark after rate limit, got %#v", watermark)
	}
}

func TestRunMonitorCycle_NonRateLimitContinues(t *testing.T) {
	stateDir := t.TempDir()
	store, err := OpenWatermarkStore(stateDir)
	if err != nil {
		t.Fatalf("OpenWatermarkStore returned error: %v", err)
	}
	defer store.Close()

	repoOne := Repository{FullName: "team/repo-one", Name: "repo-one", DefaultBranch: "main"}
	repoTwo := Repository{FullName: "team/repo-two", Name: "repo-two", DefaultBranch: "main"}
	provider := &fakeProvider{
		id:        "bitbucket",
		commitErr: map[string]error{repoOne.FullName: &core.APIError{StatusCode: 500, Status: "500 Internal Server Error"}},
		commits: map[string][]Commit{
			repoTwo.FullName: {{
				SHA: "c2", Message: "second", AuthorEmail: "b@example.com", AuthorName: "B", Timestamp: 2_000, Refs: []string{"refs/heads/main"}, Repo: repoTwo,
			}},
		},
		commitDiff: map[string][]byte{"c2": []byte("diff")},
	}

	var events []nexadapter.AdapterInboundRecord
	result, err := runMonitorCycle(context.Background(), "acct", provider, AccountConfig{
		PollIntervalSeconds: 60,
		Repositories:        []Repository{repoOne, repoTwo},
	}, store, func(record any) {
		events = append(events, record.(nexadapter.AdapterInboundRecord))
	})
	if err != nil {
		t.Fatalf("runMonitorCycle returned error: %v", err)
	}
	if result.CooldownDuration != 0 {
		t.Fatalf("CooldownDuration = %s, want 0", result.CooldownDuration)
	}
	if got := strings.Join(provider.commitCalls, ","); got != repoOne.FullName+","+repoTwo.FullName {
		t.Fatalf("commit calls = %q, want both repos", got)
	}
	if len(events) != 1 || events[0].Payload.ExternalRecordID != "git:bitbucket:team/repo-two:c2" {
		t.Fatalf("unexpected events after non-rate-limit failure: %#v", events)
	}
}

func TestBackfill_OldDiffsSkipped(t *testing.T) {
	repo := Repository{FullName: "team/repo", Name: "repo", DefaultBranch: "main"}
	var commits []Commit
	diffMap := map[string][]byte{}
	base := time.Now().Add(-100 * 24 * time.Hour).UnixMilli()
	for i := 0; i < 600; i++ {
		sha := "sha-" + strconvI(i)
		commits = append(commits, Commit{
			SHA: sha, Message: "m", AuthorEmail: "a@example.com", AuthorName: "A",
			Timestamp: base + int64(i+1), Refs: []string{"refs/heads/main"}, Repo: repo,
		})
		diffMap[sha] = []byte("diff")
	}
	provider := &fakeProvider{id: "github", commits: map[string][]Commit{repo.FullName: commits}, commitDiff: diffMap}
	var events []nexadapter.AdapterInboundRecord
	err := runBackfill(context.Background(), "acct", provider, AccountConfig{Repositories: []Repository{repo}}, time.Now().Add(-120*24*time.Hour), func(record any) {
		events = append(events, record.(nexadapter.AdapterInboundRecord))
	})
	if err != nil {
		t.Fatalf("runBackfill returned error: %v", err)
	}
	if len(events) != 600 {
		t.Fatalf("len(events) = %d, want 600", len(events))
	}
	if value, ok := events[0].Payload.Metadata["diff_available"]; !ok || value != false {
		t.Fatalf("old commit should have diff_available=false, got %#v", events[0].Payload.Metadata)
	}
	if _, ok := events[599].Payload.Metadata["diff_available"]; ok {
		t.Fatalf("newest commit should not have diff_available=false")
	}
}

func TestBackfill_FullHistoricalBackfillCapsPullRequestArtifacts(t *testing.T) {
	t.Setenv("NEXUS_ADAPTER_STATE_DIR", t.TempDir())

	repo := Repository{FullName: "team/repo", Name: "repo", DefaultBranch: "main"}
	prs := make([]PullRequest, 0, 60)
	prDiffs := map[string][]byte{}
	prArchives := map[string]*SourceArchive{}
	for i := 0; i < 60; i++ {
		id := fmt.Sprintf("%03d", i)
		prs = append(prs, PullRequest{
			ID:            id,
			Title:         "PR " + id,
			State:         "closed",
			AuthorEmail:   "a@example.com",
			AuthorName:    "A",
			HeadCommitSHA: "sha-" + id,
			UpdatedAt:     int64(i + 1),
			Repo:          repo,
		})
		prDiffs[id] = []byte("diff")
		prArchives[id] = &SourceArchive{Filename: "pr-" + id + ".tar.gz", ArchiveFormat: "tar.gz", Data: []byte("archive")}
	}
	provider := &fakeProvider{
		id:        "gitlab",
		prs:       map[string][]PullRequest{repo.FullName: prs},
		prDiff:    prDiffs,
		prArchive: prArchives,
	}

	var events []nexadapter.AdapterInboundRecord
	err := runBackfill(context.Background(), "acct", provider, AccountConfig{Repositories: []Repository{repo}}, time.Time{}, func(record any) {
		events = append(events, record.(nexadapter.AdapterInboundRecord))
	})
	if err != nil {
		t.Fatalf("runBackfill returned error: %v", err)
	}
	if len(provider.prDiffCalls) != backfillHistoricalPRArtifactLimit {
		t.Fatalf("len(prDiffCalls) = %d, want %d", len(provider.prDiffCalls), backfillHistoricalPRArtifactLimit)
	}
	if len(provider.prArchiveCalls) != backfillHistoricalPRArtifactLimit {
		t.Fatalf("len(prArchiveCalls) = %d, want %d", len(provider.prArchiveCalls), backfillHistoricalPRArtifactLimit)
	}
	if got := events[0].Payload.Metadata["diff_available"]; got != false {
		t.Fatalf("oldest PR diff_available = %#v, want false", got)
	}
	if got := events[0].Payload.Metadata["source_archive_available"]; got != false {
		t.Fatalf("oldest PR source_archive_available = %#v, want false", got)
	}
	if _, ok := events[len(events)-1].Payload.Metadata["diff_available"]; ok {
		t.Fatalf("newest PR should not mark diff unavailable: %#v", events[len(events)-1].Payload.Metadata)
	}
	if _, ok := events[len(events)-1].Payload.Metadata["source_archive_available"]; ok {
		t.Fatalf("newest PR should not mark source archive unavailable: %#v", events[len(events)-1].Payload.Metadata)
	}
}

func TestBackfill_RetriesCommitFetchAfterRateLimit(t *testing.T) {
	repo := Repository{FullName: "team/repo", Name: "repo", DefaultBranch: "main"}
	attempts := 0
	provider := &fakeProvider{
		id: "bitbucket",
		getCommits: func(_ context.Context, _ AccountConfig, repo Repository, _ time.Time) ([]Commit, error) {
			attempts++
			if attempts == 1 {
				return nil, &core.APIError{StatusCode: 429, Status: "429 Too Many Requests", RetryAfterMs: 1}
			}
			return []Commit{{
				SHA: "c1", Message: "m", AuthorEmail: "a@example.com", AuthorName: "A",
				Timestamp: 1_000, Refs: []string{"refs/heads/main"}, Repo: repo,
			}}, nil
		},
		commitDiff: map[string][]byte{"c1": []byte("diff")},
	}

	var events []nexadapter.AdapterInboundRecord
	err := runBackfill(context.Background(), "acct", provider, AccountConfig{
		PollIntervalSeconds: 1,
		Repositories:        []Repository{repo},
	}, time.Time{}, func(record any) {
		events = append(events, record.(nexadapter.AdapterInboundRecord))
	})
	if err != nil {
		t.Fatalf("runBackfill returned error: %v", err)
	}
	if attempts != 2 {
		t.Fatalf("commit attempts = %d, want 2", attempts)
	}
	if len(events) != 1 || events[0].Payload.ExternalRecordID != "git:bitbucket:team/repo:c1" {
		t.Fatalf("unexpected events after commit retry: %#v", events)
	}
}

func TestBackfill_RetriesCommentFetchAfterRateLimit(t *testing.T) {
	repo := Repository{FullName: "team/repo", Name: "repo", DefaultBranch: "main"}
	commentAttempts := 0
	provider := &fakeProvider{
		id: "bitbucket",
		getPRs: func(_ context.Context, _ AccountConfig, repo Repository, _ time.Time) ([]PullRequest, error) {
			return []PullRequest{{
				ID: "115", Title: "Older PR", State: "open", AuthorEmail: "a@example.com", AuthorName: "A", UpdatedAt: 1_000, Repo: repo,
			}}, nil
		},
		getComments: func(_ context.Context, _ AccountConfig, repo Repository, prID string, _ time.Time) ([]Comment, error) {
			commentAttempts++
			if commentAttempts == 1 {
				return nil, &core.APIError{StatusCode: 429, Status: "429 Too Many Requests", RetryAfterMs: 1}
			}
			return []Comment{{
				ID: "9001", Body: "fresh comment", AuthorEmail: "a@example.com", AuthorName: "A", CreatedAt: 5_000, PRID: prID, Repo: repo,
			}}, nil
		},
	}

	var events []nexadapter.AdapterInboundRecord
	err := runBackfill(context.Background(), "acct", provider, AccountConfig{
		PollIntervalSeconds: 1,
		Repositories:        []Repository{repo},
	}, time.UnixMilli(4_000), func(record any) {
		events = append(events, record.(nexadapter.AdapterInboundRecord))
	})
	if err != nil {
		t.Fatalf("runBackfill returned error: %v", err)
	}
	if commentAttempts != 2 {
		t.Fatalf("comment attempts = %d, want 2", commentAttempts)
	}
	if len(events) != 2 {
		t.Fatalf("len(events) = %d, want 2 (pr + comment)", len(events))
	}
	if events[1].Payload.ExternalRecordID != "git:bitbucket:team/repo:pr/115:comment/9001" {
		t.Fatalf("unexpected comment event id: %q", events[1].Payload.ExternalRecordID)
	}
}

func TestBackfill_RateLimitWaitCanceledReturnsError(t *testing.T) {
	repo := Repository{FullName: "team/repo", Name: "repo", DefaultBranch: "main"}
	provider := &fakeProvider{
		id: "bitbucket",
		getCommits: func(_ context.Context, _ AccountConfig, _ Repository, _ time.Time) ([]Commit, error) {
			return nil, &core.APIError{StatusCode: 429, Status: "429 Too Many Requests", RetryAfterMs: 50}
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Millisecond)
	defer cancel()

	var events []nexadapter.AdapterInboundRecord
	err := runBackfill(ctx, "acct", provider, AccountConfig{
		PollIntervalSeconds: 1,
		Repositories:        []Repository{repo},
	}, time.Time{}, func(record any) {
		events = append(events, record.(nexadapter.AdapterInboundRecord))
	})
	if err == nil {
		t.Fatalf("runBackfill returned nil error, want deadline failure")
	}
	if !errors.Is(err, context.DeadlineExceeded) && !errors.Is(err, context.Canceled) {
		t.Fatalf("runBackfill error = %v, want context cancellation/deadline", err)
	}
	if len(events) != 0 {
		t.Fatalf("len(events) = %d, want 0", len(events))
	}
}

func TestBackfill_RepeatedRateLimitFailsExplicitly(t *testing.T) {
	repo := Repository{FullName: "team/repo", Name: "repo", DefaultBranch: "main"}
	attempts := 0
	provider := &fakeProvider{
		id: "bitbucket",
		getCommits: func(_ context.Context, _ AccountConfig, _ Repository, _ time.Time) ([]Commit, error) {
			attempts++
			return nil, &core.APIError{StatusCode: 429, Status: "429 Too Many Requests", RetryAfterMs: 1}
		},
	}

	var events []nexadapter.AdapterInboundRecord
	err := runBackfill(context.Background(), "acct", provider, AccountConfig{
		PollIntervalSeconds: 1,
		Repositories:        []Repository{repo},
	}, time.Time{}, func(record any) {
		events = append(events, record.(nexadapter.AdapterInboundRecord))
	})
	if err == nil {
		t.Fatalf("runBackfill returned nil error, want explicit sustained rate-limit failure")
	}
	if !strings.Contains(err.Error(), "rate limit budget exhausted") {
		t.Fatalf("runBackfill error = %v, want exhausted rate-limit message", err)
	}
	if attempts != backfillMaxConsecutiveRateLimits+1 {
		t.Fatalf("commit attempts = %d, want %d", attempts, backfillMaxConsecutiveRateLimits+1)
	}
	if len(events) != 0 {
		t.Fatalf("len(events) = %d, want 0", len(events))
	}
}

func TestBackfill_NonRateLimitCommitFetchContinues(t *testing.T) {
	repoOne := Repository{FullName: "team/repo-one", Name: "repo-one", DefaultBranch: "main"}
	repoTwo := Repository{FullName: "team/repo-two", Name: "repo-two", DefaultBranch: "main"}
	provider := &fakeProvider{
		id:        "bitbucket",
		commitErr: map[string]error{repoOne.FullName: &core.APIError{StatusCode: 500, Status: "500 Internal Server Error"}},
		commits: map[string][]Commit{
			repoTwo.FullName: {{
				SHA: "c2", Message: "second repo", AuthorEmail: "a@example.com", AuthorName: "A",
				Timestamp: 2_000, Refs: []string{"refs/heads/main"}, Repo: repoTwo,
			}},
		},
		commitDiff: map[string][]byte{"c2": []byte("diff")},
	}

	var events []nexadapter.AdapterInboundRecord
	err := runBackfill(context.Background(), "acct", provider, AccountConfig{
		PollIntervalSeconds: 1,
		Repositories:        []Repository{repoOne, repoTwo},
	}, time.Time{}, func(record any) {
		events = append(events, record.(nexadapter.AdapterInboundRecord))
	})
	if err != nil {
		t.Fatalf("runBackfill returned error: %v", err)
	}
	if got := strings.Join(provider.commitCalls, ","); got != repoOne.FullName+","+repoTwo.FullName {
		t.Fatalf("commit calls = %q, want both repos", got)
	}
	if len(events) != 1 || events[0].Payload.ExternalRecordID != "git:bitbucket:team/repo-two:c2" {
		t.Fatalf("unexpected events after non-rate-limit failure: %#v", events)
	}
}

func TestParseTargetThreadPRID_Invalid(t *testing.T) {
	if _, err := parseTargetThreadPRID("bad"); err == nil {
		t.Fatalf("expected invalid target error")
	}
}

func runGitMethodForTest(t *testing.T, methodName string, target gitMethodTarget, payload map[string]any) *gitMethodResult {
	t.Helper()

	if payload == nil {
		payload = map[string]any{}
	}
	targetPayload := map[string]any{
		"connection_id": target.ConnectionID,
		"channel": map[string]any{
			"platform":       target.Channel.Platform,
			"space_id":       target.Channel.SpaceID,
			"container_kind": target.Channel.ContainerKind,
			"container_id":   target.Channel.ContainerID,
			"thread_id":      target.Channel.ThreadID,
		},
	}
	payload["target"] = targetPayload

	result, err := executeGitMethod(context.Background(), nexadapter.AdapterMethodRequest{
		ConnectionID: target.ConnectionID,
		Payload:      payload,
	}, methodName)
	if err != nil {
		t.Fatalf("%s returned error: %v", methodName, err)
	}
	return result
}

func TestDelivery_SendAllActions(t *testing.T) {
	repo := Repository{FullName: "team/repo", Name: "repo"}
	setRuntimeContext(t, "acct", map[string]any{
		"repositories": []Repository{repo},
	}, map[string]string{
		"provider": "fake",
		"host":     "unused",
		"token":    "token",
	})
	fp := &fakeProvider{id: "fake"}
	old, had := providers["fake"]
	providers["fake"] = func() Provider { return fp }
	defer func() {
		if had {
			providers["fake"] = old
		} else {
			delete(providers, "fake")
		}
	}()

	createPR := runGitMethodForTest(t, "gitlab.pull_requests.create", gitMethodTarget{
		ConnectionID: "acct",
		Channel: nexadapter.ChannelRef{
			Platform:      "git",
			SpaceID:       "team",
			ContainerKind: "group",
			ContainerID:   "repo",
		},
	}, map[string]any{
		"title":         "Test",
		"description":   "Desc",
		"source_branch": "feature",
		"target_branch": "main",
	})
	if !createPR.Success || createPR.MessageIDs[0] != "pr/1" {
		t.Fatalf("unexpected create PR result: %#v", createPR)
	}

	comment := runGitMethodForTest(t, "gitlab.pull_requests.comments.create", gitMethodTarget{
		ConnectionID: "acct",
		Channel: nexadapter.ChannelRef{
			Platform:      "git",
			SpaceID:       "team",
			ContainerKind: "group",
			ContainerID:   "repo",
			ThreadID:      "pr/42",
		},
	}, map[string]any{
		"body": "LGTM",
	})
	if !comment.Success || comment.MessageIDs[0] != "comment/2" {
		t.Fatalf("unexpected comment result: %#v", comment)
	}

	merge := runGitMethodForTest(t, "gitlab.pull_requests.merge", gitMethodTarget{
		ConnectionID: "acct",
		Channel: nexadapter.ChannelRef{
			Platform:      "git",
			SpaceID:       "team",
			ContainerKind: "group",
			ContainerID:   "repo",
			ThreadID:      "pr/42",
		},
	}, map[string]any{})
	if !merge.Success || merge.MessageIDs[0] != "merge/pr/42" {
		t.Fatalf("unexpected merge result: %#v", merge)
	}

	branch := runGitMethodForTest(t, "gitlab.branches.create", gitMethodTarget{
		ConnectionID: "acct",
		Channel: nexadapter.ChannelRef{
			Platform:      "git",
			SpaceID:       "team",
			ContainerKind: "group",
			ContainerID:   "repo",
		},
	}, map[string]any{
		"branch_name": "feature/test",
		"from_ref":    "main",
	})
	if !branch.Success || branch.MessageIDs[0] != "refs/heads/feature/test" {
		t.Fatalf("unexpected branch result: %#v", branch)
	}
}

func TestDelivery_SendAllActionsStructuredTarget(t *testing.T) {
	repo := Repository{FullName: "team/repo", Name: "repo"}
	setRuntimeContext(t, "acct", map[string]any{
		"repositories": []Repository{repo},
	}, map[string]string{
		"provider": "fake",
		"host":     "unused",
		"token":    "token",
	})
	fp := &fakeProvider{id: "fake"}
	old, had := providers["fake"]
	providers["fake"] = func() Provider { return fp }
	defer func() {
		if had {
			providers["fake"] = old
		} else {
			delete(providers, "fake")
		}
	}()

	repoTarget := gitMethodTarget{
		ConnectionID: "acct",
		Channel: nexadapter.ChannelRef{
			Platform:      "git",
			SpaceID:       "team",
			ContainerKind: "group",
			ContainerID:   "repo",
		},
	}
	prTarget := gitMethodTarget{
		ConnectionID: "acct",
		Channel: nexadapter.ChannelRef{
			Platform:      "git",
			SpaceID:       "team",
			ContainerKind: "group",
			ContainerID:   "repo",
			ThreadID:      "pr/42",
		},
	}

	createPR := runGitMethodForTest(t, "gitlab.pull_requests.create", repoTarget, map[string]any{
		"title":         "Test",
		"description":   "Desc",
		"source_branch": "feature",
		"target_branch": "main",
	})
	if !createPR.Success || createPR.MessageIDs[0] != "pr/1" {
		t.Fatalf("unexpected create PR result: %#v", createPR)
	}

	comment := runGitMethodForTest(t, "gitlab.pull_requests.comments.create", prTarget, map[string]any{
		"body": "LGTM",
	})
	if !comment.Success || comment.MessageIDs[0] != "comment/2" {
		t.Fatalf("unexpected comment result: %#v", comment)
	}

	merge := runGitMethodForTest(t, "gitlab.pull_requests.merge", prTarget, map[string]any{})
	if !merge.Success || merge.MessageIDs[0] != "merge/pr/42" {
		t.Fatalf("unexpected merge result: %#v", merge)
	}

	branch := runGitMethodForTest(t, "gitlab.branches.create", repoTarget, map[string]any{
		"branch_name": "feature/test",
		"from_ref":    "main",
	})
	if !branch.Success || branch.MessageIDs[0] != "refs/heads/feature/test" {
		t.Fatalf("unexpected branch result: %#v", branch)
	}
}

func TestDelivery_StructuredTargetScopeValidation(t *testing.T) {
	repo := Repository{FullName: "team/repo", Name: "repo"}
	setRuntimeContext(t, "acct", map[string]any{
		"repositories": []Repository{repo},
	}, map[string]string{
		"provider": "fake",
		"host":     "unused",
		"token":    "token",
	})
	fp := &fakeProvider{id: "fake"}
	old, had := providers["fake"]
	providers["fake"] = func() Provider { return fp }
	defer func() {
		if had {
			providers["fake"] = old
		} else {
			delete(providers, "fake")
		}
	}()

	repoTarget := gitMethodTarget{
		ConnectionID: "acct",
		Channel: nexadapter.ChannelRef{
			Platform:      "git",
			SpaceID:       "team",
			ContainerKind: "group",
			ContainerID:   "repo",
		},
	}
	prTarget := gitMethodTarget{
		ConnectionID: "acct",
		Channel: nexadapter.ChannelRef{
			Platform:      "git",
			SpaceID:       "team",
			ContainerKind: "group",
			ContainerID:   "repo",
			ThreadID:      "pr/42",
		},
	}

	comment := runGitMethodForTest(t, "gitlab.pull_requests.comments.create", repoTarget, map[string]any{
		"body": "LGTM",
	})
	if comment.Success || comment.Error == nil || comment.Error.Type != "unknown" {
		t.Fatalf("expected structured repo-scope comment validation error, got %#v", comment)
	}

	branch := runGitMethodForTest(t, "gitlab.branches.create", prTarget, map[string]any{
		"branch_name": "feature/test",
	})
	if branch.Success || branch.Error == nil || branch.Error.Type != "unknown" {
		t.Fatalf("expected structured PR-scope branch validation error, got %#v", branch)
	}
}

func TestDeliveryError_401(t *testing.T) {
	err := deliveryErrorFromErr(&core.APIError{StatusCode: 401, Status: "401 Unauthorized"})
	if err.Type != "permission_denied" || err.Retry {
		t.Fatalf("unexpected delivery error: %#v", err)
	}
}

func TestHealth_Bitbucket_Connected(t *testing.T) {
	setRuntimeContext(t, "acct", map[string]any{
		"repositories": []Repository{{FullName: "w/r"}},
	}, map[string]string{
		"provider": "bitbucket",
		"host":     "unused",
		"token":    "token",
	})
	fp := &fakeProvider{id: "bitbucket"}
	old, had := providers["bitbucket"]
	providers["bitbucket"] = func() Provider { return fp }
	defer func() {
		if had {
			providers["bitbucket"] = old
		} else {
			delete(providers, "bitbucket")
		}
	}()

	health, err := newGitAdapter().Health(context.Background(), "acct")
	if err != nil {
		t.Fatalf("Health returned error: %v", err)
	}
	if !health.Connected || health.Details["provider"] != "bitbucket" {
		t.Fatalf("unexpected health: %#v", health)
	}
}

func TestBackfill_UsesRuntimeContext(t *testing.T) {
	repo := Repository{FullName: "team/repo", Name: "repo", DefaultBranch: "main"}
	setRuntimeContext(t, "acct", map[string]any{
		"repositories": []Repository{repo},
	}, map[string]string{
		"provider": "fake",
		"host":     "unused",
		"token":    "token",
	})

	fp := &fakeProvider{
		id: "fake",
		commits: map[string][]Commit{
			repo.FullName: {{
				SHA: "c1", Message: "first", AuthorEmail: "a@example.com", AuthorName: "A", Timestamp: 1000, Refs: []string{"refs/heads/main"}, Repo: repo,
			}},
		},
		commitDiff: map[string][]byte{"c1": []byte("diff")},
	}
	old, had := providers["fake"]
	providers["fake"] = func() Provider { return fp }
	defer func() {
		if had {
			providers["fake"] = old
		} else {
			delete(providers, "fake")
		}
	}()

	var events []nexadapter.AdapterInboundRecord
	if err := newGitAdapter().Backfill(context.Background(), "acct", time.Time{}, func(record any) {
		events = append(events, record.(nexadapter.AdapterInboundRecord))
	}); err != nil {
		t.Fatalf("Backfill returned error: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("len(events) = %d, want 1", len(events))
	}
}

func TestAccountsJSONStoresCredentialRefOnly(t *testing.T) {
	stateDir := t.TempDir()
	err := SaveAccounts(stateDir, &AccountsFile{Accounts: map[string]AccountConfig{
		"acct": {Provider: "github", CredentialRef: "github/octocat", Username: "octocat", Token: "secret"},
	}})
	if err != nil {
		t.Fatalf("SaveAccounts returned error: %v", err)
	}
	raw, err := os.ReadFile(filepath.Join(stateDir, accountsFilename))
	if err != nil {
		t.Fatalf("read accounts.json: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("json unmarshal: %v", err)
	}
	text := string(raw)
	if !strings.Contains(text, "credential_ref") || strings.Contains(text, "secret") || strings.Contains(text, `"username"`) {
		t.Fatalf("accounts.json contains wrong fields: %s", text)
	}
}

func TestBackfill_ChronologicalOrder(t *testing.T) {
	repo := Repository{FullName: "team/repo", Name: "repo", DefaultBranch: "main"}
	provider := &fakeProvider{
		id: "github",
		commits: map[string][]Commit{
			repo.FullName: {
				{SHA: "2", Message: "second", AuthorEmail: "a", AuthorName: "A", Timestamp: 2, Refs: []string{"refs/heads/main"}, Repo: repo},
				{SHA: "1", Message: "first", AuthorEmail: "a", AuthorName: "A", Timestamp: 1, Refs: []string{"refs/heads/main"}, Repo: repo},
			},
		},
		commitDiff: map[string][]byte{"1": []byte("d"), "2": []byte("d")},
	}
	var timestamps []int64
	err := runBackfill(context.Background(), "acct", provider, AccountConfig{Repositories: []Repository{repo}}, time.Time{}, func(record any) {
		timestamps = append(timestamps, record.(nexadapter.AdapterInboundRecord).Payload.Timestamp)
	})
	if err != nil {
		t.Fatalf("runBackfill returned error: %v", err)
	}
	if !sort.SliceIsSorted(timestamps, func(i, j int) bool { return timestamps[i] < timestamps[j] }) {
		t.Fatalf("timestamps are not sorted: %#v", timestamps)
	}
}

func TestBackfill_CommentScanSetUsesBackfillWindow(t *testing.T) {
	repo := Repository{FullName: "team/repo", Name: "repo", DefaultBranch: "main"}
	var sinceCalls []time.Time
	provider := &fakeProvider{
		id: "bitbucket",
		getPRs: func(_ context.Context, _ AccountConfig, _ Repository, since time.Time) ([]PullRequest, error) {
			sinceCalls = append(sinceCalls, since)
			if !since.IsZero() {
				return []PullRequest{{
					ID: "115", Title: "Recent PR", State: "open", AuthorEmail: "a@example.com", AuthorName: "A", UpdatedAt: 5_000, Repo: repo,
				}}, nil
			}
			return []PullRequest{{
				ID: "001", Title: "Historical PR", State: "declined", AuthorEmail: "a@example.com", AuthorName: "A", UpdatedAt: 1_000, Repo: repo,
			}}, nil
		},
		comments: map[string][]Comment{
			"115": {{
				ID: "9001", Body: "fresh comment", AuthorEmail: "a@example.com", AuthorName: "A", CreatedAt: 5_000, PRID: "115", Repo: repo,
			}},
			"001": {{
				ID: "old", Body: "should-not-scan", AuthorEmail: "a@example.com", AuthorName: "A", CreatedAt: 5_000, PRID: "001", Repo: repo,
			}},
		},
	}

	since := time.UnixMilli(4_000)
	var events []nexadapter.AdapterInboundRecord
	err := runBackfill(context.Background(), "acct", provider, AccountConfig{Repositories: []Repository{repo}}, since, func(record any) {
		events = append(events, record.(nexadapter.AdapterInboundRecord))
	})
	if err != nil {
		t.Fatalf("runBackfill returned error: %v", err)
	}
	if len(sinceCalls) != 1 {
		t.Fatalf("len(sinceCalls) = %d, want 1", len(sinceCalls))
	}
	for i, got := range sinceCalls {
		if !got.Equal(since) {
			t.Fatalf("sinceCalls[%d] = %s, want %s", i, got, since)
		}
	}
	if len(events) != 2 {
		t.Fatalf("len(events) = %d, want 2", len(events))
	}
	if events[0].Payload.ExternalRecordID != "git:bitbucket:team/repo:pr/115" {
		t.Fatalf("unexpected first event id: %q", events[0].Payload.ExternalRecordID)
	}
	if events[1].Payload.ExternalRecordID != "git:bitbucket:team/repo:pr/115:comment/9001" {
		t.Fatalf("unexpected second event id: %q", events[1].Payload.ExternalRecordID)
	}
}

func strconvI(v int) string {
	return fmt.Sprintf("%d", v)
}

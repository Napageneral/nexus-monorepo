package control

import (
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
)

func TestStoreJobLifecycle(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "control.db")
	store, err := Open(dbPath)
	if err != nil {
		t.Fatalf("open control store: %v", err)
	}
	defer store.Close()

	job, err := store.CreateJob("oracle-test", "sync", map[string]any{"hydrate": false})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	if job.ID == "" || job.Status != "queued" {
		t.Fatalf("unexpected created job: %#v", job)
	}

	if err := store.StartJob(job.ID); err != nil {
		t.Fatalf("start job: %v", err)
	}
	started, err := store.GetJob(job.ID)
	if err != nil {
		t.Fatalf("get started job: %v", err)
	}
	if started.Status != "running" || started.StartedAt.IsZero() {
		t.Fatalf("expected running job with started_at, got %#v", started)
	}

	if err := store.CompleteJob(job.ID, map[string]any{"ok": true}); err != nil {
		t.Fatalf("complete job: %v", err)
	}
	completed, err := store.GetJob(job.ID)
	if err != nil {
		t.Fatalf("get completed job: %v", err)
	}
	if completed.Status != "completed" || completed.CompletedAt.IsZero() {
		t.Fatalf("expected completed job with completed_at, got %#v", completed)
	}

	jobs, err := store.ListJobs(JobFilter{TreeID: "oracle-test", Status: "completed", Limit: 10})
	if err != nil {
		t.Fatalf("list jobs: %v", err)
	}
	if len(jobs) != 1 || jobs[0].ID != job.ID {
		t.Fatalf("unexpected listed jobs: %#v", jobs)
	}
}

func TestStoreFailJob(t *testing.T) {
	dir := t.TempDir()
	store, err := Open(filepath.Join(dir, "control.db"))
	if err != nil {
		t.Fatalf("open control store: %v", err)
	}
	defer store.Close()

	job, err := store.CreateJob("oracle-test", "sync", nil)
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	if err := store.StartJob(job.ID); err != nil {
		t.Fatalf("start job: %v", err)
	}
	if err := store.FailJob(job.ID, "sync failed"); err != nil {
		t.Fatalf("fail job: %v", err)
	}
	failed, err := store.GetJob(job.ID)
	if err != nil {
		t.Fatalf("get failed job: %v", err)
	}
	if failed.Status != "failed" || failed.Error != "sync failed" {
		t.Fatalf("unexpected failed job: %#v", failed)
	}
}

func TestStoreTreeVersionLifecycle(t *testing.T) {
	dir := t.TempDir()
	store, err := Open(filepath.Join(dir, "control.db"))
	if err != nil {
		t.Fatalf("open control store: %v", err)
	}
	defer store.Close()

	repo, err := store.UpsertRepository("repo-test", "https://github.com/acme/widget.git")
	if err != nil {
		t.Fatalf("upsert repository: %v", err)
	}
	if repo.RepoID != "repo-test" || repo.RemoteURL == "" {
		t.Fatalf("unexpected repository: %#v", repo)
	}
	ref, err := store.UpsertRepoRef("repo-test", "refs/heads/main", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
	if err != nil {
		t.Fatalf("upsert repo ref: %v", err)
	}
	if ref.RefName != "refs/heads/main" || len(ref.CommitSHA) != 40 {
		t.Fatalf("unexpected repo ref: %#v", ref)
	}

	tv, err := store.EnsureTreeVersion(TreeVersionInput{
		TreeID:    "oracle-test",
		RepoID:    "repo-test",
		RefName:   "refs/heads/main",
		CommitSHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		RootPath:  "/tmp/worktrees/repo-test/a",
		Status:    "syncing",
	})
	if err != nil {
		t.Fatalf("ensure tree version: %v", err)
	}
	if tv.ID == "" || tv.Status != "syncing" {
		t.Fatalf("unexpected tree version after ensure: %#v", tv)
	}

	if err := store.SetTreeVersionStatus(tv.ID, "hydrated", ""); err != nil {
		t.Fatalf("set tree version status: %v", err)
	}
	versions, err := store.ListTreeVersions(TreeVersionFilter{
		RepoID: "repo-test",
		Limit:  10,
	})
	if err != nil {
		t.Fatalf("list tree versions: %v", err)
	}
	if len(versions) != 1 || versions[0].ID != tv.ID || versions[0].Status != "hydrated" {
		t.Fatalf("unexpected listed tree versions: %#v", versions)
	}

	repositories, err := store.ListRepositories(RepositoryFilter{
		RepoID: "repo-test",
		Limit:  10,
	})
	if err != nil {
		t.Fatalf("list repositories: %v", err)
	}
	if len(repositories) != 1 || repositories[0].RepoID != "repo-test" {
		t.Fatalf("unexpected repositories list: %#v", repositories)
	}
	refs, err := store.ListRepoRefs(RepoRefFilter{
		RepoID:  "repo-test",
		RefName: "refs/heads/main",
		Limit:   10,
	})
	if err != nil {
		t.Fatalf("list repo refs: %v", err)
	}
	if len(refs) != 1 || refs[0].RepoID != "repo-test" || refs[0].RefName != "refs/heads/main" {
		t.Fatalf("unexpected repo refs list: %#v", refs)
	}
	gotRef, err := store.GetRepoRef("repo-test", "refs/heads/main")
	if err != nil {
		t.Fatalf("get repo ref: %v", err)
	}
	if gotRef.RepoID != "repo-test" || gotRef.RefName != "refs/heads/main" {
		t.Fatalf("unexpected repo ref get result: %#v", gotRef)
	}
	gotRepo, err := store.GetRepository("repo-test")
	if err != nil {
		t.Fatalf("get repository: %v", err)
	}
	if gotRepo.RepoID != "repo-test" {
		t.Fatalf("unexpected repository get result: %#v", gotRepo)
	}
	gotTreeVersion, err := store.GetTreeVersion(tv.ID)
	if err != nil {
		t.Fatalf("get tree version: %v", err)
	}
	if gotTreeVersion.ID != tv.ID {
		t.Fatalf("unexpected tree version get result: %#v", gotTreeVersion)
	}
	if _, err := store.GetRepository("missing-repo"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows for missing repository, got %v", err)
	}
	if _, err := store.GetRepoRef("repo-test", "refs/heads/missing"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows for missing repo ref, got %v", err)
	}
	if _, err := store.GetTreeVersion("missing-tv"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows for missing tree version, got %v", err)
	}
}

func TestStoreGitHubConnectorBindingLifecycle(t *testing.T) {
	dir := t.TempDir()
	store, err := Open(filepath.Join(dir, "control.db"))
	if err != nil {
		t.Fatalf("open control store: %v", err)
	}
	defer store.Close()

	binding, err := store.UpsertGitHubConnectorBinding(GitHubConnectorBindingInput{
		TreeID:  "oracle-test",
		Service: "github",
		Account: "installation-42",
		AuthID:  "custom",
		Metadata: map[string]any{
			"installation_id": "42",
		},
	})
	if err != nil {
		t.Fatalf("upsert github connector binding: %v", err)
	}
	if binding.TreeID != "oracle-test" || binding.Service != "github" || binding.Account != "installation-42" {
		t.Fatalf("unexpected binding row: %#v", binding)
	}
	if binding.AuthID != "custom" {
		t.Fatalf("auth_id mismatch: %#v", binding)
	}
	if binding.MetadataJSON == "" || binding.MetadataJSON == "{}" {
		t.Fatalf("expected metadata_json to persist payload, got %#v", binding)
	}

	got, err := store.GetGitHubConnectorBinding("oracle-test")
	if err != nil {
		t.Fatalf("get github connector binding: %v", err)
	}
	if got.TreeID != "oracle-test" || got.Account != "installation-42" {
		t.Fatalf("unexpected get binding row: %#v", got)
	}

	if err := store.RemoveGitHubConnectorBinding("oracle-test"); err != nil {
		t.Fatalf("remove github connector binding: %v", err)
	}
	if _, err := store.GetGitHubConnectorBinding("oracle-test"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows after remove, got %v", err)
	}
}

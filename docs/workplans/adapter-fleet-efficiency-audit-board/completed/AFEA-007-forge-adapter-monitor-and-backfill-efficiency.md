# AFEA-007 Forge Adapter Monitor And Backfill Efficiency

## Goal

Remove broad PR comment scans and over-eager historical artifact fetching from
the forge adapters.

## Completed Scope

- `github`, `gitlab`, and `bitbucket` monitor comment discovery now uses an
  open-only provider path instead of `GetPullRequests(..., time.Time{})`.
- Changed PRs from the updated-since monitor lane are still included in comment
  sync, so freshly closed or merged PRs keep fidelity for their current-cycle
  comments.
- GitHub and GitLab providers now expose open-only PR discovery:
  - GitHub requests `state=open`.
  - GitLab requests `state=opened` and normalizes provider state to `open`.
- Bitbucket uses the existing paged PR list shape with `state=OPEN`.
- GitLab updated-since PR listing now sends `updated_after` and stops descending
  pagination as soon as a page crosses the requested watermark.
- Full historical and older-than-90-day backfills cap commit diffs and PR
  diff/source-archive artifacts to the newest 50 records per repository.
- GitLab and Bitbucket backfills reuse the first PR list for comment scans
  instead of issuing a second PR list request.
- Backfill upper bounds from `BackfillWindow.To` are preserved in the existing
  dirty adapter SDK integration and now skip comment provider calls for PRs
  newer than the upper bound before fetching comments.

## Request-Count Proof

Focused unit tests now assert the provider request shape directly:

- Monitor no-change/open-comment cycle:
  - one updated-since PR list call with a non-zero watermark
  - one open-only PR discovery call
  - zero zero-since all-PR scan calls
  - comments still fetched for older open PRs
- Full historical PR artifact backfill with 60 PRs:
  - 50 PR diff calls
  - 50 PR source-archive calls
  - oldest skipped PR events carry `diff_available=false` and
    `source_archive_available=false`
  - newest eligible PR events keep diff/source archive attachments available
- GitLab and Bitbucket comment scan set reuse:
  - one PR list call for PR events plus comment scanning
  - no second `pull_request_comment_scan_set` PR list call
- Provider-level request shape:
  - GitHub open discovery uses `state=open`
  - GitLab open discovery uses `state=opened`
  - GitLab updated-since listing includes `updated_after` and does not request
    page 2 after crossing the since boundary
  - Bitbucket open discovery pages with `state=OPEN`

## Validation

Commands run from the package directories:

```bash
go test ./...
```

Results:

- `github.com/nexus-project/github`: pass
- `github.com/nexus-project/github/providers`: pass
- `github.com/nexus-project/gitlab`: pass
- `github.com/nexus-project/gitlab/providers`: pass
- `github.com/nexus-project/bitbucket`: pass
- `github.com/nexus-project/bitbucket/providers`: pass

Package validation:

```bash
nexus package validate /Users/tyler/nexus/home/projects/nexus/packages/adapters/github
nexus package validate /Users/tyler/nexus/home/projects/nexus/packages/adapters/gitlab
nexus package validate /Users/tyler/nexus/home/projects/nexus/packages/adapters/bitbucket
```

Results:

- `github@1.0.12`: `ok=true`, no errors, no warnings
- `gitlab@1.0.12`: `ok=true`, no errors, no warnings
- `bitbucket@1.0.12`: `ok=true`, no errors, no warnings

Package release artifacts:

```bash
nexus package release /Users/tyler/nexus/home/projects/nexus/packages/adapters/github
nexus package release /Users/tyler/nexus/home/projects/nexus/packages/adapters/gitlab
nexus package release /Users/tyler/nexus/home/projects/nexus/packages/adapters/bitbucket
```

- `github/dist/github-1.0.12.tar.gz`
  - sha256 `ff29b771007b8d3b232502170f291c7a68899fbee7da13090323716fec86d949`
- `gitlab/dist/gitlab-1.0.12.tar.gz`
  - sha256 `32fa40261b657816ad27e8b7c283a42fe1efeab474c2344316d49f40c95dd769`
- `bitbucket/dist/bitbucket-1.0.12.tar.gz`
  - sha256 `3d272f2475c5d8dbb98eb7c9da71905991e6487d0899f336aea0f9b032476c92`

The generated tarballs were checked to confirm ignored local `state/` files are
not included.

## Acceptance

1. No-change monitor cycles no longer page old closed PRs.
2. Historical artifact fetches are capped to the newest 50 PRs/commits per
   repository for full historical and older-than-90-day windows.
3. GitHub, GitLab, and Bitbucket have comparable monitor and backfill tests.
4. Request counts are encoded in package tests and summarized above.

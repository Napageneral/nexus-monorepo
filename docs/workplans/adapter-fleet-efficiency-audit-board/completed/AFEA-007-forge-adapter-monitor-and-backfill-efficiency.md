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

Hosted Linux arm64 variants were built from the validated `1.0.12` package
archives and published to production Frontdoor on May 4, 2026:

- `github@1.0.12`
  - `release_id = rel-github-1.0.12`
  - `variant_id = variant-github-1.0.12-linux-arm64`
  - sha256 `54ce998020224cc9d25b72f3935293d59dd2846c618136bef7dbe56a43599460`
- `gitlab@1.0.12`
  - `release_id = rel-gitlab-1.0.12`
  - `variant_id = variant-gitlab-1.0.12-linux-arm64`
  - sha256 `0e974d915d628e18fbe25f224b31762d01dda4b4cea98c1ffe111f1cdcfacab0`
- `bitbucket@1.0.12`
  - `release_id = rel-bitbucket-1.0.12`
  - `variant_id = variant-bitbucket-1.0.12-linux-arm64`
  - sha256 `1fb199ee241a8370ca975a25d0a5318595eb49cb5d5942e1310169c873e470a4`

Hosted Devenir install/restart proof:

- Frontdoor server `srv-57f32449-320`, tenant `t-673f3131-f16`
- all three adapters were installed through the public Frontdoor adapter
  lifecycle path and report `active_version = 1.0.12`
- `nex-runtime.service` was restarted; runtime PID changed from `640641` to
  `642362`, and later from `642628` to `643704` during the Zenoti restart proof
- post-restart `adapter.info` reflected:
  - `github@1.0.12`, `18` methods
  - `gitlab@1.0.12`, `4` methods
  - `bitbucket@1.0.12`, `14` methods
- the hosted tenant currently has no configured GitHub/GitLab/Bitbucket
  connections, so this proof covers package publication, installation,
  restart-safe reflection, and disconnected setup surfaces rather than provider
  read/backfill execution
- proof bundle:
  `/Users/tyler/nexus/state/artifacts/validation/hosted-forge-package-pass/20260504T184601Z`

## Acceptance

1. No-change monitor cycles no longer page old closed PRs.
2. Historical artifact fetches are capped to the newest 50 PRs/commits per
   repository for full historical and older-than-90-day windows.
3. GitHub, GitLab, and Bitbucket have comparable monitor and backfill tests.
4. Request counts are encoded in package tests and summarized above.

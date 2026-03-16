# Package Production Frontdoor Publish Drill

## Customer Experience

The operator-facing production publish experience must be:

1. local package release artifacts are already reproducible
2. the operator can target the canonical Frontdoor production host directly
3. package metadata and tarballs are staged onto the production host in one predictable layout
4. the canonical Frontdoor publish scripts mutate the live registry
5. live registry rows are verified immediately after publish

The operator must not need to:

1. invent a second publish path
2. mutate the live registry by hand with ad hoc SQLite commands
3. guess which SSH identity or host key is correct

## Production Target

Canonical production target:

1. host: `frontdoor-1`
2. public host: `frontdoor.nexushub.sh`
3. public IP: `178.104.21.207`
4. live registry DB: `/var/lib/nexus-frontdoor/frontdoor.db`
5. staging root: `/opt/nexus/frontdoor/packages`

## Hard Rules

1. No backwards compatibility path.
2. Use the canonical Frontdoor publish scripts already in the repo.
3. Use the live production registry DB only after SSH trust is verified.
4. Only fix real failures exposed by the drill.
5. Verify live registry rows after publish.

## SSH Trust And Auth

Before any production mutation:

1. remove the stale `frontdoor.nexushub.sh` known-host entry
2. add the current verified hostname keys for the production host
3. add an SSH config stanza for `frontdoor.nexushub.sh`:
   - `User root`
   - `IdentityFile ~/.ssh/nexus-operator`
   - `IdentitiesOnly yes`

The verified current host fingerprints are:

1. ED25519: `SHA256:nfrb/BV+GSxbuKvAk9uPiivjreAE+6DIGR/565RtWQk`
2. RSA: `SHA256:rU5JGi9DSFzk6vPUNgnnnxXT+7CNS7rtiYvMNzkOCAE`
3. ECDSA: `SHA256:RZgIr5/zj6D0uiIc7Ow+m63fU3Pn6ajaFDWXY5N1NHI`

## Remote Staging Layout

For each package release:

1. create `/opt/nexus/frontdoor/packages/<package-id>/<version>/`
2. stage the package manifest root there
3. stage the tarball there

The remote package root passed to Frontdoor publish must contain:

1. `app.nexus.json` or `adapter.nexus.json`
2. any manifest-relative assets needed by app product sync
3. the tarball path referenced by the publish command

## Canonical Remote Publish

For apps:

1. run Frontdoor's app publish script on `frontdoor-1`
2. target `/var/lib/nexus-frontdoor/frontdoor.db`
3. pass the staged remote package root
4. pass the staged tarball path
5. pass `--target-os linux --target-arch arm64`

For adapters:

1. run Frontdoor's adapter publish script on `frontdoor-1`
2. target `/var/lib/nexus-frontdoor/frontdoor.db`
3. pass the staged remote package root
4. pass the staged tarball path
5. pass `--target-os linux --target-arch arm64`

## Verification

For each published package:

1. verify one `frontdoor_packages` row exists
2. verify one `frontdoor_package_releases` row exists for the version
3. verify one `frontdoor_release_variants` row exists for `linux/arm64`
4. for apps, verify product sync output is sane

## Failure Classification

Allowed failure classes:

1. SSH trust/config failure
2. remote staging failure
3. remote publish script failure
4. manifest or product-sync failure
5. live registry row mismatch

## Deliverables

This drill produces:

1. fixed local SSH trust/config for `frontdoor.nexushub.sh`
2. a repeatable production publish command path
3. live registry verification evidence for the packages published

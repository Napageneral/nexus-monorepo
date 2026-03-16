#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
PACKAGES_DIR = SCRIPT_DIR.parent
REPO_ROOT = PACKAGES_DIR.parent


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run(cmd: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        env=env,
        text=True,
        capture_output=True,
    )


def copy_if_exists(src_root: Path, rel: str | None, dest_root: Path) -> None:
    if not rel:
        return
    rel_path = rel.strip()
    if not rel_path:
        return
    src = (src_root / rel_path).resolve()
    if not src.exists() or not src.is_file():
        return
    dest = dest_root / rel_path
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)


def build_minimal_stage(package_root: Path, kind: str, package_id: str, version: str, stage_base: Path) -> Path:
    stage_root = stage_base / package_id / version / "package-root"
    if stage_root.exists():
        shutil.rmtree(stage_root)
    stage_root.mkdir(parents=True, exist_ok=True)

    manifest_name = "app.nexus.json" if kind == "app" else "adapter.nexus.json"
    manifest_src = package_root / manifest_name
    manifest_dst = stage_root / manifest_name
    shutil.copy2(manifest_src, manifest_dst)

    if kind == "app":
      manifest = json.loads(manifest_src.read_text(encoding="utf-8"))
      copy_if_exists(package_root, manifest.get("icon"), stage_root)
      product = manifest.get("product") or {}
      if isinstance(product, dict):
          copy_if_exists(package_root, product.get("logoSvg"), stage_root)
          copy_if_exists(package_root, product.get("icon"), stage_root)

    return stage_root


def parse_json_objects(raw: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    decoder = json.JSONDecoder()
    index = 0
    while index < len(raw):
        start = raw.find("{", index)
        if start == -1:
            break
        try:
            value, end = decoder.raw_decode(raw[start:])
        except json.JSONDecodeError:
            index = start + 1
            continue
        if isinstance(value, dict):
            out.append(value)
        index = start + end
    return out


def remote_publish(
    host: str,
    remote_frontdoor_root: str,
    remote_db: str,
    remote_package_root: str,
    remote_tarball_path: str,
    target_os: str,
    target_arch: str,
    kind: str,
) -> subprocess.CompletedProcess[str]:
    fn_name = "publishAppRelease" if kind == "app" else "publishAdapterRelease"
    fn_module = "./dist/publish-app-release.js" if kind == "app" else "./dist/publish-adapter-release.js"
    script = f"""
import {{ DatabaseSync }} from "node:sqlite";
import {{ FrontdoorStore }} from "./dist/frontdoor-store.js";
import {{ {fn_name} }} from "{fn_module}";

const store = new FrontdoorStore(process.env.FRONTDOOR_DB);
try {{
  const result = await {fn_name}({{
    store,
    packageRoot: process.env.PACKAGE_ROOT,
    tarballPath: process.env.TARBALL_PATH,
    targetOs: process.env.TARGET_OS,
    targetArch: process.env.TARGET_ARCH,
    channel: "stable",
  }});
  const db = new DatabaseSync(process.env.FRONTDOOR_DB);
  const packageCount = db.prepare(
    "SELECT COUNT(*) AS count FROM frontdoor_packages WHERE package_id = ?"
  ).get(result.package_id).count;
  const releaseCount = db.prepare(
    "SELECT COUNT(*) AS count FROM frontdoor_package_releases WHERE package_id = ? AND version = ?"
  ).get(result.package_id, result.version).count;
  const variantCount = db.prepare(
    `SELECT COUNT(*) AS count
       FROM frontdoor_release_variants rv
       JOIN frontdoor_package_releases pr ON pr.release_id = rv.release_id
      WHERE pr.package_id = ? AND pr.version = ? AND rv.target_os = ? AND rv.target_arch = ?`
  ).get(result.package_id, result.version, process.env.TARGET_OS, process.env.TARGET_ARCH).count;
  db.close();
  const verification = {{
    package_count: packageCount,
    release_count: releaseCount,
    variant_count: variantCount,
  }};
  process.stdout.write(JSON.stringify({{ ok: true, ...result, verification }}, null, 2) + "\\n");
}} finally {{
  store.close();
}}
"""
    remote_cmd = (
        f"cd {remote_frontdoor_root} && "
        f"FRONTDOOR_DB={json.dumps(remote_db)} "
        f"PACKAGE_ROOT={json.dumps(remote_package_root)} "
        f"TARBALL_PATH={json.dumps(remote_tarball_path)} "
        f"TARGET_OS={json.dumps(target_os)} "
        f"TARGET_ARCH={json.dumps(target_arch)} "
        f"node --input-type=module - <<'NODE'\n{script}\nNODE"
    )
    return run(["ssh", host, remote_cmd], cwd=REPO_ROOT)


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish released package roots to the live production Frontdoor registry.")
    parser.add_argument(
        "--release-summary",
        default=str(REPO_ROOT / "artifacts" / "package-smoke" / "prod-release-summary.json"),
        help="Release summary JSON for the target production variant.",
    )
    parser.add_argument(
        "--output",
        default=str(REPO_ROOT / "artifacts" / "package-smoke" / "prod-publish-summary.json"),
        help="Path to write the production publish summary.",
    )
    parser.add_argument("--host", default="frontdoor.nexushub.sh")
    parser.add_argument("--remote-frontdoor-root", default="/opt/nexus/frontdoor")
    parser.add_argument("--remote-db", default="/var/lib/nexus-frontdoor/frontdoor.db")
    parser.add_argument("--remote-package-root", default="/opt/nexus/frontdoor/packages")
    parser.add_argument("--target-os", default="linux")
    parser.add_argument("--target-arch", default="arm64")
    parser.add_argument("--only", nargs="*", default=None, help="Optional package ids to publish.")
    args = parser.parse_args()

    release_summary = json.loads(Path(args.release_summary).read_text(encoding="utf-8"))
    release_results = [item for item in release_summary.get("results", []) if item.get("ok")]
    if args.only:
        allowed = set(args.only)
        release_results = [item for item in release_results if item.get("id") in allowed]

    stage_base = REPO_ROOT / "artifacts" / "package-smoke" / "prod-stage"
    stage_base.mkdir(parents=True, exist_ok=True)

    results: list[dict[str, Any]] = []
    failures = 0

    for entry in release_results:
        package_root = Path(entry["package_root"]).resolve()
        archive_path = Path(entry["archive_path"]).resolve()
        package_id = str(entry["id"])
        kind = str(entry["kind"])
        manifest_name = "app.nexus.json" if kind == "app" else "adapter.nexus.json"
        manifest = json.loads((package_root / manifest_name).read_text(encoding="utf-8"))
        version = str(manifest["version"])
        local_stage_root = build_minimal_stage(package_root, kind, package_id, version, stage_base)
        remote_dir = f"{args.remote_package_root}/{package_id}/{version}"
        remote_package_root = f"{remote_dir}/package-root"
        remote_tarball_path = f"{remote_dir}/{archive_path.name}"

        prep = run(["ssh", args.host, f"mkdir -p {remote_package_root}"], cwd=REPO_ROOT)
        if prep.returncode != 0:
            results.append({
                "kind": kind,
                "id": package_id,
                "package_root": str(package_root),
                "archive_path": str(archive_path),
                "ok": False,
                "stage_error": prep.stderr or prep.stdout,
            })
            failures += 1
            print(f"[prod-publish:FAIL] {kind} {package_id} stage-remote")
            continue

        rsync_pkg = run(
            ["rsync", "-az", "--delete", f"{local_stage_root}/", f"{args.host}:{remote_package_root}/"],
            cwd=REPO_ROOT,
        )
        scp_tar = run(["scp", str(archive_path), f"{args.host}:{remote_tarball_path}"], cwd=REPO_ROOT)
        if rsync_pkg.returncode != 0 or scp_tar.returncode != 0:
            results.append({
                "kind": kind,
                "id": package_id,
                "package_root": str(package_root),
                "archive_path": str(archive_path),
                "ok": False,
                "stage_error": {
                    "rsync_stdout": rsync_pkg.stdout,
                    "rsync_stderr": rsync_pkg.stderr,
                    "scp_stdout": scp_tar.stdout,
                    "scp_stderr": scp_tar.stderr,
                },
            })
            failures += 1
            print(f"[prod-publish:FAIL] {kind} {package_id} stage-transfer")
            continue

        proc = remote_publish(
            args.host,
            args.remote_frontdoor_root,
            args.remote_db,
            remote_package_root,
            remote_tarball_path,
            args.target_os,
            args.target_arch,
            kind,
        )
        objects = parse_json_objects(proc.stdout)
        publish_result = objects[-1] if objects else None
        ok = (
            proc.returncode == 0
            and publish_result is not None
            and publish_result.get("verification", {}).get("package_count") == 1
            and publish_result.get("verification", {}).get("release_count") == 1
            and publish_result.get("verification", {}).get("variant_count") == 1
        )
        results.append({
            "kind": kind,
            "id": package_id,
            "package_root": str(package_root),
            "archive_path": str(archive_path),
            "remote_package_root": remote_package_root,
            "remote_tarball_path": remote_tarball_path,
            "ok": ok,
            "returncode": proc.returncode,
            "publish_result": publish_result,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
        })
        print(f"[prod-publish:{'PASS' if ok else 'FAIL'}] {kind} {package_id} {archive_path.name}")
        if not ok:
            failures += 1

    summary = {
        "generated_at": utc_now(),
        "host": args.host,
        "remote_frontdoor_root": args.remote_frontdoor_root,
        "remote_db": args.remote_db,
        "target_os": args.target_os,
        "target_arch": args.target_arch,
        "count": len(results),
        "failures": failures,
        "results": results,
    }
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"[prod-publish:summary] {output_path}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

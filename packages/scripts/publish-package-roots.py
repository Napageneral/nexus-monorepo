#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
PACKAGES_DIR = SCRIPT_DIR.parent
REPO_ROOT = PACKAGES_DIR.parent
PUBLISH_SCRIPT = SCRIPT_DIR / "publish-package.sh"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_json_lines(output: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    decoder = json.JSONDecoder()
    index = 0
    length = len(output)
    while index < length:
        start = output.find("{", index)
        if start == -1:
            break
        try:
            value, end = decoder.raw_decode(output[start:])
        except json.JSONDecodeError:
            index = start + 1
            continue
        if isinstance(value, dict):
            items.append(value)
        index = start + end
    return items


def verify_frontdoor_rows(db_path: Path, package_id: str, version: str) -> dict[str, Any]:
    conn = sqlite3.connect(str(db_path))
    try:
        package_count = conn.execute(
            "SELECT COUNT(*) FROM frontdoor_packages WHERE package_id = ?",
            (package_id,),
        ).fetchone()[0]
        release_row = conn.execute(
            "SELECT release_id FROM frontdoor_package_releases WHERE package_id = ? AND version = ?",
            (package_id, version),
        ).fetchone()
        variant_count = 0
        if release_row:
            variant_count = conn.execute(
                "SELECT COUNT(*) FROM frontdoor_release_variants WHERE release_id = ?",
                (release_row[0],),
            ).fetchone()[0]
        return {
            "package_count": package_count,
            "release_count": 1 if release_row else 0,
            "variant_count": variant_count,
        }
    finally:
        conn.close()


def run_publish(entry: dict[str, Any], db_path: Path, target_os: str | None, target_arch: str | None) -> dict[str, Any]:
    package_root = str(entry["package_root"])
    archive_path = str(entry["archive_path"])
    cmd = [str(PUBLISH_SCRIPT), package_root, "--tarball", archive_path, "--frontdoor-db", str(db_path)]
    if target_os:
        cmd.extend(["--target-os", target_os])
    if target_arch:
        cmd.extend(["--target-arch", target_arch])
    proc = subprocess.run(
        cmd,
        cwd=str(REPO_ROOT),
        text=True,
        capture_output=True,
    )
    json_objects = parse_json_lines(proc.stdout)
    publish_result = json_objects[-1] if json_objects else None
    verification = None
    if proc.returncode == 0 and publish_result:
        package_id = str(publish_result.get("package_id") or "")
        version = str(publish_result.get("version") or "")
        if package_id and version:
            verification = verify_frontdoor_rows(db_path, package_id, version)
    ok = proc.returncode == 0 and publish_result is not None and verification is not None and verification["package_count"] == 1 and verification["release_count"] == 1 and verification["variant_count"] >= 1
    return {
        "kind": entry["kind"],
        "id": entry["id"],
        "package_root": package_root,
        "archive_path": archive_path,
        "ok": ok,
        "returncode": proc.returncode,
        "publish_result": publish_result,
        "verification": verification,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run package publish smoke test across successful release results.")
    parser.add_argument(
        "--release-summary",
        default=str(REPO_ROOT / "artifacts" / "package-smoke" / "release-summary.json"),
        help="Path to the release summary JSON.",
    )
    parser.add_argument(
        "--frontdoor-db",
        default=str(REPO_ROOT / "artifacts" / "package-smoke" / "frontdoor-smoke.db"),
        help="Controlled Frontdoor DB path.",
    )
    parser.add_argument(
        "--output",
        default=str(REPO_ROOT / "artifacts" / "package-smoke" / "publish-summary.json"),
        help="Path to write the publish summary JSON.",
    )
    parser.add_argument("--target-os", default=None, help="Optional target OS override.")
    parser.add_argument("--target-arch", default=None, help="Optional target arch override.")
    parser.add_argument("--reset-db", action="store_true", help="Remove the controlled Frontdoor DB before publishing.")
    args = parser.parse_args()

    release_summary_path = Path(args.release_summary).resolve()
    release_summary = json.loads(release_summary_path.read_text(encoding="utf-8"))
    release_results = [item for item in release_summary.get("results", []) if item.get("ok")]

    db_path = Path(args.frontdoor_db).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if args.reset_db and db_path.exists():
        db_path.unlink()

    results: list[dict[str, Any]] = []
    failures = 0

    for entry in release_results:
        result = run_publish(entry, db_path, args.target_os, args.target_arch)
        results.append(result)
        status = "PASS" if result["ok"] else "FAIL"
        sys.stdout.write(f"[publish:{status}] {entry['kind']} {entry['id']} {entry['archive_path']}\n")
        if not result["ok"]:
            failures += 1

    summary = {
        "generated_at": utc_now(),
        "repo_root": str(REPO_ROOT),
        "release_summary": str(release_summary_path),
        "frontdoor_db": str(db_path),
        "count": len(results),
        "failures": failures,
        "results": results,
    }

    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    sys.stdout.write(f"[publish:summary] {output_path}\n")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
PACKAGES_DIR = SCRIPT_DIR.parent
REPO_ROOT = PACKAGES_DIR.parent
FRONTDOOR_DIR = REPO_ROOT / "frontdoor"
PUBLISH_SCRIPT = SCRIPT_DIR / "publish-package.sh"
FRONTDOOR_FRESH_SMOKE_SCRIPT = FRONTDOOR_DIR / "scripts" / "frontdoor-fresh-server-package-lifecycle-smoke.mjs"


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


def resolve_manifest(package_root: Path) -> tuple[str, Path]:
    app_manifest = package_root / "app.nexus.json"
    adapter_manifest = package_root / "adapter.nexus.json"
    if app_manifest.exists():
        return "app", app_manifest
    if adapter_manifest.exists():
        return "adapter", adapter_manifest
    raise RuntimeError(f"expected app.nexus.json or adapter.nexus.json in {package_root}")


def read_package_metadata(package_root: Path) -> dict[str, str]:
    package_type, manifest_path = resolve_manifest(package_root)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    package_id = str(manifest.get("id") or "").strip()
    version = str(manifest.get("version") or "").strip()
    if not package_id or not version:
        raise RuntimeError(f"manifest missing id/version: {manifest_path}")
    return {
        "package_type": package_type,
        "package_id": package_id,
        "version": version,
        "manifest_path": str(manifest_path),
    }


def run_release(package_root: Path) -> dict[str, Any]:
    script_path = package_root / "scripts" / "package-release.sh"
    proc = subprocess.run(
        [str(script_path)],
        cwd=str(package_root),
        text=True,
        capture_output=True,
    )
    json_objects = parse_json_lines(proc.stdout)
    release_result = next((item for item in reversed(json_objects) if "archive_path" in item), None)
    archive_path = None
    if release_result and isinstance(release_result.get("archive_path"), str):
        archive_path = release_result["archive_path"]
    return {
        "ok": proc.returncode == 0 and archive_path is not None,
        "returncode": proc.returncode,
        "archive_path": archive_path,
        "release_result": release_result,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
    }


def run_publish(
    package_root: Path,
    archive_path: str,
    target_os: str,
    target_arch: str,
    extra_args: list[str],
) -> dict[str, Any]:
    cmd = [
        str(PUBLISH_SCRIPT),
        str(package_root),
        "--tarball",
        archive_path,
        "--target-os",
        target_os,
        "--target-arch",
        target_arch,
        *extra_args,
    ]
    proc = subprocess.run(
        cmd,
        cwd=str(REPO_ROOT),
        text=True,
        capture_output=True,
    )
    json_objects = parse_json_lines(proc.stdout)
    publish_result = json_objects[-1] if json_objects else None
    return {
        "ok": proc.returncode == 0 and publish_result is not None,
        "returncode": proc.returncode,
        "publish_result": publish_result,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
        "command": cmd,
    }


def run_fresh_server_smoke(
    package_type: str,
    package_id: str,
    version: str,
    cleanup_mode: str,
) -> dict[str, Any]:
    node_bin = shutil.which("node")
    if not node_bin:
        raise RuntimeError("missing required tool: node")
    env = os.environ.copy()
    env["FRONTDOOR_SMOKE_KIND"] = package_type
    env["FRONTDOOR_SMOKE_CLEANUP_MODE"] = cleanup_mode
    if package_type == "app":
        env["FRONTDOOR_SMOKE_APP_ID"] = package_id
        env["FRONTDOOR_SMOKE_PURCHASE"] = "true"
    else:
        env["FRONTDOOR_SMOKE_ADAPTER_ID"] = package_id
        env["FRONTDOOR_SMOKE_INSTALL_VERSION"] = version
    proc = subprocess.run(
        [node_bin, str(FRONTDOOR_FRESH_SMOKE_SCRIPT)],
        cwd=str(FRONTDOOR_DIR),
        text=True,
        capture_output=True,
        env=env,
    )
    payload = None
    if proc.stdout.strip():
        try:
            payload = json.loads(proc.stdout)
        except json.JSONDecodeError:
            payload = None
    return {
        "ok": proc.returncode == 0 and isinstance(payload, dict) and payload.get("ok") is True,
        "returncode": proc.returncode,
        "result": payload,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Release an app/adapter package, optionally publish it, then run the Frontdoor fresh-server cleanroom smoke.",
    )
    parser.add_argument("--package-root", required=True, help="Absolute or repo-relative package root.")
    parser.add_argument("--publish", action="store_true", help="Publish the released tarball before hosted smoke.")
    parser.add_argument("--cleanup-mode", default="destroy", choices=["destroy", "archive", "retain"])
    parser.add_argument("--target-os", default="linux")
    parser.add_argument("--target-arch", default="arm64")
    parser.add_argument(
        "--publish-arg",
        action="append",
        default=[],
        help="Extra argument to forward to packages/scripts/publish-package.sh. Repeatable.",
    )
    parser.add_argument(
        "--output",
        default=str(REPO_ROOT / "artifacts" / "package-smoke" / "hosted-cleanroom-summary.json"),
        help="Path to write the summary JSON.",
    )
    args = parser.parse_args()

    package_root = Path(args.package_root).resolve()
    metadata = read_package_metadata(package_root)
    summary: dict[str, Any] = {
        "generated_at": utc_now(),
        "repo_root": str(REPO_ROOT),
        "package_root": str(package_root),
        "package_id": metadata["package_id"],
        "package_type": metadata["package_type"],
        "version": metadata["version"],
        "publish_requested": args.publish,
        "cleanup_mode": args.cleanup_mode,
        "target_os": args.target_os,
        "target_arch": args.target_arch,
    }

    release = run_release(package_root)
    summary["release"] = release
    if not release["ok"]:
        output_path = Path(args.output).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
        sys.stdout.write(f"[hosted-cleanroom:release:FAIL] {metadata['package_id']}\n")
        sys.stdout.write(f"[hosted-cleanroom:summary] {output_path}\n")
        return 1

    if args.publish:
        publish = run_publish(
            package_root,
            str(release["archive_path"]),
            args.target_os,
            args.target_arch,
            list(args.publish_arg),
        )
        summary["publish"] = publish
        if not publish["ok"]:
            output_path = Path(args.output).resolve()
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
            sys.stdout.write(f"[hosted-cleanroom:publish:FAIL] {metadata['package_id']}\n")
            sys.stdout.write(f"[hosted-cleanroom:summary] {output_path}\n")
            return 1

    smoke = run_fresh_server_smoke(
        metadata["package_type"],
        metadata["package_id"],
        metadata["version"],
        args.cleanup_mode,
    )
    summary["hosted_cleanroom_smoke"] = smoke

    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    status = "PASS" if smoke["ok"] else "FAIL"
    sys.stdout.write(f"[hosted-cleanroom:{status}] {metadata['package_type']} {metadata['package_id']}\n")
    sys.stdout.write(f"[hosted-cleanroom:summary] {output_path}\n")
    return 0 if smoke["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
PACKAGES_DIR = SCRIPT_DIR.parent
REPO_ROOT = PACKAGES_DIR.parent
DISCOVER_SCRIPT = SCRIPT_DIR / "discover-package-roots.py"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def discover_roots() -> list[dict[str, Any]]:
    raw = subprocess.check_output([sys.executable, str(DISCOVER_SCRIPT)], text=True)
    data = json.loads(raw)
    if not isinstance(data, list):
        raise RuntimeError("discover-package-roots.py did not return a list")
    return data


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


def run_release(package: dict[str, Any]) -> dict[str, Any]:
    package_root = Path(str(package["package_root"]))
    script_path = package_root / "scripts" / "package-release.sh"
    proc = subprocess.run(
        [str(script_path)],
        cwd=str(package_root),
        text=True,
        capture_output=True,
    )
    json_objects = parse_json_lines(proc.stdout)
    validation_result = next((item for item in json_objects if "errors" in item), None)
    release_result = next((item for item in reversed(json_objects) if "archive_path" in item), None)
    archive_path = None
    if release_result and isinstance(release_result.get("archive_path"), str):
        archive_path = release_result["archive_path"]
    return {
        "kind": package["kind"],
        "id": package["id"],
        "package_root": str(package_root),
        "script_path": str(script_path),
        "ok": proc.returncode == 0 and archive_path is not None,
        "returncode": proc.returncode,
        "archive_path": archive_path,
        "validation_result": validation_result,
        "release_result": release_result,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run package release smoke test across all discovered package roots.")
    parser.add_argument(
        "--output",
        default=str(REPO_ROOT / "artifacts" / "package-smoke" / "release-summary.json"),
        help="Path to write the release summary JSON.",
    )
    args = parser.parse_args()

    roots = discover_roots()
    results: list[dict[str, Any]] = []
    failures = 0

    for package in roots:
        result = run_release(package)
        results.append(result)
        status = "PASS" if result["ok"] else "FAIL"
        archive_path = result["archive_path"] or "-"
        sys.stdout.write(f"[release:{status}] {package['kind']} {package['id']} {archive_path}\n")
        if not result["ok"]:
            failures += 1

    summary = {
        "generated_at": utc_now(),
        "repo_root": str(REPO_ROOT),
        "count": len(results),
        "failures": failures,
        "results": results,
    }

    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    sys.stdout.write(f"[release:summary] {output_path}\n")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

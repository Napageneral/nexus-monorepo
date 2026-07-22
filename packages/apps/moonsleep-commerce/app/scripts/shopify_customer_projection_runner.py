#!/usr/bin/env python3
"""Checkpointed, resource-aware Shopify customer projection runner.

The runner consumes a private manifest of already-committed Nex record IDs. It
never calls Shopify. Each request is bounded to at most 250 records, and a
durable local checkpoint advances only after Nex returns an exact successful
batch receipt. Retrying a lost response is safe because the projector binds
identity observations to immutable source record IDs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import stat
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


MAX_MANIFEST_BYTES = 32 * 1024 * 1024
MAX_TOKEN_BYTES = 16 * 1024
MAX_RECORDS = 20_000
MAX_BATCH_SIZE = 250
MAX_BATCHES_PER_INVOCATION = 10
CHECKPOINT_RECEIPT = "moonsleep_shopify_customer_projection_checkpoint"
MANIFEST_RECEIPT = "moonsleep_shopify_customer_projection_manifest"
OPERATION = "moonsleep-commerce.shopify-customers.project-backfill"
INSPECT_OPERATION = "moonsleep-commerce.shopify-customers.inspect-backfill"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
SHOP_DOMAIN_RE = re.compile(
    r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$"
)
CONNECTION_ID_RE = re.compile(r"^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$")
MANIFEST_FIELDS = {
    "receipt_type",
    "receipt_version",
    "shop_domain",
    "connection_id",
    "record_ids",
    "record_set_sha256",
}
CHECKPOINT_FIELDS = {
    "receipt_type",
    "receipt_version",
    "manifest_sha256",
    "batch_size",
    "record_count",
    "next_index",
    "completed",
    "batches",
    "totals",
}
BATCH_FIELDS = {
    "batch_index",
    "start_index",
    "end_index",
    "record_count",
    "first_record_id",
    "last_record_id",
    "record_set_sha256",
    "projection_result_sha256",
    "created_entities",
    "created_contacts",
    "replayed",
}
TOTAL_FIELDS = {"records_projected", "created_entities", "created_contacts", "replayed"}


class ProjectionError(RuntimeError):
    pass


class ResourcePause(ProjectionError):
    pass


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _record_set_sha256(record_ids: list[str]) -> str:
    return _sha256(json.dumps(record_ids, separators=(",", ":"), ensure_ascii=False).encode())


def _validate_record_ids(value: Any, label: str) -> list[str]:
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_RECORDS:
        raise ProjectionError(f"{label} count is invalid")
    normalized: list[str] = []
    for index, item in enumerate(value):
        if not isinstance(item, str) or item != item.strip() or not item:
            raise ProjectionError(f"{label}[{index}] is invalid")
        if len(item.encode()) > 512:
            raise ProjectionError(f"{label}[{index}] exceeds 512 bytes")
        normalized.append(item)
    if normalized != sorted(normalized) or len(set(normalized)) != len(normalized):
        raise ProjectionError(f"{label} must be strictly sorted and unique")
    return normalized


def _read_regular_file(path: Path, maximum: int, *, private: bool = True) -> bytes:
    if not path.is_absolute():
        raise ProjectionError(f"path must be absolute: {path}")
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        raise ProjectionError(f"could not open governed file: {path}") from exc
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
            raise ProjectionError(f"governed file metadata is unsafe: {path}")
        if private and stat.S_IMODE(before.st_mode) & 0o077:
            raise ProjectionError(f"governed file is not private: {path}")
        if before.st_size < 1 or before.st_size > maximum:
            raise ProjectionError(f"governed file size is invalid: {path}")
        raw = bytearray()
        while len(raw) <= maximum:
            chunk = os.read(descriptor, min(1024 * 1024, maximum + 1 - len(raw)))
            if not chunk:
                break
            raw.extend(chunk)
        after = os.fstat(descriptor)
        if len(raw) > maximum:
            raise ProjectionError(f"governed file exceeds its byte ceiling: {path}")
        if (
            before.st_dev != after.st_dev
            or before.st_ino != after.st_ino
            or before.st_size != after.st_size
            or before.st_mtime_ns != after.st_mtime_ns
        ):
            raise ProjectionError(f"governed file changed while being read: {path}")
        return bytes(raw)
    finally:
        os.close(descriptor)


def _load_json_object(raw: bytes, label: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProjectionError(f"{label} is not valid JSON") from exc
    if not isinstance(value, dict):
        raise ProjectionError(f"{label} must contain a JSON object")
    return value


def load_manifest(path: Path, expected_sha256: str) -> tuple[dict[str, Any], str]:
    if not SHA256_RE.fullmatch(expected_sha256):
        raise ProjectionError("expected manifest SHA-256 is malformed")
    raw = _read_regular_file(path, MAX_MANIFEST_BYTES)
    observed_sha256 = _sha256(raw)
    if observed_sha256 != expected_sha256:
        raise ProjectionError("manifest file SHA-256 does not match")
    manifest = _load_json_object(raw, "manifest")
    if manifest.get("receipt_type") != MANIFEST_RECEIPT or manifest.get("receipt_version") != 1:
        raise ProjectionError("manifest contract is unsupported")
    if set(manifest) != MANIFEST_FIELDS:
        raise ProjectionError("manifest fields do not match the exact contract")
    shop_domain = manifest.get("shop_domain")
    connection_id = manifest.get("connection_id")
    if not isinstance(shop_domain, str) or not SHOP_DOMAIN_RE.fullmatch(shop_domain):
        raise ProjectionError("manifest shop_domain is invalid")
    if not isinstance(connection_id, str) or not CONNECTION_ID_RE.fullmatch(connection_id):
        raise ProjectionError("manifest connection_id is invalid")
    normalized = _validate_record_ids(manifest.get("record_ids"), "manifest record_ids")
    record_set_sha256 = manifest.get("record_set_sha256")
    if record_set_sha256 != _record_set_sha256(normalized):
        raise ProjectionError("manifest record-set SHA-256 does not match")
    return {**manifest, "record_ids": normalized}, observed_sha256


def _checkpoint_dir(path: Path) -> None:
    if not path.is_absolute():
        raise ProjectionError("checkpoint directory must be absolute")
    path.mkdir(parents=True, mode=0o700, exist_ok=True)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
        raise ProjectionError("checkpoint path is not a safe directory")
    if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise ProjectionError("checkpoint directory custody is unsafe")


def _write_checkpoint(path: Path, value: dict[str, Any]) -> None:
    _checkpoint_dir(path.parent)
    raw = _canonical_json(value) + b"\n"
    temporary = path.parent / f".{path.name}.{os.getpid()}.{time.time_ns()}.tmp"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_CLOEXEC", 0)
    descriptor = os.open(temporary, flags, 0o600)
    try:
        pending = memoryview(raw)
        while pending:
            written = os.write(descriptor, pending)
            if written < 1:
                raise ProjectionError("checkpoint write made no progress")
            pending = pending[written:]
        os.fsync(descriptor)
    except Exception:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        raise
    finally:
        os.close(descriptor)
    os.replace(temporary, path)
    directory = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def _write_new_private_json(path: Path, value: dict[str, Any]) -> tuple[bytes, str]:
    _checkpoint_dir(path.parent)
    raw = _canonical_json(value) + b"\n"
    temporary = path.parent / f".{path.name}.{os.getpid()}.{time.time_ns()}.tmp"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_CLOEXEC", 0)
    descriptor = os.open(temporary, flags, 0o600)
    try:
        pending = memoryview(raw)
        while pending:
            written = os.write(descriptor, pending)
            if written < 1:
                raise ProjectionError("manifest write made no progress")
            pending = pending[written:]
        os.fsync(descriptor)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    finally:
        os.close(descriptor)
    try:
        os.link(temporary, path, follow_symlinks=False)
    except FileExistsError as exc:
        temporary.unlink(missing_ok=True)
        raise ProjectionError("manifest output already exists") from exc
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    temporary.unlink()
    directory = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    return raw, _sha256(raw)


def _initial_checkpoint(manifest_sha256: str, batch_size: int, total: int) -> dict[str, Any]:
    return {
        "receipt_type": CHECKPOINT_RECEIPT,
        "receipt_version": 1,
        "manifest_sha256": manifest_sha256,
        "batch_size": batch_size,
        "record_count": total,
        "next_index": 0,
        "completed": False,
        "batches": [],
        "totals": {
            "records_projected": 0,
            "created_entities": 0,
            "created_contacts": 0,
            "replayed": 0,
        },
    }


def load_checkpoint(
    path: Path, manifest_sha256: str, batch_size: int, record_ids: list[str]
) -> dict[str, Any]:
    total = len(record_ids)
    if not path.exists():
        return _initial_checkpoint(manifest_sha256, batch_size, total)
    value = _load_json_object(_read_regular_file(path, MAX_MANIFEST_BYTES), "checkpoint")
    if (
        set(value) != CHECKPOINT_FIELDS
        or
        value.get("receipt_type") != CHECKPOINT_RECEIPT
        or value.get("receipt_version") != 1
        or value.get("manifest_sha256") != manifest_sha256
        or value.get("batch_size") != batch_size
        or value.get("record_count") != total
    ):
        raise ProjectionError("checkpoint does not bind the exact invocation")
    next_index = value.get("next_index")
    batches = value.get("batches")
    completed = value.get("completed")
    totals = value.get("totals")
    if (
        not isinstance(next_index, int)
        or isinstance(next_index, bool)
        or not 0 <= next_index <= total
        or not isinstance(batches, list)
        or not isinstance(completed, bool)
        or completed != (next_index == total)
        or not isinstance(totals, dict)
        or set(totals) != TOTAL_FIELDS
    ):
        raise ProjectionError("checkpoint progress is malformed")
    observed_totals = dict.fromkeys(TOTAL_FIELDS, 0)
    cursor = 0
    for batch_index, batch in enumerate(batches):
        if not isinstance(batch, dict) or set(batch) != BATCH_FIELDS:
            raise ProjectionError("checkpoint batch receipt is malformed")
        end = min(cursor + batch_size, total)
        batch_ids = record_ids[cursor:end]
        if (
            not batch_ids
            or batch.get("batch_index") != batch_index
            or batch.get("start_index") != cursor
            or batch.get("end_index") != end
            or batch.get("record_count") != len(batch_ids)
            or batch.get("first_record_id") != batch_ids[0]
            or batch.get("last_record_id") != batch_ids[-1]
            or batch.get("record_set_sha256") != _record_set_sha256(batch_ids)
            or not isinstance(batch.get("projection_result_sha256"), str)
            or not SHA256_RE.fullmatch(batch["projection_result_sha256"])
        ):
            raise ProjectionError("checkpoint batch receipt does not match the manifest")
        for field in ("created_entities", "created_contacts", "replayed"):
            counter = batch.get(field)
            if (
                not isinstance(counter, int)
                or isinstance(counter, bool)
                or not 0 <= counter <= len(batch_ids)
            ):
                raise ProjectionError("checkpoint batch counter is malformed")
            observed_totals[field] += counter
        observed_totals["records_projected"] += len(batch_ids)
        cursor = end
    if cursor != next_index or totals != observed_totals:
        raise ProjectionError("checkpoint totals do not match its batch receipts")
    return value


def _read_io_full_avg60(path: Path) -> float:
    if not path.is_absolute():
        raise ProjectionError("I/O pressure path must be absolute")
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        raise ProjectionError("could not open I/O pressure file") from exc
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode):
            raise ProjectionError("I/O pressure path is not a regular file")
        raw = os.read(descriptor, 64 * 1024 + 1)
    finally:
        os.close(descriptor)
    if not raw or len(raw) > 64 * 1024:
        raise ProjectionError("I/O pressure file size is invalid")
    text = raw.decode("ascii", "strict")
    for line in text.splitlines():
        if line.startswith("full "):
            for token in line.split()[1:]:
                if token.startswith("avg60="):
                    value = float(token.split("=", 1)[1])
                    if not math.isfinite(value) or value < 0:
                        raise ProjectionError("I/O pressure avg60 value is invalid")
                    return value
    raise ProjectionError("I/O pressure file has no full avg60 value")


def _unwrap_response(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ProjectionError("Nex returned a non-object response")
    if value.get("ok") is False:
        error = value.get("error")
        message = error.get("message") if isinstance(error, dict) else None
        raise ProjectionError(str(message or "Nex operation failed"))
    payload = value.get("payload")
    return payload if isinstance(payload, dict) else value


def _request_json(url: str, token: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=_canonical_json(payload),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                raise ProjectionError(f"Nex returned HTTP {response.status}")
            raw = response.read(8 * 1024 * 1024 + 1)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ProjectionError("Nex projection request failed") from exc
    if len(raw) > 8 * 1024 * 1024:
        raise ProjectionError("Nex projection response exceeded its byte ceiling")
    return _unwrap_response(_load_json_object(raw, "Nex response"))


def _require_loopback_http_url(value: str, label: str) -> str:
    try:
        parsed = urllib.parse.urlsplit(value)
        port = parsed.port
    except (TypeError, ValueError) as exc:
        raise ProjectionError(f"{label} is malformed") from exc
    if (
        parsed.scheme != "http"
        or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
        or port is None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise ProjectionError(f"{label} must be an explicit loopback HTTP URL")
    return value.rstrip("/")


def _healthcheck(url: str, timeout: float) -> None:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            if response.status != 200:
                raise ResourcePause(f"health endpoint returned HTTP {response.status}")
            raw = response.read(64 * 1024 + 1)
            if len(raw) > 64 * 1024:
                raise ResourcePause("health response exceeded its byte ceiling")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ResourcePause("health endpoint is unavailable") from exc


def _resource_gate(args: argparse.Namespace, health_urls: list[str]) -> None:
    for marker in args.pause_marker:
        if not Path(marker).is_absolute():
            raise ProjectionError("pause marker path must be absolute")
        if os.path.lexists(marker):
            raise ResourcePause("production pause marker is present")
    if args.io_pressure_file:
        pressure = _read_io_full_avg60(Path(args.io_pressure_file))
        if pressure > args.max_io_full_avg60:
            raise ResourcePause("I/O pressure is above the projection ceiling")
    for health_url in health_urls:
        _healthcheck(health_url, args.timeout_seconds)


def _require_shop_domain(value: str | None) -> str:
    if not isinstance(value, str) or not SHOP_DOMAIN_RE.fullmatch(value):
        raise ProjectionError("shop_domain is invalid")
    return value


def _require_connection_id(value: str | None) -> str:
    if not isinstance(value, str) or not CONNECTION_ID_RE.fullmatch(value):
        raise ProjectionError("connection_id is invalid")
    return value


def _build_manifest(
    args: argparse.Namespace,
    runtime_url: str,
    token: str,
    health_urls: list[str],
) -> dict[str, Any]:
    shop_domain = _require_shop_domain(args.shop_domain)
    connection_id = _require_connection_id(args.connection_id)
    _resource_gate(args, health_urls)
    result = _request_json(
        f"{runtime_url}/runtime/operations/{INSPECT_OPERATION}",
        token,
        {"shop_domain": shop_domain, "connection_id": connection_id},
        args.timeout_seconds,
    )
    record_ids = _validate_record_ids(result.get("record_ids"), "inspection record_ids")
    record_set_sha256 = _record_set_sha256(record_ids)
    if (
        result.get("state") != "ready"
        or result.get("shop_domain") != shop_domain
        or result.get("connection_id") != connection_id
        or result.get("record_count") != len(record_ids)
        or result.get("record_set_sha256") != record_set_sha256
        or result.get("first_record_id") != record_ids[0]
        or result.get("last_record_id") != record_ids[-1]
        or result.get("provider_write_authority") is not False
    ):
        raise ProjectionError("Nex returned an invalid inspection receipt")
    manifest = {
        "receipt_type": MANIFEST_RECEIPT,
        "receipt_version": 1,
        "shop_domain": shop_domain,
        "connection_id": connection_id,
        "record_ids": record_ids,
        "record_set_sha256": record_set_sha256,
    }
    _, manifest_sha256 = _write_new_private_json(Path(args.manifest), manifest)
    return {
        **manifest,
        "manifest_sha256": manifest_sha256,
        "provider_write_authority": False,
    }


def run(args: argparse.Namespace) -> dict[str, Any]:
    if not 1 <= args.batch_size <= MAX_BATCH_SIZE:
        raise ProjectionError(f"batch size must be between 1 and {MAX_BATCH_SIZE}")
    if args.sleep_ms < 0 or args.sleep_ms > 60_000:
        raise ProjectionError("sleep interval is invalid")
    if not math.isfinite(args.timeout_seconds) or not 0 < args.timeout_seconds <= 300:
        raise ProjectionError("request timeout is invalid")
    if (
        not isinstance(args.max_batches, int)
        or isinstance(args.max_batches, bool)
        or not 1 <= args.max_batches <= MAX_BATCHES_PER_INVOCATION
    ):
        raise ProjectionError(
            f"max_batches must be between 1 and {MAX_BATCHES_PER_INVOCATION}"
        )
    if not math.isfinite(args.max_io_full_avg60) or args.max_io_full_avg60 < 0:
        raise ProjectionError("I/O pressure ceiling is invalid")
    runtime_url = _require_loopback_http_url(args.runtime_url, "runtime URL")
    health_urls = [
        _require_loopback_http_url(value, "health URL") for value in args.health_url
    ]
    token = _read_regular_file(Path(args.runtime_token_file), MAX_TOKEN_BYTES).decode().strip()
    if not token or "\n" in token or "\r" in token:
        raise ProjectionError("runtime token is malformed")
    if args.build_manifest:
        if args.manifest_sha256 is not None or args.checkpoint is not None:
            raise ProjectionError("manifest build cannot accept projection checkpoint arguments")
        return _build_manifest(args, runtime_url, token, health_urls)
    if args.shop_domain is not None or args.connection_id is not None:
        raise ProjectionError("projection reads shop identity only from the bound manifest")
    if args.manifest_sha256 is None or args.checkpoint is None:
        raise ProjectionError("projection requires manifest_sha256 and checkpoint")
    manifest, manifest_sha256 = load_manifest(Path(args.manifest), args.manifest_sha256)
    record_ids: list[str] = manifest["record_ids"]
    checkpoint_path = Path(args.checkpoint)
    checkpoint = load_checkpoint(
        checkpoint_path, manifest_sha256, args.batch_size, record_ids
    )
    if checkpoint.get("completed") is True:
        return checkpoint

    batches_this_run = 0
    while (
        checkpoint["next_index"] < len(record_ids)
        and batches_this_run < args.max_batches
    ):
        _resource_gate(args, health_urls)

        start = checkpoint["next_index"]
        end = min(start + args.batch_size, len(record_ids))
        batch_ids = record_ids[start:end]
        batch_sha256 = _record_set_sha256(batch_ids)
        result = _request_json(
            f"{runtime_url}/runtime/operations/{OPERATION}",
            token,
            {"record_ids": batch_ids, "record_set_sha256": batch_sha256},
            args.timeout_seconds,
        )
        if (
            result.get("state") != "succeeded"
            or result.get("records_requested") != len(batch_ids)
            or result.get("records_projected") != len(batch_ids)
            or result.get("record_set_sha256") != batch_sha256
            or result.get("provider_write_authority") is not False
        ):
            raise ProjectionError("Nex returned an invalid projection receipt")
        counters: dict[str, int] = {}
        for field in ("created_entities", "created_contacts", "replayed"):
            value = result.get(field)
            if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= len(batch_ids):
                raise ProjectionError(f"Nex returned an invalid {field} counter")
            counters[field] = value
        projection_sha256 = result.get("projection_result_sha256")
        if not isinstance(projection_sha256, str) or not SHA256_RE.fullmatch(projection_sha256):
            raise ProjectionError("Nex returned an invalid projection result digest")

        receipt = {
            "batch_index": len(checkpoint["batches"]),
            "start_index": start,
            "end_index": end,
            "record_count": len(batch_ids),
            "first_record_id": batch_ids[0],
            "last_record_id": batch_ids[-1],
            "record_set_sha256": batch_sha256,
            "projection_result_sha256": projection_sha256,
            **counters,
        }
        checkpoint["batches"].append(receipt)
        checkpoint["next_index"] = end
        checkpoint["completed"] = end == len(record_ids)
        checkpoint["totals"]["records_projected"] += len(batch_ids)
        for field, value in counters.items():
            checkpoint["totals"][field] += value
        _write_checkpoint(checkpoint_path, checkpoint)
        batches_this_run += 1
        if not checkpoint["completed"] and args.sleep_ms:
            time.sleep(args.sleep_ms / 1000)

    return checkpoint


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser()
    value.add_argument("--runtime-url", required=True)
    value.add_argument("--runtime-token-file", required=True)
    value.add_argument("--manifest", required=True)
    value.add_argument("--build-manifest", action="store_true")
    value.add_argument("--shop-domain")
    value.add_argument("--connection-id")
    value.add_argument("--manifest-sha256")
    value.add_argument("--checkpoint")
    value.add_argument("--batch-size", type=int, default=25)
    value.add_argument("--sleep-ms", type=int, default=1_000)
    value.add_argument("--timeout-seconds", type=float, default=30.0)
    value.add_argument("--health-url", action="append", default=[])
    value.add_argument("--pause-marker", action="append", default=[])
    value.add_argument("--io-pressure-file")
    value.add_argument("--max-io-full-avg60", type=float, default=1.0)
    value.add_argument("--max-batches", type=int, default=1)
    return value


def main(argv: list[str] | None = None) -> int:
    try:
        result = run(parser().parse_args(argv))
    except ResourcePause as exc:
        print(json.dumps({"ok": False, "paused": True, "error": str(exc)}, sort_keys=True))
        return 75
    except ProjectionError as exc:
        print(json.dumps({"ok": False, "paused": False, "error": str(exc)}, sort_keys=True))
        return 1
    if result.get("receipt_type") == MANIFEST_RECEIPT:
        print(
            json.dumps(
                {
                    "ok": True,
                    "manifest_sha256": result["manifest_sha256"],
                    "record_count": len(result["record_ids"]),
                    "record_set_sha256": result["record_set_sha256"],
                    "first_record_id": result["record_ids"][0],
                    "last_record_id": result["record_ids"][-1],
                    "provider_write_authority": False,
                },
                sort_keys=True,
            )
        )
        return 0
    print(
        json.dumps(
            {
                "ok": True,
                "completed": result.get("completed") is True,
                "next_index": result.get("next_index"),
                "record_count": result.get("record_count"),
                "batch_count": len(result.get("batches", [])),
                "totals": result.get("totals"),
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Bounded, checkpointed projection of existing Shopify order evidence.

This runner never calls Shopify. It drains immutable order and line-item record
IDs already committed to Nex. Each invocation defaults to one 25-record batch;
the resource gate runs before every batch and the durable checkpoint advances
only after an exact Nex projection receipt is validated and fsynced.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import shopify_customer_projection_runner as common


MAX_RECORDS = 40_000
MAX_BATCH_SIZE = 50
MAX_BATCHES_PER_INVOCATION = 10
MANIFEST_RECEIPT = "moonsleep_shopify_commerce_projection_manifest"
CHECKPOINT_RECEIPT = "moonsleep_shopify_commerce_projection_checkpoint"
OPERATION = "moonsleep-commerce.shopify-commerce.project-backfill"
INSPECT_OPERATION = "moonsleep-commerce.shopify-commerce.inspect-backfill"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
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
    "orders_projected",
    "line_items_projected",
    "created",
    "replayed",
    "became_current",
}
TOTAL_FIELDS = {
    "records_projected",
    "orders_projected",
    "line_items_projected",
    "created",
    "replayed",
    "became_current",
}


ProjectionError = common.ProjectionError
ResourcePause = common.ResourcePause


def _record_set_sha256(record_ids: list[str]) -> str:
    return common._sha256(
        json.dumps(record_ids, separators=(",", ":"), ensure_ascii=False).encode()
    )


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
    if len(set(normalized)) != len(normalized):
        raise ProjectionError(f"{label} must contain unique record IDs")
    return normalized


def load_manifest(path: Path, expected_sha256: str) -> tuple[dict[str, Any], str]:
    if not SHA256_RE.fullmatch(expected_sha256):
        raise ProjectionError("expected manifest SHA-256 is malformed")
    raw = common._read_regular_file(path, common.MAX_MANIFEST_BYTES)
    observed_sha256 = common._sha256(raw)
    if observed_sha256 != expected_sha256:
        raise ProjectionError("manifest file SHA-256 does not match")
    manifest = common._load_json_object(raw, "manifest")
    if (
        set(manifest) != MANIFEST_FIELDS
        or manifest.get("receipt_type") != MANIFEST_RECEIPT
        or manifest.get("receipt_version") != 1
    ):
        raise ProjectionError("manifest contract is unsupported")
    shop_domain = common._require_shop_domain(manifest.get("shop_domain"))
    connection_id = common._require_connection_id(manifest.get("connection_id"))
    record_ids = _validate_record_ids(manifest.get("record_ids"), "manifest record_ids")
    if manifest.get("record_set_sha256") != _record_set_sha256(record_ids):
        raise ProjectionError("manifest record-set SHA-256 does not match")
    return {
        **manifest,
        "shop_domain": shop_domain,
        "connection_id": connection_id,
        "record_ids": record_ids,
    }, observed_sha256


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
        "totals": dict.fromkeys(TOTAL_FIELDS, 0),
    }


def load_checkpoint(
    path: Path, manifest_sha256: str, batch_size: int, record_ids: list[str]
) -> dict[str, Any]:
    total = len(record_ids)
    if not path.exists():
        return _initial_checkpoint(manifest_sha256, batch_size, total)
    value = common._load_json_object(
        common._read_regular_file(path, common.MAX_MANIFEST_BYTES), "checkpoint"
    )
    if (
        set(value) != CHECKPOINT_FIELDS
        or value.get("receipt_type") != CHECKPOINT_RECEIPT
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
        end = min(cursor + batch_size, total)
        batch_ids = record_ids[cursor:end]
        if (
            not isinstance(batch, dict)
            or set(batch) != BATCH_FIELDS
            or not batch_ids
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
        for field in TOTAL_FIELDS - {"records_projected"}:
            counter = batch.get(field)
            if (
                not isinstance(counter, int)
                or isinstance(counter, bool)
                or not 0 <= counter <= len(batch_ids)
            ):
                raise ProjectionError("checkpoint batch counter is malformed")
            observed_totals[field] += counter
        if batch["orders_projected"] + batch["line_items_projected"] != len(batch_ids):
            raise ProjectionError("checkpoint family counters do not cover the exact batch")
        if batch["created"] + batch["replayed"] != len(batch_ids):
            raise ProjectionError("checkpoint outcome counters do not cover the exact batch")
        observed_totals["records_projected"] += len(batch_ids)
        cursor = end
    if cursor != next_index or totals != observed_totals:
        raise ProjectionError("checkpoint totals do not match its batch receipts")
    return value


def _build_manifest(
    args: argparse.Namespace, runtime_url: str, token: str, health_urls: list[str]
) -> dict[str, Any]:
    shop_domain = common._require_shop_domain(args.shop_domain)
    connection_id = common._require_connection_id(args.connection_id)
    common._resource_gate(args, health_urls)
    result = common._request_json(
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
        or result.get("provider_read_authority") is not False
        or result.get("provider_write_authority") is not False
    ):
        raise ProjectionError("Nex returned an invalid commerce inspection receipt")
    manifest = {
        "receipt_type": MANIFEST_RECEIPT,
        "receipt_version": 1,
        "shop_domain": shop_domain,
        "connection_id": connection_id,
        "record_ids": record_ids,
        "record_set_sha256": record_set_sha256,
    }
    _, manifest_sha256 = common._write_new_private_json(Path(args.manifest), manifest)
    return {**manifest, "manifest_sha256": manifest_sha256}


def run(args: argparse.Namespace) -> dict[str, Any]:
    if not 1 <= args.batch_size <= MAX_BATCH_SIZE:
        raise ProjectionError(f"batch size must be between 1 and {MAX_BATCH_SIZE}")
    if not 0 <= args.sleep_ms <= 60_000:
        raise ProjectionError("sleep interval is invalid")
    if not math.isfinite(args.timeout_seconds) or not 0 < args.timeout_seconds <= 120:
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
    runtime_url = common._require_loopback_http_url(args.runtime_url, "runtime URL")
    health_urls = [
        common._require_loopback_http_url(value, "health URL")
        for value in args.health_url
    ]
    token = common._read_regular_file(
        Path(args.runtime_token_file), common.MAX_TOKEN_BYTES
    ).decode().strip()
    if not token or "\n" in token or "\r" in token:
        raise ProjectionError("runtime token is malformed")
    if args.build_manifest:
        if args.manifest_sha256 is not None or args.checkpoint is not None:
            raise ProjectionError("manifest build cannot accept checkpoint arguments")
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
    if checkpoint["completed"]:
        return checkpoint

    batches_this_run = 0
    while (
        checkpoint["next_index"] < len(record_ids)
        and batches_this_run < args.max_batches
    ):
        common._resource_gate(args, health_urls)
        start = checkpoint["next_index"]
        end = min(start + args.batch_size, len(record_ids))
        batch_ids = record_ids[start:end]
        batch_sha256 = _record_set_sha256(batch_ids)
        result = common._request_json(
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
            or result.get("provider_read_authority") is not False
            or result.get("provider_write_authority") is not False
        ):
            raise ProjectionError("Nex returned an invalid commerce projection receipt")
        counters: dict[str, int] = {}
        for field in TOTAL_FIELDS - {"records_projected"}:
            value = result.get(field)
            if (
                not isinstance(value, int)
                or isinstance(value, bool)
                or not 0 <= value <= len(batch_ids)
            ):
                raise ProjectionError(f"Nex returned an invalid {field} counter")
            counters[field] = value
        if counters["orders_projected"] + counters["line_items_projected"] != len(
            batch_ids
        ):
            raise ProjectionError("Nex family counters do not cover the exact batch")
        if counters["created"] + counters["replayed"] != len(batch_ids):
            raise ProjectionError("Nex outcome counters do not cover the exact batch")
        projection_sha256 = result.get("projection_result_sha256")
        if not isinstance(projection_sha256, str) or not SHA256_RE.fullmatch(
            projection_sha256
        ):
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
        common._write_checkpoint(checkpoint_path, checkpoint)
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
                    "provider_read_authority": False,
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

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("shopify_customer_projection_runner.py")
SPEC = importlib.util.spec_from_file_location("shopify_customer_projection_runner", MODULE_PATH)
assert SPEC and SPEC.loader
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


def compact(value: object) -> bytes:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode()


class ProjectionHandler(BaseHTTPRequestHandler):
    seen: set[str] = set()
    calls: int = 0
    lose_response_on_call: int | None = None
    inspection_ids: list[str] = []

    def log_message(self, *_args: object) -> None:
        return

    def do_GET(self) -> None:
        body = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        request = json.loads(self.rfile.read(length))
        if self.path.endswith(runner.INSPECT_OPERATION):
            record_ids = type(self).inspection_ids
            body = compact(
                {
                    "ok": True,
                    "payload": {
                        "state": "ready",
                        "shop_domain": request["shop_domain"],
                        "connection_id": request["connection_id"],
                        "record_count": len(record_ids),
                        "record_ids": record_ids,
                        "record_set_sha256": runner._record_set_sha256(record_ids),
                        "first_record_id": record_ids[0],
                        "last_record_id": record_ids[-1],
                        "provider_write_authority": False,
                    },
                }
            )
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        record_ids = request["record_ids"]
        batch_sha = hashlib.sha256(compact(record_ids)).hexdigest()
        created = sum(record_id not in self.seen for record_id in record_ids)
        replayed = len(record_ids) - created
        self.seen.update(record_ids)
        type(self).calls += 1
        if type(self).lose_response_on_call == type(self).calls:
            self.close_connection = True
            return
        result_sha = hashlib.sha256("\n".join(record_ids).encode()).hexdigest()
        body = compact(
            {
                "ok": True,
                "payload": {
                    "state": "succeeded",
                    "records_requested": len(record_ids),
                    "records_projected": len(record_ids),
                    "record_set_sha256": batch_sha,
                    "projection_result_sha256": result_sha,
                    "created_entities": created,
                    "created_contacts": created,
                    "replayed": replayed,
                    "provider_write_authority": False,
                },
            }
        )
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class RunnerTest(unittest.TestCase):
    def setUp(self) -> None:
        ProjectionHandler.seen = set()
        ProjectionHandler.calls = 0
        ProjectionHandler.lose_response_on_call = None
        ProjectionHandler.inspection_ids = []
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), ProjectionHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.token = self.root / "token"
        self.token.write_text("test-runtime-token\n")
        self.token.chmod(0o600)
        self.pressure = self.root / "io-pressure"
        self.pressure.write_text("some avg10=0.00 avg60=0.00 avg300=0.00 total=0\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n")
        self.pressure.chmod(0o600)

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temporary.cleanup()

    def manifest(self, count: int = 5) -> tuple[Path, str]:
        record_ids = [f"record-{index:05d}" for index in range(count)]
        value = {
            "receipt_type": runner.MANIFEST_RECEIPT,
            "receipt_version": 1,
            "shop_domain": "moonsleepco.myshopify.com",
            "connection_id": "shopify-primary",
            "record_ids": record_ids,
            "record_set_sha256": runner._record_set_sha256(record_ids),
        }
        path = self.root / "manifest.json"
        path.write_bytes(compact(value) + b"\n")
        path.chmod(0o600)
        return path, hashlib.sha256(path.read_bytes()).hexdigest()

    def args(self, manifest: Path, digest: str, checkpoint: str) -> argparse.Namespace:
        base = f"http://127.0.0.1:{self.server.server_port}"
        return argparse.Namespace(
            runtime_url=base,
            runtime_token_file=str(self.token),
            manifest=str(manifest),
            manifest_sha256=digest,
            checkpoint=str(self.root / "checkpoints" / checkpoint),
            build_manifest=False,
            shop_domain=None,
            connection_id=None,
            batch_size=2,
            sleep_ms=0,
            timeout_seconds=2.0,
            health_url=[f"{base}/health"],
            pause_marker=[],
            io_pressure_file=str(self.pressure),
            max_io_full_avg60=1.0,
            max_batches=1,
        )

    def drain(self, args: argparse.Namespace) -> dict[str, object]:
        while True:
            result = runner.run(args)
            if result["completed"]:
                return result

    def test_defaults_are_one_small_resource_gated_batch(self) -> None:
        parsed = runner.parser().parse_args(
            [
                "--runtime-url",
                "http://127.0.0.1:18789",
                "--runtime-token-file",
                "/tmp/token",
                "--manifest",
                "/tmp/manifest",
            ]
        )
        self.assertEqual(parsed.batch_size, 25)
        self.assertEqual(parsed.max_batches, 1)
        self.assertEqual(parsed.sleep_ms, 1_000)
        self.assertEqual(parsed.max_io_full_avg60, 1.0)

    def test_builds_an_immutable_manifest_from_the_public_inspection(self) -> None:
        ProjectionHandler.inspection_ids = ["record-00001", "record-00002", "record-00003"]
        placeholder, digest = self.manifest()
        output = self.root / "manifests" / "customers.json"
        args = self.args(placeholder, digest, "unused.json")
        args.build_manifest = True
        args.shop_domain = "moonsleepco.myshopify.com"
        args.connection_id = "shopify-primary"
        args.manifest = str(output)
        args.manifest_sha256 = None
        args.checkpoint = None
        built = runner.run(args)
        self.assertEqual(built["record_ids"], ProjectionHandler.inspection_ids)
        self.assertFalse(built["provider_write_authority"])
        loaded, observed_sha = runner.load_manifest(output, built["manifest_sha256"])
        self.assertEqual(loaded["record_ids"], ProjectionHandler.inspection_ids)
        self.assertEqual(observed_sha, built["manifest_sha256"])
        with self.assertRaisesRegex(runner.ProjectionError, "already exists"):
            runner.run(args)
        self.assertEqual(ProjectionHandler.calls, 0)

    def test_first_and_second_pass_are_bounded_and_duplicate_free(self) -> None:
        manifest, digest = self.manifest()
        first = self.drain(self.args(manifest, digest, "first.json"))
        self.assertTrue(first["completed"])
        self.assertEqual(first["next_index"], 5)
        self.assertEqual(len(first["batches"]), 3)
        self.assertEqual(first["totals"]["created_entities"], 5)
        self.assertEqual(first["totals"]["replayed"], 0)
        second = self.drain(self.args(manifest, digest, "second.json"))
        self.assertTrue(second["completed"])
        self.assertEqual(second["totals"]["created_entities"], 0)
        self.assertEqual(second["totals"]["created_contacts"], 0)
        self.assertEqual(second["totals"]["replayed"], 5)
        self.assertEqual(ProjectionHandler.calls, 6)

    def test_production_scale_shape_stays_within_250_record_batches(self) -> None:
        manifest, digest = self.manifest(17_090)
        args = self.args(manifest, digest, "production-shape.json")
        args.batch_size = 250
        args.max_batches = 10
        first = self.drain(args)
        self.assertTrue(first["completed"])
        self.assertEqual(first["next_index"], 17_090)
        self.assertEqual(len(first["batches"]), 69)
        self.assertTrue(all(batch["record_count"] <= 250 for batch in first["batches"]))
        self.assertEqual(first["totals"]["created_entities"], 17_090)
        replay_args = self.args(manifest, digest, "production-shape-replay.json")
        replay_args.batch_size = 250
        replay_args.max_batches = 10
        replay = self.drain(replay_args)
        self.assertTrue(replay["completed"])
        self.assertEqual(replay["totals"]["created_entities"], 0)
        self.assertEqual(replay["totals"]["replayed"], 17_090)
        self.assertEqual(ProjectionHandler.calls, 138)

    def test_lost_response_retries_only_the_uncheckpointed_batch(self) -> None:
        manifest, digest = self.manifest()
        args = self.args(manifest, digest, "resume.json")
        args.max_batches = 10
        ProjectionHandler.lose_response_on_call = 2
        with self.assertRaisesRegex(runner.ProjectionError, "projection request failed"):
            runner.run(args)
        checkpoint = json.loads(Path(args.checkpoint).read_text())
        self.assertEqual(checkpoint["next_index"], 2)
        self.assertEqual(len(checkpoint["batches"]), 1)
        ProjectionHandler.lose_response_on_call = None
        resumed = self.drain(args)
        self.assertTrue(resumed["completed"])
        self.assertEqual(resumed["totals"]["created_entities"], 3)
        self.assertEqual(resumed["totals"]["replayed"], 2)
        self.assertEqual(len(ProjectionHandler.seen), 5)

    def test_high_io_pressure_pauses_before_any_projection_call(self) -> None:
        manifest, digest = self.manifest()
        self.pressure.write_text("full avg10=12.00 avg60=15.01 avg300=8.00 total=1\n")
        with self.assertRaisesRegex(runner.ResourcePause, "I/O pressure"):
            runner.run(self.args(manifest, digest, "paused.json"))
        self.assertEqual(ProjectionHandler.calls, 0)
        self.assertFalse((self.root / "checkpoints" / "paused.json").exists())

    def test_invalid_pressure_and_corrupt_checkpoint_fail_before_projection(self) -> None:
        manifest, digest = self.manifest()
        args = self.args(manifest, digest, "corrupt.json")
        self.pressure.write_text("full avg10=0.00 avg60=nan avg300=0.00 total=0\n")
        with self.assertRaisesRegex(runner.ProjectionError, "avg60 value"):
            runner.run(args)
        self.assertEqual(ProjectionHandler.calls, 0)

        self.pressure.write_text("full avg10=0.00 avg60=0.00 avg300=0.00 total=0\n")
        args.max_batches = 1
        runner.run(args)
        checkpoint_path = Path(args.checkpoint)
        checkpoint = json.loads(checkpoint_path.read_text())
        checkpoint["next_index"] = 4
        checkpoint_path.write_bytes(compact(checkpoint) + b"\n")
        checkpoint_path.chmod(0o600)
        with self.assertRaisesRegex(runner.ProjectionError, "totals do not match"):
            runner.run(args)
        self.assertEqual(ProjectionHandler.calls, 1)

    def test_tampered_manifest_and_checkpoint_binding_fail_before_calls(self) -> None:
        manifest, digest = self.manifest()
        args = self.args(manifest, digest, "bound.json")
        args.max_batches = 1
        runner.run(args)
        raw = manifest.read_bytes()
        manifest.write_bytes(raw + b" ")
        with self.assertRaisesRegex(runner.ProjectionError, "file SHA-256"):
            runner.run(args)
        manifest.write_bytes(raw)
        manifest.chmod(0o600)
        args.batch_size = 3
        with self.assertRaisesRegex(runner.ProjectionError, "exact invocation"):
            runner.run(args)
        self.assertEqual(ProjectionHandler.calls, 1)

    def test_manifest_identity_and_runtime_transport_fail_closed(self) -> None:
        manifest, digest = self.manifest()
        value = json.loads(manifest.read_text())
        value["shop_domain"] = "MoonSleepCo.myshopify.com"
        manifest.write_bytes(compact(value) + b"\n")
        digest = hashlib.sha256(manifest.read_bytes()).hexdigest()
        with self.assertRaisesRegex(runner.ProjectionError, "shop_domain"):
            runner.run(self.args(manifest, digest, "identity.json"))

        manifest, digest = self.manifest()
        args = self.args(manifest, digest, "transport.json")
        args.runtime_url = "https://example.invalid"
        with self.assertRaisesRegex(runner.ProjectionError, "loopback HTTP"):
            runner.run(args)
        self.assertEqual(ProjectionHandler.calls, 0)


if __name__ == "__main__":
    unittest.main()

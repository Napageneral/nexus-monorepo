from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))
MODULE_PATH = SCRIPT_DIR / "shopify_commerce_projection_runner.py"
SPEC = importlib.util.spec_from_file_location("shopify_commerce_projection_runner", MODULE_PATH)
assert SPEC and SPEC.loader
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


def compact(value: object) -> bytes:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode()


class CommerceHandler(BaseHTTPRequestHandler):
    seen: set[str] = set()
    calls = 0
    lose_response_on_call: int | None = None
    inspection_ids: list[str] = []

    def log_message(self, *_args: object) -> None:
        return

    def do_GET(self) -> None:
        body = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        request = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
        if self.path.endswith(runner.INSPECT_OPERATION):
            ids = type(self).inspection_ids
            body = compact(
                {
                    "ok": True,
                    "payload": {
                        "state": "ready",
                        "shop_domain": request["shop_domain"],
                        "connection_id": request["connection_id"],
                        "record_count": len(ids),
                        "record_ids": ids,
                        "record_set_sha256": runner._record_set_sha256(ids),
                        "first_record_id": ids[0],
                        "last_record_id": ids[-1],
                        "provider_read_authority": False,
                        "provider_write_authority": False,
                    },
                }
            )
        else:
            ids = request["record_ids"]
            created = sum(value not in type(self).seen for value in ids)
            replayed = len(ids) - created
            type(self).seen.update(ids)
            type(self).calls += 1
            if type(self).lose_response_on_call == type(self).calls:
                self.close_connection = True
                return
            orders = sum("order" in value for value in ids)
            body = compact(
                {
                    "ok": True,
                    "payload": {
                        "state": "succeeded",
                        "records_requested": len(ids),
                        "records_projected": len(ids),
                        "orders_projected": orders,
                        "line_items_projected": len(ids) - orders,
                        "record_set_sha256": runner._record_set_sha256(ids),
                        "projection_result_sha256": hashlib.sha256(
                            "\n".join(ids).encode()
                        ).hexdigest(),
                        "created": created,
                        "replayed": replayed,
                        "became_current": len(ids),
                        "provider_read_authority": False,
                        "provider_write_authority": False,
                    },
                }
            )
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class CommerceRunnerTest(unittest.TestCase):
    def setUp(self) -> None:
        CommerceHandler.seen = set()
        CommerceHandler.calls = 0
        CommerceHandler.lose_response_on_call = None
        CommerceHandler.inspection_ids = []
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), CommerceHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.token = self.root / "token"
        self.token.write_text("test-token\n")
        self.token.chmod(0o600)
        self.pressure = self.root / "io-pressure"
        self.pressure.write_text("full avg10=0.00 avg60=0.00 avg300=0.00 total=0\n")
        self.pressure.chmod(0o600)

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temporary.cleanup()

    def manifest(self) -> tuple[Path, str]:
        ids = [
            "record-100-order",
            "record-101-order",
            "record-000-line",
            "record-001-line",
            "record-002-line",
        ]
        value = {
            "receipt_type": runner.MANIFEST_RECEIPT,
            "receipt_version": 1,
            "shop_domain": "moonsleepco.myshopify.com",
            "connection_id": "shopify-primary",
            "record_ids": ids,
            "record_set_sha256": runner._record_set_sha256(ids),
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
            build_manifest=False,
            shop_domain=None,
            connection_id=None,
            manifest_sha256=digest,
            checkpoint=str(self.root / "checkpoints" / checkpoint),
            batch_size=2,
            sleep_ms=0,
            timeout_seconds=2.0,
            health_url=[f"{base}/health"],
            pause_marker=[],
            io_pressure_file=str(self.pressure),
            max_io_full_avg60=1.0,
            max_batches=1,
        )

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
        self.assertEqual(parsed.sleep_ms, 1000)
        self.assertEqual(parsed.max_io_full_avg60, 1.0)

    def test_drains_incrementally_and_replays_without_new_rows(self) -> None:
        manifest, digest = self.manifest()
        args = self.args(manifest, digest, "first.json")
        first = runner.run(args)
        self.assertFalse(first["completed"])
        self.assertEqual(first["next_index"], 2)
        second = runner.run(args)
        self.assertEqual(second["next_index"], 4)
        third = runner.run(args)
        self.assertTrue(third["completed"])
        self.assertEqual(third["totals"]["created"], 5)
        self.assertEqual(third["totals"]["orders_projected"], 2)
        self.assertEqual(third["totals"]["line_items_projected"], 3)

        replay_args = self.args(manifest, digest, "replay.json")
        runner.run(replay_args)
        runner.run(replay_args)
        replay = runner.run(replay_args)
        self.assertTrue(replay["completed"])
        self.assertEqual(replay["totals"]["created"], 0)
        self.assertEqual(replay["totals"]["replayed"], 5)

    def test_lost_response_retries_only_the_uncheckpointed_batch(self) -> None:
        manifest, digest = self.manifest()
        args = self.args(manifest, digest, "lost.json")
        CommerceHandler.lose_response_on_call = 1
        with self.assertRaisesRegex(runner.ProjectionError, "projection request failed"):
            runner.run(args)
        self.assertFalse(Path(args.checkpoint).exists())
        CommerceHandler.lose_response_on_call = None
        resumed = runner.run(args)
        self.assertEqual(resumed["next_index"], 2)
        self.assertEqual(resumed["totals"]["created"], 0)
        self.assertEqual(resumed["totals"]["replayed"], 2)

    def test_resource_pressure_pauses_before_projection(self) -> None:
        manifest, digest = self.manifest()
        args = self.args(manifest, digest, "paused.json")
        self.pressure.write_text("full avg10=10.00 avg60=1.01 avg300=1.00 total=1\n")
        with self.assertRaisesRegex(runner.ResourcePause, "I/O pressure"):
            runner.run(args)
        self.assertEqual(CommerceHandler.calls, 0)
        self.assertFalse(Path(args.checkpoint).exists())

    def test_builds_manifest_from_local_nex_records_without_provider_authority(self) -> None:
        CommerceHandler.inspection_ids = ["record-000-order", "record-001-line"]
        manifest, digest = self.manifest()
        args = self.args(manifest, digest, "unused.json")
        output = self.root / "manifests" / "commerce.json"
        args.build_manifest = True
        args.shop_domain = "moonsleepco.myshopify.com"
        args.connection_id = "shopify-primary"
        args.manifest = str(output)
        args.manifest_sha256 = None
        args.checkpoint = None
        built = runner.run(args)
        self.assertEqual(built["record_ids"], CommerceHandler.inspection_ids)
        self.assertEqual(CommerceHandler.calls, 0)
        runner.load_manifest(output, built["manifest_sha256"])

    def test_tampered_manifest_and_checkpoint_binding_fail_closed(self) -> None:
        manifest, digest = self.manifest()
        args = self.args(manifest, digest, "bound.json")
        runner.run(args)
        original = manifest.read_bytes()
        manifest.write_bytes(original + b" ")
        with self.assertRaisesRegex(runner.ProjectionError, "file SHA-256"):
            runner.run(args)
        manifest.write_bytes(original)
        manifest.chmod(0o600)
        args.batch_size = 3
        with self.assertRaisesRegex(runner.ProjectionError, "exact invocation"):
            runner.run(args)
        self.assertEqual(CommerceHandler.calls, 1)


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Regenerate the JSON twins of the October fixtures the way the client normalizes YAML.

The app takes normalized JSON (it has no YAML parser at runtime): PyYAML parses each file, dates
become ISO strings, and the result is written with sorted keys. Run: python3 -I to-json.py
"""
import datetime
import json
import pathlib

import yaml

HERE = pathlib.Path(__file__).resolve().parent


def plain(value):
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key) if not isinstance(key, bool) else str(key).lower(): plain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [plain(item) for item in value]
    return value


for source in sorted(HERE.glob("*.yaml")):
    body = plain(yaml.safe_load(source.read_text(encoding="utf-8")))
    target = source.with_suffix(".json")
    target.write_text(json.dumps(body, indent=1, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    print(target.name)

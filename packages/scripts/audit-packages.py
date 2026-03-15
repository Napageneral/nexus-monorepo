#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def classify_adapter(d: Path) -> str:
    if d.name == 'nexus-adapter-sdks':
        return 'tooling'
    if (d / 'adapter.nexus.json').exists() and (d / 'scripts' / 'package-release.sh').exists():
        return 'package-shaped'
    if (d / 'go.mod').exists() or any(d.rglob('cmd/*/main.go')) or (d / 'package.json').exists():
        return 'adapter-modern-not-package-shaped'
    return 'legacy-or-unknown'


def app_manifest_roots(d: Path):
    return sorted(p.parent for p in d.rglob('app.nexus.json'))


def skill_status(manifest_path: Path) -> str:
    data = json.loads(manifest_path.read_text())
    raw = data.get('skill')
    if manifest_path.name == 'adapter.nexus.json':
        return 'not-applicable'
    if not isinstance(raw, str) or not raw.strip():
        return 'missing-skill-field'
    skill_path = manifest_path.parent / raw
    if not skill_path.exists():
        return f'missing-skill-file:{raw}'
    return 'ok'


print('ADAPTERS')
for d in sorted((ROOT / 'adapters').iterdir()):
    if not d.is_dir():
        continue
    manifest = d / 'adapter.nexus.json'
    adapter_skill = skill_status(manifest) if manifest.exists() else 'no-manifest'
    print(
        f"{d.name}\t{classify_adapter(d)}\tmanifest={manifest.exists()}\t"
        f"pkg_script={(d/'scripts'/'package-release.sh').exists()}\t"
        f"api_dir={(d/'api').exists()}\t"
        f"legacy_sdk_script={(d/'scripts'/'generate-sdk.sh').exists()}\t"
        f"legacy_sdk_dir={(d/'sdk').exists()}\tskill={adapter_skill}"
    )

print('\nAPPS')
for d in sorted((ROOT / 'apps').iterdir()):
    if not d.is_dir():
        continue
    roots = app_manifest_roots(d)
    root_labels = [str(p.relative_to(d)) for p in roots]
    skills = [f"{str(root.relative_to(d))}:{skill_status(root / 'app.nexus.json')}" for root in roots]
    print(
        f"{d.name}\tmanifest_roots={len(roots)}\t"
        f"pkg_script={(d/'scripts'/'package-release.sh').exists()}\t"
        f"roots={root_labels}\tskills={skills}"
    )

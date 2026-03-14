#!/usr/bin/env python3
from pathlib import Path
import json

PACKAGES_ROOT = Path(__file__).resolve().parents[1]
ROOT = PACKAGES_ROOT
items = []
for manifest_name, kind in [('app.nexus.json', 'app'), ('adapter.nexus.json', 'adapter')]:
    for manifest in sorted(ROOT.rglob(manifest_name)):
        package_root = manifest.parent
        family_root = None
        if kind == 'app' and package_root.parent.parent == ROOT / 'apps':
            family_root = package_root.parent
        elif kind == 'adapter' and package_root.parent == ROOT / 'adapters':
            family_root = package_root.parent
        items.append({
            'kind': kind,
            'id': json.loads(manifest.read_text()).get('id'),
            'manifest': str(manifest),
            'package_root': str(package_root),
            'family_root': str(family_root) if family_root else None,
        })
print(json.dumps(items, indent=2))

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/adapter-package-kit/package-release.sh "${ROOT_DIR}"

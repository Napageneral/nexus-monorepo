#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Package a nex app into a tarball for distribution
#
# Usage: ./scripts/package-app.sh <app-id> <source-dir> [output-dir]
#
# Example:
#   ./scripts/package-app.sh glowbot ../apps/glowbot/consumer /opt/nexus/frontdoor/apps/glowbot/1.0.0/
# ---------------------------------------------------------------------------

set -euo pipefail

APP_ID="${1:?Usage: package-app.sh <app-id> <source-dir> [output-dir]}"
SOURCE_DIR="${2:?Usage: package-app.sh <app-id> <source-dir> [output-dir]}"
OUTPUT_DIR="${3:-./dist/apps/${APP_ID}}"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "ERROR: Source directory does not exist: $SOURCE_DIR"
  exit 1
fi

if [ ! -f "$SOURCE_DIR/app.nexus.json" ]; then
  echo "ERROR: No app.nexus.json manifest found in: $SOURCE_DIR"
  exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Build the tarball — include all app package contents
cd "$SOURCE_DIR"
INCLUDES=()

# Always include manifest
INCLUDES+=("app.nexus.json")

# Include standard directories if they exist
for dir in methods hooks dist pipeline assets shared bin; do
  if [ -d "$dir" ]; then
    INCLUDES+=("$dir")
  fi
done

# Include package.json if present
if [ -f "package.json" ]; then
  INCLUDES+=("package.json")
fi

echo "Packaging app '$APP_ID' from $SOURCE_DIR"
echo "  Including: ${INCLUDES[*]}"

tar -czf "$OUTPUT_DIR/pkg.tar.gz" "${INCLUDES[@]}"

# Extract and cache manifest
cp app.nexus.json "$OUTPUT_DIR/manifest.json"

TARBALL_SIZE=$(ls -lh "$OUTPUT_DIR/pkg.tar.gz" | awk '{print $5}')
echo "  Tarball: $OUTPUT_DIR/pkg.tar.gz ($TARBALL_SIZE)"
echo "  Manifest: $OUTPUT_DIR/manifest.json"
echo "Done."

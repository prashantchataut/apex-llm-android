#!/usr/bin/env bash
# Keep the web copy of the design tokens identical to the canonical file.
set -euo pipefail
cd "$(dirname "$0")/.."
cp packages/design-system/tokens.css web-showcase/src/app/tokens.css
cp packages/design-system/haptics/haptics.ts web-showcase/src/lib/haptics.ts
echo "tokens + haptics synced"

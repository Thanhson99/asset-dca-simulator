#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

mkdir -p \
  "$ROOT_DIR/.github/workflows" \
  "$ROOT_DIR/assets/scripts/charts" \
  "$ROOT_DIR/assets/scripts/data" \
  "$ROOT_DIR/assets/scripts/ui" \
  "$ROOT_DIR/assets/styles/components" \
  "$ROOT_DIR/apps/web/public" \
  "$ROOT_DIR/apps/web/src/components" \
  "$ROOT_DIR/apps/web/src/charts" \
  "$ROOT_DIR/apps/web/src/config" \
  "$ROOT_DIR/apps/web/src/loaders" \
  "$ROOT_DIR/apps/web/src/models" \
  "$ROOT_DIR/apps/web/src/services" \
  "$ROOT_DIR/apps/web/src/simulation" \
  "$ROOT_DIR/apps/web/src/stores" \
  "$ROOT_DIR/apps/web/src/types" \
  "$ROOT_DIR/apps/web/src/utils" \
  "$ROOT_DIR/apps/web/tests" \
  "$ROOT_DIR/collector/bin" \
  "$ROOT_DIR/collector/config" \
  "$ROOT_DIR/collector/src/commands" \
  "$ROOT_DIR/collector/src/contracts" \
  "$ROOT_DIR/collector/src/data" \
  "$ROOT_DIR/collector/src/exceptions" \
  "$ROOT_DIR/collector/src/normalizers" \
  "$ROOT_DIR/collector/src/providers/stocks" \
  "$ROOT_DIR/collector/src/providers/gold" \
  "$ROOT_DIR/collector/src/repositories" \
  "$ROOT_DIR/collector/src/services" \
  "$ROOT_DIR/collector/src/support" \
  "$ROOT_DIR/collector/src/validators" \
  "$ROOT_DIR/collector/tests/unit" \
  "$ROOT_DIR/collector/tests/integration" \
  "$ROOT_DIR/collector/tests/fixtures" \
  "$ROOT_DIR/data/stocks" \
  "$ROOT_DIR/data/gold" \
  "$ROOT_DIR/data/corporate-actions" \
  "$ROOT_DIR/data/exports" \
  "$ROOT_DIR/schemas" \
  "$ROOT_DIR/scripts" \
  "$ROOT_DIR/docs"

printf '%s\n' "Project folders initialized successfully."

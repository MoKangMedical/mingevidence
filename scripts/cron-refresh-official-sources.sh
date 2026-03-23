#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/data/runtime"
LOCK_DIR="$RUNTIME_DIR/refresh-official-sources.lock"
LOG_FILE="$RUNTIME_DIR/cron-refresh-official-sources.log"

mkdir -p "$RUNTIME_DIR"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') skip: refresh-official-sources is already running" >> "$LOG_FILE"
  exit 0
fi

cleanup() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

trap cleanup EXIT

{
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] start refresh-official-sources"
  cd "$ROOT_DIR"
  pnpm refresh:official-sources
  pnpm sync:population-signals
  pnpm exec next build --webpack
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] finished refresh-official-sources"
} >> "$LOG_FILE" 2>&1

#!/bin/bash
# Cloud-session setup: install dependencies so typecheck, lint, test:domain,
# test:safety and build can run. Never prepares, migrates or resets a
# database. Does nothing outside Claude Code cloud sessions.
#
# SAFE01_PG_BIN is deliberately not set: the cloud container runs as root and
# initdb refuses root, so the PostgreSQL group of test:safety stays PENDING here.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# npm install (not ci) so the container cache keeps node_modules between runs.
npm install --no-audit --no-fund

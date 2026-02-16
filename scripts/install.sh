#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required (>=20)."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npm install
npm run build
npm link

growthclaw install --with-dispatcher-cron

echo "GrowthClaw installed. Run: growthclaw dashboard"

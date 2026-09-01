#!/usr/bin/env bash
set -euo pipefail

pnpm typecheck
pnpm lint
node --test scripts/reset-document-hero-v3.test.mjs
pnpm test -- --reporter=dot

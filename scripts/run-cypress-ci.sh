#!/usr/bin/env bash

set -Eeuo pipefail

fixture_output_dir="$(mktemp -d /tmp/admissions-cypress-fixtures.XXXXXX)"
fixture_server_log="$(mktemp /tmp/admissions-cypress-fixture-server.XXXXXX.log)"
fixture_server_pid=""
worker_request_dir=".cypress-worker-requests"

cleanup() {
  exit_status=$?
  trap - EXIT INT TERM HUP

  if [[ -n "$fixture_server_pid" ]]; then
    kill "$fixture_server_pid" 2>/dev/null || true
    wait "$fixture_server_pid" 2>/dev/null || true
  fi

  rm -f .cypress-fixture-credentials.json
  rm -rf "$fixture_output_dir"
  rm -f "$fixture_server_log"
  rm -rf "$worker_request_dir"
  exit "$exit_status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

export CYPRESS_FIXTURE_OUT_DIR="$fixture_output_dir"
rm -rf "$worker_request_dir"

./node_modules/.bin/vite build --mode cypress-fixtures
./node_modules/.bin/vite preview \
  --mode cypress-fixtures \
  --host 0.0.0.0 \
  --port 5001 \
  --strictPort \
  >"$fixture_server_log" 2>&1 &
fixture_server_pid=$!

./wait-for-it.sh -t 420 cypress-backend:5000
if ! ./wait-for-it.sh -t 60 localhost:5001; then
  cat "$fixture_server_log"
  exit 1
fi

cypress_status=0
yarn cypress:run "$@" || cypress_status=$?

if ! kill -0 "$fixture_server_pid" 2>/dev/null; then
  echo "The Cypress fixture server stopped before the test run completed."
  cat "$fixture_server_log"
  exit 1
fi

if (( cypress_status != 0 )); then
  cat "$fixture_server_log"
  exit "$cypress_status"
fi

#!/usr/bin/env bash

set -Eeuo pipefail

worker_request_dir=".cypress-worker-requests"
mkdir -p "$worker_request_dir"
shopt -s nullglob

while true; do
  worker_requests=("$worker_request_dir"/*.request)
  if (( ${#worker_requests[@]} == 0 )); then
    sleep 0.2
    continue
  fi

  for worker_request in "${worker_requests[@]}"; do
    request_token="$(basename "$worker_request" .request)"
    running_request="$worker_request_dir/$request_token.running"
    completed_request="$worker_request_dir/$request_token.done"
    completed_request_tmp="$completed_request.tmp"
    if ! mv "$worker_request" "$running_request" 2>/dev/null; then
      continue
    fi

    worker_exit_code=0
    job_id=""
    IFS= read -r job_id <"$running_request" || true
    if [[ -z "$job_id" ]]; then
      worker_exit_code=2
    else
      poetry run python manage.py run_solver_worker \
        --once \
        --job-id "$job_id" || worker_exit_code=$?
    fi
    printf '%s\n' "$worker_exit_code" >"$completed_request_tmp"
    mv "$completed_request_tmp" "$completed_request"
    rm -f "$running_request"
  done
done

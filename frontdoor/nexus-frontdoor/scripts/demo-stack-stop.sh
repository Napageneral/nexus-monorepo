#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION_NAME="${SESSION_NAME:-nexus-frontdoor-demo}"
STACK_ROOT="${ROOT_DIR}/.demo-stack"

if tmux has-session -t "${SESSION_NAME}" 2>/dev/null; then
  tmux kill-session -t "${SESSION_NAME}"
  echo "[demo-stack] stopped tmux session: ${SESSION_NAME}"
else
  echo "[demo-stack] tmux session not running: ${SESSION_NAME}"
fi

pkill -f "/scripts/demo-stack-runner.sh" 2>/dev/null || true

for pid_file in runtime.pid frontdoor.pid runtime-tunnel.pid frontdoor-tunnel.pid; do
  full="${STACK_ROOT}/${pid_file}"
  if [[ -f "${full}" ]]; then
    pid="$(cat "${full}" || true)"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      sleep 1
      kill -9 "${pid}" 2>/dev/null || true
    fi
    rm -f "${full}"
  fi
done

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION_NAME="${SESSION_NAME:-nexus-frontdoor-demo}"
STACK_ROOT="${ROOT_DIR}/.demo-stack"
STACK_ENV="${STACK_ROOT}/stack.env"

if tmux has-session -t "${SESSION_NAME}" 2>/dev/null; then
  echo "[demo-stack] tmux session: running (${SESSION_NAME})"
else
  echo "[demo-stack] tmux session: stopped (${SESSION_NAME})"
fi

for name in runtime frontdoor runtime-tunnel frontdoor-tunnel; do
  pid_file="${STACK_ROOT}/${name}.pid"
  if [[ -f "${pid_file}" ]]; then
    pid="$(cat "${pid_file}" || true)"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      echo "[demo-stack] ${name}: up (pid=${pid})"
    else
      echo "[demo-stack] ${name}: down (stale pid=${pid:-none})"
    fi
  else
    echo "[demo-stack] ${name}: unknown (no pid file)"
  fi
done

if [[ -f "${STACK_ENV}" ]]; then
  echo "[demo-stack] stack env:"
  cat "${STACK_ENV}"
else
  echo "[demo-stack] stack env: missing"
fi

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION_NAME="${SESSION_NAME:-nexus-frontdoor-demo}"
RUNNER="${ROOT_DIR}/scripts/demo-stack-runner.sh"
STACK_ENV="${ROOT_DIR}/.demo-stack/stack.env"
STACK_ROOT="${ROOT_DIR}/.demo-stack"

if [[ ! -x "${RUNNER}" ]]; then
  chmod +x "${RUNNER}"
fi

if tmux has-session -t "${SESSION_NAME}" 2>/dev/null; then
  echo "[demo-stack] tmux session already running: ${SESSION_NAME}"
else
  rm -f "${STACK_ENV}" "${STACK_ROOT}/runtime.pid" "${STACK_ROOT}/frontdoor.pid" \
    "${STACK_ROOT}/runtime-tunnel.pid" "${STACK_ROOT}/frontdoor-tunnel.pid"
  tmux new-session -d -s "${SESSION_NAME}" "bash -lc '${RUNNER}'"
  echo "[demo-stack] started tmux session: ${SESSION_NAME}"
fi

for _ in $(seq 1 180); do
  if ! tmux has-session -t "${SESSION_NAME}" 2>/dev/null; then
    echo "[demo-stack] tmux session exited before readiness: ${SESSION_NAME}"
    exit 1
  fi
  if [[ -f "${STACK_ENV}" ]] && rg -q '^FRONTDOOR_TUNNEL_URL=https://' "${STACK_ENV}" && rg -q '^RUNTIME_TUNNEL_URL=https://' "${STACK_ENV}"; then
    break
  fi
  sleep 1
done

if [[ -f "${STACK_ENV}" ]]; then
  echo "[demo-stack] stack env:"
  cat "${STACK_ENV}"
else
  echo "[demo-stack] stack did not become ready in time"
  echo "[demo-stack] inspect logs via: tmux capture-pane -pt ${SESSION_NAME}"
  exit 1
fi

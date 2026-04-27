#!/usr/bin/env bash
set -uo pipefail
exec > >(tee /artifacts/validation/cleanroom/operator-chat-cleanroom/20260407T132922Z/stdout.log)
exec 2> >(tee /artifacts/validation/cleanroom/operator-chat-cleanroom/20260407T132922Z/stderr.log >&2)
cd /nex
cmd=( bash /nex/scripts/e2e/operator-chat-cleanroom-recorded-runner.sh )
printf "[visual-terminal] running: "
printf "%q " "${cmd[@]}"
printf "\n"
set +e
"${cmd[@]}"
status=$?
set -e
printf "%s\n" "$status" > /artifacts/validation/cleanroom/operator-chat-cleanroom/20260407T132922Z/review/visual-terminal-exit-code.txt
exit "$status"

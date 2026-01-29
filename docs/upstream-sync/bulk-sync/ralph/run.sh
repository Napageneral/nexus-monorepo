#!/bin/bash
set -e

# Ralph Wiggum Loop Runner
# "I'm helping!"

RALPH_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKTREE_DIR="$(dirname "$(dirname "$RALPH_DIR")")"
STATE_FILE="$RALPH_DIR/state.json"
LOGS_DIR="$RALPH_DIR/logs"
PROMPTS_DIR="$RALPH_DIR/prompts"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Task definitions (match PRD.md)
TASKS=(
  "task-00:Gateway Schema Split"
  "task-01:Gateway Server Core"
  "task-02:Gateway New Features"
  "task-03:Agents Auth Profiles"
  "task-04:Agents Tool Registry"
  "task-05:Agents CLI Runner"
  "task-06:Agents Multi-Agent Scope"
  "task-07:Skills Metadata"
  "task-08:Build Verification"
  "task-09:Branding Sweep"
  "task-10:Commit & Document"
)

# Ensure dirs exist
mkdir -p "$LOGS_DIR"

# Initialize state if missing
if [[ ! -f "$STATE_FILE" ]]; then
  echo '{"current_task": 0, "completed": [], "skipped": [], "started_at": null, "last_run": null}' > "$STATE_FILE"
fi

show_status() {
  echo -e "${BLUE}═══════════════════════════════════════════${NC}"
  echo -e "${BLUE}  🐾 Ralph Wiggum Bulk Sync Runner${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════${NC}"
  echo ""
  
  CURRENT=$(jq -r '.current_task' "$STATE_FILE")
  COMPLETED=$(jq -r '.completed | length' "$STATE_FILE")
  
  echo -e "Progress: ${GREEN}$COMPLETED${NC}/${#TASKS[@]} tasks"
  echo ""
  
  for i in "${!TASKS[@]}"; do
    IFS=':' read -r task_id task_name <<< "${TASKS[$i]}"
    
    if jq -e ".completed | index(\"$task_id\")" "$STATE_FILE" > /dev/null 2>&1; then
      echo -e "  ${GREEN}✓${NC} $task_id: $task_name"
    elif jq -e ".skipped | index(\"$task_id\")" "$STATE_FILE" > /dev/null 2>&1; then
      echo -e "  ${YELLOW}○${NC} $task_id: $task_name (skipped)"
    elif [[ $i -eq $CURRENT ]]; then
      echo -e "  ${BLUE}▶${NC} $task_id: $task_name ${YELLOW}← current${NC}"
    else
      echo -e "  ${RED}·${NC} $task_id: $task_name"
    fi
  done
  echo ""
}

run_task() {
  CURRENT=$(jq -r '.current_task' "$STATE_FILE")
  
  if [[ $CURRENT -ge ${#TASKS[@]} ]]; then
    echo -e "${GREEN}🎉 All tasks complete!${NC}"
    exit 0
  fi
  
  IFS=':' read -r TASK_ID TASK_NAME <<< "${TASKS[$CURRENT]}"
  PROMPT_FILE="$PROMPTS_DIR/$TASK_ID.md"
  LOG_FILE="$LOGS_DIR/$TASK_ID.log"
  
  echo -e "${BLUE}═══════════════════════════════════════════${NC}"
  echo -e "${BLUE}  🐾 Running: $TASK_ID - $TASK_NAME${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════${NC}"
  echo ""
  
  # Check if prompt exists
  if [[ ! -f "$PROMPT_FILE" ]]; then
    echo -e "${YELLOW}⚠️  No prompt file: $PROMPT_FILE${NC}"
    echo -e "${YELLOW}   Create it or run: $0 skip${NC}"
    exit 1
  fi
  
  # Show prompt
  echo -e "${BLUE}Prompt:${NC}"
  echo "---"
  cat "$PROMPT_FILE"
  echo "---"
  echo ""
  
  # Update state with start time
  jq ".last_run = \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"" "$STATE_FILE" > tmp.json && mv tmp.json "$STATE_FILE"
  
  echo -e "${YELLOW}📋 Copy the prompt above and run it in your AI agent.${NC}"
  echo -e "${YELLOW}   Working directory: $WORKTREE_DIR${NC}"
  echo ""
  echo -e "When done, run one of:"
  echo -e "  ${GREEN}$0 done${NC}    - Mark task complete and advance"
  echo -e "  ${YELLOW}$0 skip${NC}    - Skip this task"
  echo -e "  ${BLUE}$0 status${NC}  - Show current status"
}

mark_done() {
  CURRENT=$(jq -r '.current_task' "$STATE_FILE")
  IFS=':' read -r TASK_ID TASK_NAME <<< "${TASKS[$CURRENT]}"
  
  # Add to completed, increment current
  jq ".completed += [\"$TASK_ID\"] | .current_task = $((CURRENT + 1))" "$STATE_FILE" > tmp.json && mv tmp.json "$STATE_FILE"
  
  echo -e "${GREEN}✓ Completed: $TASK_ID - $TASK_NAME${NC}"
  
  NEXT=$((CURRENT + 1))
  if [[ $NEXT -lt ${#TASKS[@]} ]]; then
    IFS=':' read -r NEXT_ID NEXT_NAME <<< "${TASKS[$NEXT]}"
    echo -e "${BLUE}▶ Next: $NEXT_ID - $NEXT_NAME${NC}"
  else
    echo -e "${GREEN}🎉 All tasks complete!${NC}"
  fi
}

skip_task() {
  CURRENT=$(jq -r '.current_task' "$STATE_FILE")
  IFS=':' read -r TASK_ID TASK_NAME <<< "${TASKS[$CURRENT]}"
  
  # Add to skipped, increment current
  jq ".skipped += [\"$TASK_ID\"] | .current_task = $((CURRENT + 1))" "$STATE_FILE" > tmp.json && mv tmp.json "$STATE_FILE"
  
  echo -e "${YELLOW}○ Skipped: $TASK_ID - $TASK_NAME${NC}"
}

reset_state() {
  echo '{"current_task": 0, "completed": [], "skipped": [], "started_at": null, "last_run": null}' > "$STATE_FILE"
  echo -e "${YELLOW}🔄 State reset${NC}"
}

# Main
case "${1:-run}" in
  status)
    show_status
    ;;
  run)
    show_status
    run_task
    ;;
  done)
    mark_done
    ;;
  skip)
    skip_task
    ;;
  reset)
    reset_state
    ;;
  *)
    echo "Usage: $0 [status|run|done|skip|reset]"
    echo ""
    echo "Commands:"
    echo "  status  - Show current progress"
    echo "  run     - Show current task prompt (default)"
    echo "  done    - Mark current task complete"
    echo "  skip    - Skip current task"
    echo "  reset   - Reset all progress"
    ;;
esac

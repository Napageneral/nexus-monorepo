// One vocabulary on every surface (ax principle 10). Step states are what people read; run_state is
// the engine's own acceptance bookkeeping for the step's current engine Run.

export const STEP_STATES = [
  "planned",
  "waiting",
  "held",
  "running",
  "verifying",
  "done",
  "short",
  "skipped",
  "cancelled",
  "adopted",
  "observing",
] as const;
export type StepState = (typeof STEP_STATES)[number];

export const FINAL_STEP_STATES: ReadonlySet<StepState> = new Set(["done", "short", "skipped", "cancelled", "adopted"]);

export const RUN_STATES = ["none", "accepting", "accepted", "claimed", "finished"] as const;
export type RunState = (typeof RUN_STATES)[number];

export const SERIES_STATES = ["draft", "awaiting_ok", "observing", "active", "paused", "done"] as const;
export type SeriesState = (typeof SERIES_STATES)[number];

export const OWNERS = ["engine", "review_sender", "mac", "task"] as const;
export type Owner = (typeof OWNERS)[number];

export const MODES = ["live", "shadow", "observe", "adopted"] as const;
export type Mode = (typeof MODES)[number];

// Step types the engine itself executes in this release. Every other engine-owned step waits,
// "because P2 not released" (or the phase that brings it).
export const PHASE_OF_DO: Record<string, "P1b" | "P2" | "P3" | "P5"> = {
  observe: "P1b",
  wait_until: "P2",
  wait_for: "P2",
  assert: "P2",
  arm_flows: "P2",
  send_flow_event: "P2",
  verify_delivery: "P2",
  approval: "P2",
  issue_codes: "P2",
  spawn: "P2",
  desk_handoff: "P2",
  promote_alternates: "P2",
  notify: "P2",
  task: "P2",
  free_entry_intake: "P3",
  draw: "P3",
  agent: "P5",
};
export const RELEASE_PHASE = "P1b";
export const PHASE_DATES: Record<string, string> = {
  P2: "Fri 10/30",
  P3: "about 11/6",
  P4: "about 11/18",
  P5: "after the Nex agent fence",
};

/** "waiting (because P2 not released)" and its friends: every non-final state carries its because. */
export function stateLabel(state: string, because?: string | null, holdCode?: string | null): string {
  if (state === "held") return `held ${holdCode ?? "hold.manual"}`;
  if (state === "waiting" && because) return `waiting (because ${because})`;
  if (state === "observing" && because) return `observing (${because})`;
  return state;
}

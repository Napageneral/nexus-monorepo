export type LoopRow = {
  open_loop_id: string;
  title: string;
  summary: string;
  lifecycle: string;
  labels: string[];
  owner?: string;
  follow_up_at?: string;
  last_activity_at: string;
  evidence_source_record_ids: string[];
  closure_source_record_ids: string[];
};

export type QueueSection = {
  id: "attention" | "partner" | "reviewed";
  label: string;
  loops: LoopRow[];
};

export function queueSections(projection: Record<string, unknown>): QueueSection[] {
  const rows = (key: string) => Array.isArray(projection[key]) ? projection[key] as LoopRow[] : [];
  return [
    { id: "attention", label: "Needs MoonSleep", loops: rows("attention_queue") },
    { id: "partner", label: "Waiting on partner", loops: rows("waiting_on_partner") },
    { id: "reviewed", label: "All reviewed loops", loops: rows("reviewed_loops") },
  ];
}

export function compactDate(value: string | undefined): string {
  if (!value) return "No follow-up date";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Invalid date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

export function lifecycleLabel(value: string): string {
  return ({
    open: "Open",
    waiting_on_partner: "Waiting on partner",
    waiting_on_moonsleep: "MoonSleep action",
    blocked: "Blocked",
    resolved: "Resolved",
    superseded: "Superseded",
    dismissed: "Dismissed",
  } as Record<string, string>)[value] ?? value.replaceAll("_", " ");
}

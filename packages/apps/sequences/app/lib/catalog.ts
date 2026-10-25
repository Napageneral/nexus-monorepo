// The ops sources routes a definition may name (never SQL), by release phase. A definition that
// names a planned route is PENDING (check.source_route_missing) until that route ships; a name in
// neither list is an ERROR (check.source_unknown).

export const SOURCES_BASE_URL = "https://ops.moonsleep.co/api/sequences/sources";
export const SOURCES_CONTRACT = "sequences_sources_v1";

/** Released with the P1b ops API train (B1): read-only, hashes and counts only. */
export const RELEASED_SOURCE_ROUTES: Record<string, { params: string[]; what: string }> = {
  health: { params: [], what: "the probe target: proves worker reach to the ops API" },
  entries: { params: ["night", "deadline", "explain"], what: "a night group's drawing entrants (SQL lifted verbatim from draw_group.py:74-101)" },
  invitations: { params: ["night"], what: "night ask and follow-up invitation counts (the email monitor's GROUP_LEDGER_SQL)" },
  "klaviyo-campaigns": { params: ["name"], what: "a Klaviyo campaign by exact name (optional in P1b, §8 R-14)" },
};

/** Named in the October definition; they arrive with P2's routes. */
export const PLANNED_SOURCE_ROUTES: Record<string, string> = {
  standing_exclusions: "P2",
  exclusions: "P2",
  survey_respondents_and_ask_lists: "P2",
  refunds: "P2",
  desk_complaints: "P2",
  team_addresses: "P2",
  contacts: "P2",
  fence: "P2",
  customers: "P4",
};

/** Not ops routes: read from the engine's own store. */
export const INTERNAL_SOURCES = new Set(["ledger"]);

export function sourceRouteStatus(name: string): "released" | "planned" | "internal" | "unknown" {
  if (name in RELEASED_SOURCE_ROUTES) return "released";
  if (name in PLANNED_SOURCE_ROUTES) return "planned";
  if (INTERNAL_SOURCES.has(name)) return "internal";
  return "unknown";
}

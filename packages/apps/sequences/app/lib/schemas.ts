// The app's four JSON Schemas (draft 2020-12). They live here as values so the bundled method
// handler carries them; schema/*.json are the same objects written out for editors and for
// `seqctl help output`, and schemas.test.ts fails if a file and its value ever differ.
// No property anywhere is named `kind` (NX-P17): the step-type field is `do`.
import type { JsonSchema } from "./validate.js";

const DRAFT = "https://json-schema.org/draft/2020-12/schema";
const ID_BASE = "https://nex.moonsleep.co/apps/sequences/schema";

const NAME = "^[a-z][a-z0-9-]{1,62}$";
const STEP_ID = "^[a-z][a-z0-9_]{0,62}$";
const KEY = "^[a-z][a-z0-9_]{0,62}$";
const DATE = "^\\d{4}-\\d{2}-\\d{2}$";
const ISO_UTC = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|\\+00:00)$";
const DURATION = "^\\d+\\s*(s|m|h|d|days?)$";
const PERCENT = "^\\d{1,3}(\\.\\d+)?%$";
const PERCENT_OR_ALL = "^(\\d{1,3}(\\.\\d+)?%|all)$";
const WINDOW = "^\\d{2}:\\d{2}(:\\d{2})?-\\d{2}:\\d{2}(:\\d{2})?$";
const HEX64 = "^[0-9a-f]{64}$";
const ENTRY_ID = "^e_[0-9a-f]{16}$";

const str = (description: string, extra: JsonSchema = {}): JsonSchema => ({ type: "string", description, ...extra });
const list = (items: JsonSchema, description: string, extra: JsonSchema = {}): JsonSchema => ({ type: "array", items, description, ...extra });
const oneOrMany = (items: JsonSchema, description: string): JsonSchema => ({ anyOf: [items, { type: "array", items, minItems: 1 }], description });
const looseObject = (description: string): JsonSchema => ({ type: "object", description, additionalProperties: true });

// ---- sequence-v1 ----------------------------------------------------------------------------------

const lateSchema: JsonSchema = {
  type: "object",
  description: "What happens when the step runs past its time: hold (stop, alert, wait for a person), late_copy (switch to the message's `late` variant), run (draws), skip (only if declared).",
  additionalProperties: false,
  properties: {
    grace: str("How long after due_at before the step counts as late (A1).", { pattern: DURATION, default: "10m", examples: ["10m", "15m"] }),
    then: { enum: ["hold", "late_copy", "run", "skip"], default: "hold" },
    after_that: { enum: ["hold", "skip"], description: "After the late copy's own window has passed." },
  },
};

const afterItem: JsonSchema = str("A step id, optionally followed by ' settled' (the step reached its settle gate).", {
  pattern: "^[a-z][a-z0-9_]*( settled)?$",
  examples: ["draw_1", "winner_note_1 settled"],
});

const COMMON_STEP: Record<string, JsonSchema> = {
  id: str("Short snake_case step id, unique in the sequence.", { pattern: STEP_ID }),
  title: str("Optional words for people."),
  description: str("Optional notes."),
  after: oneOrMany(afterItem, "Steps that must meet their target first (or end partial with on_partial: continue)."),
  after_any: list(str("<step>.<outcome>", { pattern: "^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)?$" }), "An OR over outcomes."),
  when: str("A guard on upstream outputs, e.g. \"promote.alternate != null\"."),
  at: str("When the step is due, in the sequence's timezone: 'night+N HH:MM[:SS]', 'YYYY-MM-DD HH:MM', '<step>.first_post + 24h' or '<instant> + N days HH:MM:SS'.", {
    examples: ["night 19:30", "night+1 08:00", "notice.delivered_at(winner)"],
  }),
  not_before: str("Earliest start, same time grammar as `at`."),
  not_after: str("Latest start; kernel retries stop here."),
  window: str("Wall-clock window on the due day, e.g. 19:17-23:00.", { pattern: WINDOW }),
  late: lateSchema,
  gate: { enum: ["tyler", "casey"], description: "A per-step go (P2)." },
};

function stepDef(doName: string, description: string, specific: Record<string, JsonSchema>, required: string[] = [], outputs: string[] = []): JsonSchema {
  return {
    type: "object",
    description,
    additionalProperties: false,
    required: ["id", "do", ...required],
    properties: { ...COMMON_STEP, do: { const: doName }, ...specific },
    "x-outputs": outputs,
  };
}

const audienceSchema: JsonSchema = {
  anyOf: [
    str("Another step's output, e.g. draw_1.winners.", { pattern: "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$" }),
    list(str("<step>.<output>"), "Explicit people from step outputs."),
    looseObject("An audience rule (rule, members_of, has_review, us_only, band, limit…), resolved by an ops sources route."),
  ],
  description: "Who receives the message.",
};

const excludeSchema: JsonSchema = oneOrMany(str("An exclude set name, a source name, or consent_only (unsubscribed and suppressed only; ruled for winner notes).", { pattern: KEY }), "Every send declares exclude.");

const expectSchema: JsonSchema = {
  type: "object",
  description: "Expected audience: {count, within} or {at_most}. Outside it the step holds and asks (A9).",
  additionalProperties: false,
  properties: {
    count: { anyOf: [{ type: "integer", minimum: 0 }, str("A param name, e.g. limit.", { pattern: KEY })] },
    within: str("Tolerance, e.g. 5%.", { pattern: PERCENT }),
    at_most: { type: "integer", minimum: 0, description: "For audiences derived from entrants or drawings; anything up to N never re-asks." },
  },
};

const targetSchema: JsonSchema = {
  type: "object",
  description: "What counts as done, from provider or database truth.",
  additionalProperties: false,
  properties: {
    accepted: str("e.g. 95%", { pattern: PERCENT_OR_ALL }),
    delivered: str("e.g. 99% or all", { pattern: PERCENT_OR_ALL }),
  },
};

const STEP_DEFS: Record<string, JsonSchema> = {
  do_assert: stepDef("assert", "Preconditions that fail closed (dependents hold, A8).", { checks: list(str("A named check or an expression like 'night <= last_night'."), "Checks.", { minItems: 1 }) }, ["checks"], ["passed", "evidence"]),
  do_send_flow_event: stepDef(
    "send_flow_event",
    "One approved email to every person in a frozen audience, one Klaviyo event each to the message's own one-email flow.",
    {
      message: str("A key of messages.", { pattern: KEY }),
      audience: audienceSchema,
      exclude: excludeSchema,
      fence: looseObject("Contact fences, e.g. {review_email: 24h, quiet_days: 7}."),
      fills: { type: "object", description: "Per-person or per-send fills: a time expression, a step output or a literal.", additionalProperties: { type: ["string", "number", "boolean"] } },
      expect: expectSchema,
      target: targetSchema,
      on_partial: { enum: ["continue", "block"], description: "continue lets dependents run on a partial result; block holds them." },
    },
    ["message"],
    ["first_post", "posted", "received", "winners_reached", "delivered_at"],
  ),
  do_free_entry_intake: stepDef(
    "free_entry_intake",
    "Free (AMOE) entries for a drawing window from the server's mailbox capture (P3; the Mac this week).",
    {
      subject_has: str("Subject filter."),
      between: { type: "array", prefixItems: [str("start"), str("end")], minItems: 2, maxItems: 2, description: "The intake window, two time expressions." },
      from_members_of: str("Only members of this step's audience count.", { pattern: STEP_ID }),
    },
    [],
    ["free_hashes", "count"],
  ),
  do_draw: stepDef(
    "draw",
    "Commit-reveal drand quicknet drawing of winners and alternates (the draw_group.py v3 method).",
    {
      closes: str("Entries close (must be before `at`)."),
      entrants: {
        type: "object",
        additionalProperties: false,
        properties: {
          members_of: str("The step whose audience may enter.", { pattern: STEP_ID }),
          reviews: { enum: ["first_submission_after_own_invitation"] },
          free_entries: list(str("A free_entry_intake step.", { pattern: STEP_ID }), "Intake steps whose entries count (drawing-1 free entrants carry over)."),
        },
      },
      exclude: excludeSchema,
      pick: {
        type: "object",
        additionalProperties: false,
        required: ["winners"],
        properties: { winners: { type: "integer", minimum: 1, maximum: 100 }, alternates: { type: "integer", minimum: 0, maximum: 100 } },
      },
      beacon: {
        type: "object",
        additionalProperties: false,
        properties: { drand: { enum: ["quicknet"] }, round_after: str("e.g. 90s", { pattern: DURATION }) },
      },
    },
    ["closes", "entrants", "pick"],
    ["winners", "alternates", "non_winners", "entries", "entry_list_sha256"],
  ),
  do_spawn: stepDef(
    "spawn",
    "One child sequence per item (for example a prize claim per winner).",
    {
      sequence: str("The child sequence name.", { pattern: NAME }),
      each: str("<step>.<output> giving the items.", { pattern: "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$" }),
      params: { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } },
    },
    ["sequence"],
    ["children"],
  ),
  do_approval: stepDef(
    "approval",
    "Waits for an identity-bound decision on an exact digest (series go, money, resend, promotion).",
    {
      who: { enum: ["tyler", "casey"] },
      for: { enum: ["go", "money", "resend", "promotion", "reconfirm", "words"] },
      shows: looseObject("What the approval prints."),
      ask_by: str("Reminder time; A6 follows from it."),
    },
    ["who"],
    ["decision", "decided_at"],
  ),
  do_issue_codes: stepDef(
    "issue_codes",
    "Single-use Shopify discount codes through the ops API (P2).",
    { via: { enum: ["ops_api"] }, for: str("Who gets a code."), exclude: excludeSchema, code: looseObject("Code terms: off, on, single_use, expires, tag…") },
    ["code"],
    ["holders", "code", "expires_on"],
  ),
  do_wait_until: stepDef("wait_until", "Waits for a clock time or another step's result.", {}, ["at"], ["at", "bounced"]),
  do_wait_for: stepDef(
    "wait_for",
    "Waits for a condition until a deadline, evaluated by the tick at the declared poll.",
    {
      poll: str("e.g. 15m", { pattern: DURATION }),
      until: list(str("A named condition."), "Any of these ends the wait.", { minItems: 1 }),
      deadline: str("Time expression."),
      on_deadline: str("The outcome at the deadline, e.g. expired.", { pattern: KEY }),
    },
    ["until"],
    ["outcome"],
  ),
  do_desk_handoff: stepDef(
    "desk_handoff",
    "Opens a Customer Service row (prize claim) carrying a printed $0 draft order for Tyler's approval (P2).",
    { row: { enum: ["prize_claim"] }, closes: str("Time expression.") },
    ["row"],
    ["state", "closes"],
  ),
  do_notify: stepDef("notify", "An internal alert or reminder to Tyler (or Casey for copy and flow issues). Never to customers.", {}, [], []),
  do_promote_alternates: stepDef("promote_alternates", "Hands an unclaimed, ineligible or bounced prize to the next alternate (gated).", {}, [], ["alternate"]),
  do_task: stepDef(
    "task",
    "Hand work with a verify read, so everything that gates a send is on the timeline.",
    {
      owner: { enum: ["casey", "tyler", "agent", "desk"] },
      due: str("Time expression."),
      what: str("What the person does."),
      evidence: { enum: ["url", "text", "read"] },
      verify: str("The read route that proves it is done."),
      guards: list(str("A step id.", { pattern: STEP_ID }), "Steps this task gates."),
    },
    ["owner", "what"],
    ["done_at", "evidence"],
  ),
  do_arm_flows: stepDef("arm_flows", "Turns each message's flow live once per series at activation (P2).", { messages: list(str("A message key.", { pattern: KEY }), "Messages to arm.") }, [], ["armed"]),
  do_agent: stepDef("agent", "A bounded agent step that only proposes (P5).", { output_schema: str("The proposal schema, e.g. steward-v1."), budget_usd: { type: "number", minimum: 0 } }, [], ["proposal"]),
};

const DO_NAMES = Object.keys(STEP_DEFS).map((key) => key.slice(3));

const messageSchema: JsonSchema = {
  type: "object",
  description: "One approved email: Casey's words, its own metric and its own one-email flow.",
  additionalProperties: false,
  required: ["template", "sha256", "metric", "consent"],
  properties: {
    template: str("The template key in email-templates/flows.", { pattern: "^[a-z0-9][a-z0-9-]{1,80}$" }),
    sha256: str("The approved copy sha256; `observed` for a message only the Mac or the review sender sends; filled by `seqctl check --fill`."),
    campaign_name: str("For an observed Mac message: its exact Klaviyo campaign name, with {night} and {n} fills."),
    flow: str("For an observed review-sender message: its Klaviyo flow id."),
    metric: str("The message's own Klaviyo metric.", { pattern: KEY }),
    consent: { enum: ["transactional", "marketing", "review_reach", "consent_only"] },
    says: { type: "object", description: "Time words in the copy and the wall-clock window each is true in.", additionalProperties: str("HH:MM-HH:MM", { pattern: WINDOW }) },
    late: str("The message used past the says-window (its own metric and flow).", { pattern: KEY }),
    promises: list(
      { type: "object", additionalProperties: false, required: ["step", "by"], properties: { says: str("The promise in the copy."), step: str("The step that keeps it.", { pattern: STEP_ID }), by: str("Time expression.") } },
      "Customer promises the plan must keep.",
    ),
    states: list(
      { type: "object", additionalProperties: false, required: ["needs"], properties: { says: str("The stated fact."), needs: str("The step that makes it true.", { pattern: STEP_ID }) } },
      "Facts the copy states (EM-1 / P7).",
    ),
    fills: list(str("Fill name.", { pattern: KEY }), "Typed fills the copy takes."),
    description: str("Notes."),
  },
};

export const SEQUENCE_SCHEMA: JsonSchema = {
  $schema: DRAFT,
  $id: `${ID_BASE}/sequence-v1.json`,
  title: "Sequence definition (sequences/<name>.yaml, normalized to JSON)",
  type: "object",
  additionalProperties: false,
  required: ["sequence", "steps"],
  properties: {
    sequence: str("The sequence name.", { pattern: NAME }),
    revision: { type: "integer", minimum: 1, description: "Set at registration; revision n+1 for an edit." },
    title: str("Words for people."),
    description: str("Notes."),
    timezone: str("IANA zone for every time in the file.", { default: "America/Chicago" }),
    program: str("The rules owner, e.g. reviews.", { pattern: KEY }),
    needs: {
      type: "object",
      additionalProperties: false,
      properties: {
        rules_page: { type: "object", additionalProperties: false, required: ["url"], properties: { url: str("The public rules page.", { pattern: "^https://" }), content_sha256: str("Filled by `seqctl check --fill`.") } },
        entry_window_utc: { type: "array", prefixItems: [str("opens", { pattern: ISO_UTC }), str("closes", { pattern: ISO_UTC })], minItems: 2, maxItems: 2 },
        last_night: str("The last group night the rules allow.", { pattern: DATE }),
        prize_scope: str("One prize per person across this scope.", { pattern: NAME }),
      },
    },
    params: { type: "object", description: "Instance params and their types.", additionalProperties: false, patternProperties: { [KEY]: { enum: ["date", "datetime", "int", "string", "entry_ref", "step_ref"] } } },
    sources: {
      type: "object",
      description: "Named ops sources routes; sha + count + as_of are kept on every step that reads one.",
      additionalProperties: false,
      patternProperties: {
        [KEY]: {
          type: "object",
          additionalProperties: false,
          required: ["from"],
          properties: { from: str("The ops sources route name (never SQL).", { pattern: "^[a-z][a-z0-9_-]{0,62}$" }), max_age: str("e.g. 24h", { pattern: DURATION }), warn_before_due: str("e.g. 2h", { pattern: DURATION }), scope: str("e.g. prize_scope", { pattern: KEY }) },
        },
      },
    },
    exclude_sets: { type: "object", additionalProperties: false, patternProperties: { [KEY]: list(str("A source name.", { pattern: KEY }), "Sources whose people are excluded.", { minItems: 1 }) } },
    messages: { type: "object", additionalProperties: false, patternProperties: { [KEY]: { $ref: "#/$defs/message" } } },
    defaults: {
      type: "object",
      additionalProperties: false,
      properties: {
        owner: { enum: ["engine", "review_sender", "mac", "task"], default: "engine" },
        send: {
          type: "object",
          additionalProperties: false,
          properties: {
            window: str("Default send window.", { pattern: WINDOW, default: "09:00-21:00" }),
            consent_check: { enum: ["klaviyo"] },
            settle: list(str("Read offsets.", { pattern: DURATION }), "Delivery reads after a send."),
            settle_gate: str("The read that `X settled` waits for.", { pattern: DURATION, default: "30m" }),
            shard: { type: "integer", minimum: 1, maximum: 250 },
            fence: looseObject("Default contact fences."),
          },
        },
        late: lateSchema,
      },
    },
    steps: { type: "array", minItems: 1, items: { $ref: "#/$defs/step" } },
  },
  $defs: {
    message: messageSchema,
    step: {
      type: "object",
      required: ["id", "do"],
      properties: { do: { enum: DO_NAMES, description: "The step type (never `kind`, NX-P17)." } },
      allOf: DO_NAMES.map((name) => ({ if: { properties: { do: { const: name } }, required: ["do"] }, then: { $ref: `#/$defs/do_${name}` } })),
    },
    ...STEP_DEFS,
  },
};

// ---- series-v1 ------------------------------------------------------------------------------------

const ownerList: JsonSchema = {
  anyOf: [
    list(str("A step id.", { pattern: STEP_ID }), "Steps this owner runs."),
    { type: "object", additionalProperties: false, required: ["steps"], properties: { steps: list(str("A step id.", { pattern: STEP_ID }), "Steps."), runbook: str("The owner's exact hand mechanism, printed by explain and repair.") } },
  ],
};

const instanceStepRef = str("<instance>.<step>", { pattern: "^[a-z][a-z0-9_]{0,30}\\.[a-z][a-z0-9_]{0,62}$" });

export const SERIES_SCHEMA: JsonSchema = {
  $schema: DRAFT,
  $id: `${ID_BASE}/series-v1.json`,
  title: "Series file (sequences/series/<slug>.yaml, normalized to JSON)",
  type: "object",
  additionalProperties: false,
  required: ["series", "instances"],
  anyOf: [{ required: ["sequence"] }, { required: ["from"] }],
  properties: {
    series: str("The series slug.", { pattern: "^[a-z0-9][a-z0-9-]{1,62}$" }),
    sequence: str("<sequence>@<revision>", { pattern: "^[a-z][a-z0-9-]{1,62}@\\d+$" }),
    from: str("<template>@<version> (templates arrive with seqctl new).", { pattern: "^[a-z][a-z0-9-]{1,62}@\\d+$" }),
    title: str("Words for people."),
    instances: list(
      { type: "object", required: ["id"], properties: { id: str("Instance id, e.g. g1.", { pattern: "^[a-z][a-z0-9_]{0,30}$" }) }, additionalProperties: { type: ["string", "integer", "number", "boolean"] } },
      "One instance per group; every other key is a param.",
      { minItems: 1, maxItems: 100 },
    ),
    owners: { type: "object", additionalProperties: false, properties: { engine: ownerList, review_sender: ownerList, mac: ownerList, task: ownerList } },
    adopt: str("What the import adopts, in words."),
    replan: {
      type: "object",
      additionalProperties: false,
      patternProperties: { [STEP_ID]: { type: "object", additionalProperties: false, properties: { at: str("Absolute CT time."), ask_by: str("Absolute CT time."), not_before: str("Absolute CT time."), not_after: str("Absolute CT time.") } } },
    },
    approvals: looseObject("Who approves what (P2 rulings decide)."),
    modes: {
      type: "object",
      additionalProperties: false,
      properties: {
        shadow: list(instanceStepRef, "Mac steps the engine shadows (it computes the same result and compares)."),
        observe_live: list(instanceStepRef, "Owner steps still ahead that the engine observes as they run."),
        adopt_from_import: { type: "boolean", description: "A step whose evidence arrives in an import bundle becomes adopted." },
      },
    },
    evidence: looseObject("Outside files and settings the observed steps depend on (ax principle 13)."),
    ask: { type: "object", additionalProperties: false, required: ["text", "by", "at", "via"], properties: { text: str("Tyler's exact words."), by: str("Who asked."), at: str("When (CT)."), via: str("chat, slack…") } },
    decisions: list(
      { type: "object", additionalProperties: false, required: ["about", "set", "why", "source"], properties: { about: str("What."), set: str("What we set."), why: str("Why."), source: str("Whose words, when.") } },
      "Each reading of the ask, with its source.",
    ),
    params: looseObject("Series-wide params."),
    rules: {
      type: "object",
      additionalProperties: false,
      properties: {
        late_copy: { enum: ["auto", "ask"] },
        resend: { enum: ["never", "once_after_settle_confirmed_missing"] },
        alternates: { enum: ["auto", "gated"] },
        stale_source: { enum: ["wait", "hold"] },
        intake_fallback: { enum: ["none", "post_close_snapshot"] },
        copy_drift: { enum: ["hold", "restore_before_send"] },
      },
    },
    slip: { type: "object", additionalProperties: false, patternProperties: { [STEP_ID]: { type: "object", additionalProperties: false, required: ["slip"], properties: { slip: str("e.g. 2d", { pattern: DURATION }) } } } },
    material: looseObject("May only tighten the ruled material-change table (P2)."),
    tasks: list({ type: "object", required: ["id", "owner", "what"], properties: { id: str("Task id.", { pattern: STEP_ID }), owner: { enum: ["casey", "tyler", "agent", "desk"] } }, additionalProperties: true }, "Hand tasks (do: task)."),
    audience: looseObject("Template audience (seqctl new)."),
    entrants: looseObject("Template entrants."),
    giveaway: looseObject("Template giveaway block."),
    consolation: looseObject("Template consolation block."),
    code: looseObject("Template code terms."),
    expect: expectSchema,
    fence: looseObject("Series-wide fences."),
  },
};

// ---- import-bundle-v1 -----------------------------------------------------------------------------

const commitSchema: JsonSchema = {
  type: "object",
  description: "The Mac's drawing commit (draw_group.py v3, 15 keys), verbatim.",
  required: ["entries", "entry_list_sha256", "committed_at_utc", "drand_round", "drand_chain"],
  additionalProperties: true,
  properties: {
    group: str("Group night.", { pattern: DATE }),
    drawing: { type: "integer", minimum: 1, maximum: 2 },
    deadline_utc: str("Close, UTC."),
    group_size: { type: "integer", minimum: 0 },
    invitation_statuses: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
    group_email_at_utc: { type: ["string", "null"] },
    entries: { type: "integer", minimum: 0 },
    reviews_entered: { type: "integer", minimum: 0 },
    free_entries_from_group: { type: "integer", minimum: 0 },
    free_carried_from_drawing_1: { type: "integer", minimum: 0 },
    left_out_earlier_winners_or_team: { type: "integer", minimum: 0 },
    entry_list_sha256: str("sha256('\\n'.join(entry_ids))", { pattern: HEX64 }),
    committed_at_utc: str("Commit time, UTC."),
    drand_round: { type: "integer", minimum: 1 },
    drand_chain: str("'quicknet 52db9ba7'"),
  },
};

const campaignSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "trust", "source"],
  properties: {
    campaign_id: { type: ["string", "null"], pattern: "^[0-9A-Z]{8,40}$" },
    campaign_id_prefix: { type: ["string", "null"], pattern: "^[0-9A-Z]{4,40}$", description: "A truncated id as the LOG has it (resolved by exact name later)." },
    name: { type: ["string", "null"], description: "Exact Klaviyo campaign name; null for a resend whose name was never recorded." },
    resend_no: { type: "integer", minimum: 0, description: "0 for the first send, 1.. for a resend to the ones Klaviyo skipped." },
    want: { type: ["integer", "null"], minimum: 0, description: "Recipients the send meant to reach (the list's exact count)." },
    overrides: { type: ["object", "null"], description: "What a LOG.md reading replaced on this row: the earlier received, trust, read time and source." },
    list_id: { type: ["string", "null"] },
    template: { type: ["string", "null"] },
    status: { type: ["string", "null"] },
    sent_at: { type: ["string", "null"] },
    list_exact: { type: ["integer", "null"], minimum: 0 },
    received: { type: ["integer", "null"], minimum: 0 },
    received_read_at: { type: ["string", "null"] },
    resend_of: { type: ["string", "null"] },
    trust: { enum: ["aggregate", "early_read", "untrusted", "log_only"] },
    source: str("Where the row came from: receipts, adopt.json, LOG.md:<line>."),
  },
};

export const IMPORT_BUNDLE_SCHEMA: JsonSchema = {
  $schema: DRAFT,
  $id: `${ID_BASE}/import-bundle-v1.json`,
  title: "October import bundle (scripts/sequences_import.py): ids, hashes and counts only",
  type: "object",
  additionalProperties: false,
  required: ["contract", "series", "scope", "built_at", "files", "team_hashes", "ledger", "drawings"],
  properties: {
    contract: { const: "sequences.import.bundle.v1" },
    series: str("The series slug.", { pattern: "^[a-z0-9][a-z0-9-]{1,62}$" }),
    scope: { enum: ["full", "drawing"], description: "full: every drawing and note so far; drawing: one morning's push. (The build manual's `kind`, renamed: NX-P17.)" },
    built_at: str("When the client built it, UTC.", { pattern: ISO_UTC }),
    definitions: list(
      { type: "object", additionalProperties: false, required: ["body", "yaml_sha256", "source_commit"], properties: { body: { type: "object" }, yaml_sha256: str("sha256 of the YAML file bytes.", { pattern: HEX64 }), source_commit: str("moonsleep-v1 commit.", { pattern: "^[0-9a-f]{7,40}$" }) } },
      "Sequence definitions to register (PyYAML-normalized JSON). A full bundle for a new series carries them.",
    ),
    series_file: { type: "object", additionalProperties: false, required: ["body", "yaml_sha256", "source_commit"], properties: { body: { type: "object" }, yaml_sha256: str("sha256 of the YAML file bytes.", { pattern: HEX64 }), source_commit: str("moonsleep-v1 commit.", { pattern: "^[0-9a-f]{7,40}$" }) } },
    files: list({ type: "object", additionalProperties: false, required: ["path_rel", "sha256", "bytes"], properties: { path_rel: str("Path under the track dir."), sha256: str("File sha256.", { pattern: HEX64 }), bytes: { type: "integer", minimum: 0 } } }, "Every file the client read."),
    team_hashes: list(str("sha256 of a team mailbox (draw_group.py TEAM).", { pattern: HEX64 }), "Team hashes, never the addresses.", { maxItems: 16 }),
    ledger: { type: "object", description: "drawings/winners.json: entry_id -> address sha256.", additionalProperties: false, patternProperties: { [ENTRY_ID]: str("Address sha256.", { pattern: HEX64 }) } },
    drawings: list(
      {
        type: "object",
        additionalProperties: false,
        required: ["night", "drawing_no", "receipt", "entries", "free_hashes"],
        properties: {
          night: str("Group night.", { pattern: DATE }),
          drawing_no: { type: "integer", minimum: 1, maximum: 2 },
          receipt: {
            type: "object",
            additionalProperties: false,
            required: ["commit", "entry_ids", "drand_randomness", "winners", "alternates", "promoted", "method"],
            properties: {
              commit: commitSchema,
              entry_ids: list(str("Entry id.", { pattern: ENTRY_ID }), "Sorted entry ids."),
              drand_randomness: str("Beacon randomness.", { pattern: HEX64 }),
              winners: list(str("Entry id.", { pattern: ENTRY_ID }), "Ranked winners."),
              alternates: list(str("Entry id.", { pattern: ENTRY_ID }), "Ranked alternates."),
              promoted: list(
                { type: "object", additionalProperties: false, required: ["replaces", "entry_id", "at_utc"], properties: { replaces: str("Entry id.", { pattern: ENTRY_ID }), entry_id: { type: ["string", "null"], pattern: ENTRY_ID }, why: str("Why."), at_utc: str("When, UTC.") } },
                "Promotions, in order.",
              ),
              method: str("The method line."),
            },
          },
          entries: list(
            { type: "object", additionalProperties: false, required: ["entry_id", "address_sha256", "basis"], properties: { entry_id: str("Entry id.", { pattern: ENTRY_ID }), address_sha256: str("Address sha256.", { pattern: HEX64 }), basis: list(str("review:rev_<32 hex> or free", { pattern: "^(review:rev_[0-9a-f]{32}|free)$" }), "Why they entered.", { minItems: 1 }) } },
            "From *-entries.private.json: only the address hash and basis.",
          ),
          free_hashes: list(str("sha256(line.strip().lower()).", { pattern: HEX64 }), "Free-entry hashes for this drawing."),
          beacon: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["round", "randomness", "signature"], properties: { round: { type: "integer", minimum: 1 }, randomness: str("hex", { pattern: HEX64 }), signature: str("hex", { pattern: "^[0-9a-f]{64,256}$" }) } }] },
        },
      },
      "Each drawing's receipt and entries.",
    ),
    notes: list(
      {
        type: "object",
        additionalProperties: false,
        required: ["night", "drawing_no", "note", "campaigns"],
        properties: {
          night: str("Group night.", { pattern: DATE }),
          drawing_no: { type: "integer", minimum: 1, maximum: 2 },
          note: { enum: ["winner", "still_entered"], description: "Which note (the build manual's `kind`, renamed: NX-P17)." },
          campaigns: list(campaignSchema, "Campaigns, resends included."),
        },
      },
      "Winner and still-entered notes (winner-notes-receipts.jsonl + adopt.json).",
    ),
    nights: list(
      { type: "object", additionalProperties: false, required: ["night"], properties: { night: str("Group night.", { pattern: DATE }), mac_send: looseObject("Counts from group-send-*.json (G1 hand runs)."), followups: list(looseObject("A hand follow-up run's counts."), "Follow-up runs.") } },
      "Hand-run night asks and follow-ups (G1 only).",
    ),
    exclusion_refresh: list(looseObject("{site, lines, sha256_prefix, at}"), "Recorded only if supplied; never needed."),
  },
};

// ---- output-v1 ------------------------------------------------------------------------------------

const nextSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["cmd", "why", "who", "fix_type", "lead_time", "reasks_tyler"],
  properties: {
    cmd: str("An exact command with ids filled in."),
    why: str("Why."),
    who: str("Who acts."),
    fix_type: { enum: ["command", "edit", "code_release", "ruling", "human", "tyler_tap"], description: "The ax draft's `kind`, renamed (NX-P17)." },
    lead_time: { type: ["string", "null"] },
    reasks_tyler: { type: "boolean" },
  },
};

const ctUtc: JsonSchema = { type: "object", additionalProperties: false, required: ["ct", "utc"], properties: { ct: { type: "string" }, utc: { type: "string" } } };
const toldSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["emailed_at", "incident", "in_digest", "relayed_by", "relayed_at"],
  properties: { emailed_at: { type: ["string", "null"] }, incident: { type: ["string", "null"] }, in_digest: { type: "boolean" }, relayed_by: { type: ["string", "null"] }, relayed_at: { type: ["string", "null"] } },
};

export const OUTPUT_SCHEMA: JsonSchema = {
  $schema: DRAFT,
  $id: `${ID_BASE}/output-v1.json`,
  title: "The one output contract every sequences.* read and write returns",
  type: "object",
  additionalProperties: false,
  required: ["contract", "command", "ok", "exit", "verdict", "as_of", "subject", "data", "problems", "next", "apply", "relay", "tyler_told", "links", "text"],
  properties: {
    contract: { const: "sequences_output_v1" },
    command: { type: "string" },
    ok: { type: "boolean" },
    exit: { enum: [0, 1, 2, 3, 4, 5, 6, 7, 8], description: "0 ok · 1 usage · 2 file errors · 3 needs Tyler · 4 held · 5 refused · 6 transient · 7 token stale · 8 needs an agent" },
    verdict: { type: "object", additionalProperties: false, required: ["text", "behind", "ahead"], properties: { text: { type: "string" }, behind: { type: ["string", "null"] }, ahead: { type: ["string", "null"] } } },
    as_of: ctUtc,
    subject: { type: "object", additionalProperties: false, required: ["series", "ref", "resolved_from"], properties: { series: { type: ["string", "null"] }, ref: { type: ["string", "null"] }, resolved_from: { type: ["string", "null"] } } },
    data: { type: "object", description: "The command's own payload." },
    problems: list(
      {
        type: "object",
        required: ["code", "tier", "ref", "message", "impact", "resumes", "fixer", "fix_by", "claimed_by", "tyler_told", "next"],
        additionalProperties: false,
        properties: {
          code: str("A stable code (check.*, sim.*, hold.*, refuse.*, transient.*, alert rules)."),
          tier: { enum: ["error", "pending", "warn", "hold", "refuse", "transient"] },
          ref: { type: ["string", "null"] },
          message: { type: "string" },
          impact: { type: ["string", "null"] },
          resumes: { enum: ["auto", "on_resume", "never"] },
          fixer: { enum: ["none", "agent", "desk", "casey", "tyler", "owner:mac", "owner:review_sender"] },
          fix_by: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["ct", "utc", "reason"], properties: { ct: { type: "string" }, utc: { type: "string" }, reason: { enum: ["not_after", "copy_window", "promise", "dependent_start"] } } }] },
          claimed_by: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["by", "until", "eta"], properties: { by: { type: "string" }, until: { type: "string" }, eta: { type: ["string", "null"] } } }] },
          tyler_told: { anyOf: [{ type: "null" }, toldSchema] },
          next: list(nextSchema, "Exact next commands."),
          file: { type: "string" },
          path: { type: "string" },
          fix: { type: "object", additionalProperties: false, required: ["text", "fix_type", "who", "lead_time", "safe"], properties: { text: { type: "string" }, fix_type: { type: "string" }, who: { type: "string" }, lead_time: { type: ["string", "null"] }, safe: { type: "boolean" } } },
        },
      },
      "Every problem names its fix, who makes it, the deadline and what is at stake.",
    ),
    next: list(nextSchema, "Exact next commands."),
    apply: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["token", "expires_at", "cmd", "effect_sha"], properties: { token: { type: "string" }, expires_at: { anyOf: [{ type: "null" }, ctUtc] }, cmd: { type: "string" }, effect_sha: { type: "string" } } }] },
    relay: {
      type: "object",
      additionalProperties: false,
      required: ["text", "facts"],
      properties: {
        text: str("2 to 4 sentences for Tyler, or 'none needed'."),
        facts: list({ type: "object", additionalProperties: false, required: ["priority", "text", "needs_tyler", "link"], properties: { priority: { type: "integer" }, text: { type: "string" }, needs_tyler: { type: "boolean" }, link: { type: ["string", "null"] } } }, "Ranked relay facts."),
      },
    },
    tyler_told: { anyOf: [{ type: "null" }, list(toldSchema, "What Tyler already heard.")] },
    links: { type: "object", additionalProperties: false, required: ["page"], properties: { page: { type: ["string", "null"] } } },
    text: str("The text twin: verdict line, body, next: lines, relay: line."),
  },
};

export const SCHEMAS = {
  "sequence-v1.json": SEQUENCE_SCHEMA,
  "series-v1.json": SERIES_SCHEMA,
  "import-bundle-v1.json": IMPORT_BUNDLE_SCHEMA,
  "output-v1.json": OUTPUT_SCHEMA,
} as const;

export const STEP_DO_NAMES: readonly string[] = DO_NAMES;

// Central (or any IANA zone) wall time to UTC and back, with Intl only (no runtime dependency).
// A wall time is resolved by searching the zone's offsets around it, so the Nov 1 change is exact:
// a time that happens twice (01:00-01:59 on 11/1) is refused unless it says CDT or CST, and a time
// that never happens (the spring gap) is refused outright.

export const DEFAULT_TZ = "America/Chicago";
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export class TimeError extends Error {
  constructor(
    readonly code: "refuse.dst_ambiguous_time" | "refuse.impossible" | "check.time_format",
    message: string,
  ) {
    super(message);
  }
}

export type WallParts = {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  weekday: string; // Mon..Sun
  abbrev: string; // CDT, CST, UTC
  offsetMinutes: number; // wall minus UTC
};

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let found = formatters.get(tz);
  if (!found) {
    found = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      timeZoneName: "short",
    });
    formatters.set(tz, found);
  }
  return found;
}

export function utcToWall(instant: Date | number, tz = DEFAULT_TZ): WallParts {
  const ms = typeof instant === "number" ? instant : instant.getTime();
  const parts: Record<string, string> = {};
  for (const part of formatter(tz).formatToParts(new Date(ms))) parts[part.type] = part.value;
  const hour = parts.hour === "24" ? "00" : parts.hour;
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${hour}:${parts.minute}:${parts.second}`;
  const wallMs = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(hour), Number(parts.minute), Number(parts.second));
  const offsetMinutes = Math.round((wallMs - Math.floor(ms / 1000) * 1000) / MINUTE_MS);
  return { date, time, weekday: parts.weekday, abbrev: parts.timeZoneName, offsetMinutes };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function normalizeTime(text: string): string {
  const match = TIME_RE.exec(text);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] ?? 0) > 59) {
    throw new TimeError("check.time_format", `'${text}' is not HH:MM or HH:MM:SS`);
  }
  return `${match[1]}:${match[2]}:${match[3] ?? "00"}`;
}

export function checkDate(text: string): string {
  const match = DATE_RE.exec(text);
  if (!match) throw new TimeError("check.time_format", `'${text}' is not YYYY-MM-DD`);
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (new Date(ms).toISOString().slice(0, 10) !== text) throw new TimeError("check.time_format", `'${text}' is not a calendar date`);
  return text;
}

export function addDays(date: string, days: number): string {
  checkDate(date);
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** The UTC instant of a wall date and time in `tz`. `suffix` (CDT/CST) picks one side of a repeat. */
export function wallToUtc(date: string, time: string, tz = DEFAULT_TZ, suffix?: string): Date {
  checkDate(date);
  const hhmmss = normalizeTime(time);
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi, s] = hhmmss.split(":").map(Number);
  const naive = Date.UTC(y!, m! - 1, d!, h!, mi!, s!);
  const offsets = new Set<number>();
  for (const probe of [naive - 14 * HOUR_MS, naive, naive + 14 * HOUR_MS]) offsets.add(utcToWall(probe, tz).offsetMinutes);
  const matches: Array<{ instant: number; abbrev: string }> = [];
  for (const offset of offsets) {
    const instant = naive - offset * MINUTE_MS;
    const wall = utcToWall(instant, tz);
    if (wall.date === date && wall.time === hhmmss) matches.push({ instant, abbrev: wall.abbrev });
  }
  matches.sort((a, b) => a.instant - b.instant);
  const label = `${date} ${hhmmss}${suffix ? ` ${suffix}` : ""}`;
  if (matches.length === 0) throw new TimeError("refuse.impossible", `${label} does not exist in ${tz} (the clocks skip it)`);
  if (suffix) {
    const picked = matches.find((match) => match.abbrev === suffix);
    if (!picked) {
      throw new TimeError("refuse.impossible", `${label}: ${tz} reads ${matches.map((match) => match.abbrev).join(" or ")} then, not ${suffix}`);
    }
    return new Date(picked.instant);
  }
  if (matches.length > 1) {
    throw new TimeError(
      "refuse.dst_ambiguous_time",
      `${label} happens twice in ${tz} (${matches.map((match) => match.abbrev).join(" then ")}); add CDT or CST`,
    );
  }
  return new Date(matches[0]!.instant);
}

export function centralToUtc(date: string, time: string, suffix?: string): Date {
  return wallToUtc(date, time, DEFAULT_TZ, suffix);
}

/** "24h", "90s", "15m", "14d", "7 days", "2h" -> milliseconds. */
export function parseDuration(text: string): number {
  const match = /^\s*(\d+)\s*(s|sec|m|min|h|hour|hours|d|day|days)\s*$/.exec(text);
  if (!match) throw new TimeError("check.time_format", `'${text}' is not a duration like 90s, 15m, 24h or 7 days`);
  const n = Number(match[1]);
  const unit = match[2]!;
  if (unit.startsWith("s")) return n * 1000;
  if (unit.startsWith("m")) return n * MINUTE_MS;
  if (unit.startsWith("h")) return n * HOUR_MS;
  return n * DAY_MS;
}

export type Window = { from: string; to: string };

/** "19:17-23:00" -> wall times; `to` may not wrap past midnight. */
export function parseWindow(text: string): Window {
  const match = /^\s*(\d{2}:\d{2}(?::\d{2})?)\s*-\s*(\d{2}:\d{2}(?::\d{2})?)\s*$/.exec(text);
  if (!match) throw new TimeError("check.time_format", `'${text}' is not a window like 19:17-23:00`);
  const window = { from: normalizeTime(match[1]!), to: normalizeTime(match[2]!) };
  if (window.from >= window.to) throw new TimeError("check.time_format", `window '${text}' ends before it starts`);
  return window;
}

// ---- The definition's time grammar -------------------------------------------------------------

export type TimeExpr =
  | { type: "param"; param: string; days: number; time: string | null } // night+3 23:59:59 · night+3
  | { type: "absolute"; date: string; time: string; suffix?: string } // 2026-11-02 09:00 [CST]
  | { type: "iso"; instant: string } // 2026-10-16T05:00:00Z
  | { type: "ref"; step: string; field: string; arg?: string; offsetMs: number } // a.first_post + 24h
  | { type: "ref_days"; step: string; field: string; arg?: string; days: number; time: string }; // opens + 7 days 23:59:59

const PARAM_RE = /^([a-z][a-z0-9_]*)(?:\s*\+\s*(\d+))?(?:\s+(\d{2}:\d{2}(?::\d{2})?))?$/;
const ABS_RE = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)(?:\s+(CDT|CST|UTC))?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const REF_RE = /^([a-z][a-z0-9_]*)(?:\.([a-z][a-z0-9_]*)(?:\(([a-z][a-z0-9_]*)\))?)?$/;

/**
 * Parses one time expression. `params` names the date params (night, opens…); any other leading
 * name is a step or param instant (opens, desk_row.closes, night_ask.first_post).
 */
export function parseTimeExpr(text: string, dateParams: readonly string[] = ["night"]): TimeExpr {
  const source = text.trim();
  if (ISO_RE.test(source)) return { type: "iso", instant: new Date(source).toISOString() };
  const abs = ABS_RE.exec(source);
  if (abs) {
    checkDate(abs[1]!);
    return { type: "absolute", date: abs[1]!, time: normalizeTime(abs[2]!), ...(abs[3] ? { suffix: abs[3] } : {}) };
  }
  const param = PARAM_RE.exec(source);
  if (param && dateParams.includes(param[1]!)) {
    return { type: "param", param: param[1]!, days: Number(param[2] ?? 0), time: param[3] ? normalizeTime(param[3]) : null };
  }
  const days = /^(.+?)\s*\+\s*(\d+)\s*days?\s+(\d{2}:\d{2}(?::\d{2})?)$/.exec(source);
  if (days) {
    const ref = REF_RE.exec(days[1]!.trim());
    if (ref) {
      return { type: "ref_days", step: ref[1]!, field: ref[2] ?? "at", ...(ref[3] ? { arg: ref[3] } : {}), days: Number(days[2]), time: normalizeTime(days[3]!) };
    }
  }
  const offset = /^(.+?)\s*([+-])\s*(\d+\s*(?:s|m|h|d))$/.exec(source);
  const base = offset ? offset[1]!.trim() : source;
  const ref = REF_RE.exec(base);
  if (ref) {
    const ms = offset ? parseDuration(offset[3]!) * (offset[2] === "-" ? -1 : 1) : 0;
    return { type: "ref", step: ref[1]!, field: ref[2] ?? "at", ...(ref[3] ? { arg: ref[3] } : {}), offsetMs: ms };
  }
  throw new TimeError("check.time_format", `'${text}' is not a time: use 'night+N HH:MM[:SS]', 'YYYY-MM-DD HH:MM', '<step>.first_post + 24h' or '<instant> + N days HH:MM:SS'`);
}

export type TimeScope = {
  tz: string;
  dates: Record<string, string>; // param -> YYYY-MM-DD
  instants?: Record<string, Date | null>; // "<step>.<field>" -> known instant (null = not yet known)
};

/** Resolves an expression; `null` means it depends on something that has not happened yet. */
export function evalTimeExpr(expr: TimeExpr, scope: TimeScope): Date | null {
  switch (expr.type) {
    case "iso":
      return new Date(expr.instant);
    case "absolute":
      return expr.suffix === "UTC" ? new Date(`${expr.date}T${expr.time}Z`) : wallToUtc(expr.date, expr.time, scope.tz, expr.suffix);
    case "param": {
      const date = scope.dates[expr.param];
      if (!date) throw new TimeError("check.time_format", `unknown date param '${expr.param}'`);
      return wallToUtc(addDays(date, expr.days), expr.time ?? "00:00:00", scope.tz);
    }
    case "ref": {
      const base = scope.instants?.[`${expr.step}.${expr.field}`];
      return base ? new Date(base.getTime() + expr.offsetMs) : null;
    }
    case "ref_days": {
      const base = scope.instants?.[`${expr.step}.${expr.field}`];
      if (!base) return null;
      // Counted in wall dates, so a window that crosses Nov 1 still closes at 23:59:59 local.
      return wallToUtc(addDays(utcToWall(base, scope.tz).date, expr.days), expr.time, scope.tz);
    }
  }
}

/** A param expression without a time ("night+3") as a wall date, for fills such as close_day. */
export function evalDateExpr(text: string, scope: TimeScope, dateParams: readonly string[] = ["night"]): string {
  const expr = parseTimeExpr(text, dateParams);
  if (expr.type !== "param" || expr.time !== null) throw new TimeError("check.time_format", `'${text}' is not a date like night+3`);
  return addDays(scope.dates[expr.param]!, expr.days);
}

// ---- Words for people ---------------------------------------------------------------------------

function twelveHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const hour = h! % 12 === 0 ? 12 : h! % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h! < 12 ? "AM" : "PM"}`;
}

/** "Tue 10/27 8:00 AM CDT": Central time with the weekday and AM/PM. */
export function formatCt(instant: Date | string | number, tz = DEFAULT_TZ, withZone = true): string {
  const wall = utcToWall(new Date(instant), tz);
  const [, month, day] = wall.date.split("-");
  return `${wall.weekday} ${Number(month)}/${Number(day)} ${twelveHour(wall.time)}${withZone ? ` ${wall.abbrev}` : ""}`;
}

/** "Tue 10/27 08:00": the aligned 24-hour form for table bodies. */
export function formatCtShort(instant: Date | string | number, tz = DEFAULT_TZ): string {
  const wall = utcToWall(new Date(instant), tz);
  const [, month, day] = wall.date.split("-");
  return `${wall.weekday} ${Number(month)}/${Number(day)} ${wall.time.slice(0, 5)}`;
}

export function asOf(now: Date, tz = DEFAULT_TZ): { ct: string; utc: string } {
  return { ct: formatCt(now, tz), utc: now.toISOString() };
}

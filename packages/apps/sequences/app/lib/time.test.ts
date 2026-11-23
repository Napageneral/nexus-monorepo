import { describe, expect, it } from "vitest";
import {
  TimeError,
  addDays,
  centralToUtc,
  evalDateExpr,
  evalTimeExpr,
  formatCt,
  parseDuration,
  parseTimeExpr,
  parseWindow,
  utcToWall,
} from "./time.js";

const g5 = { tz: "America/Chicago", dates: { night: "2026-10-26" } };
const at = (text: string, scope = g5) => evalTimeExpr(parseTimeExpr(text), scope)?.toISOString();

describe("Central time to UTC", () => {
  it("reproduces the design's materialized g5 table exactly", () => {
    // night_ask from 19:17 CDT on Mon 10/26
    expect(centralToUtc("2026-10-26", "19:17").toISOString()).toBe("2026-10-27T00:17:00.000Z");
    // draw_1 Tue 10/27 08:00 CDT
    expect(at("night+1 08:00")).toBe("2026-10-27T13:00:00.000Z");
    // draw_2 closes Thu 10/29 23:59:59 CDT, drawn Fri 10/30 08:00 CDT
    expect(at("night+3 23:59:59")).toBe("2026-10-30T04:59:59.000Z");
    expect(at("night+4 08:00")).toBe("2026-10-30T13:00:00.000Z");
    // claims windows: '<instant> + 7 days 23:59:59' from each winner note, across Nov 1
    const claims = (notice: string) =>
      evalTimeExpr(parseTimeExpr("opens + 7 days 23:59:59"), { ...g5, instants: { "opens.at": new Date(notice) } })!.toISOString();
    expect(claims("2026-10-27T13:06:00Z")).toBe("2026-11-04T05:59:59.000Z");
    expect(claims("2026-10-30T13:06:00Z")).toBe("2026-11-07T05:59:59.000Z");
    // the re-planned catch-up: code_go ask_by Mon 11/2 09:00 CST, half_off_note 10:00 CST
    expect(at("2026-11-02 09:00")).toBe("2026-11-02T15:00:00.000Z");
    expect(at("2026-11-02 10:00")).toBe("2026-11-02T16:00:00.000Z");
  });

  it("refuses the repeated hour on 11/1 unless it says CDT or CST", () => {
    expect(() => centralToUtc("2026-11-01", "01:30")).toThrow(TimeError);
    try {
      centralToUtc("2026-11-01", "01:30");
    } catch (error) {
      expect((error as TimeError).code).toBe("refuse.dst_ambiguous_time");
    }
    expect(centralToUtc("2026-11-01", "01:30", "CDT").toISOString()).toBe("2026-11-01T06:30:00.000Z");
    expect(centralToUtc("2026-11-01", "01:30", "CST").toISOString()).toBe("2026-11-01T07:30:00.000Z");
    expect(centralToUtc("2026-11-01", "00:59:59").toISOString()).toBe("2026-11-01T05:59:59.000Z");
    expect(centralToUtc("2026-11-01", "02:00").toISOString()).toBe("2026-11-01T08:00:00.000Z");
    expect(at("2026-11-01 01:15 CST")).toBe("2026-11-01T07:15:00.000Z");
  });

  it("refuses a time the clocks skip and a suffix the zone does not read then", () => {
    expect(() => centralToUtc("2027-03-14", "02:30")).toThrow(/does not exist/);
    expect(() => centralToUtc("2026-11-02", "09:00", "CDT")).toThrow(/reads CST then, not CDT/);
  });

  it("reads instants back as Central wall time with the weekday and AM/PM", () => {
    expect(utcToWall(new Date("2026-10-27T13:00:00Z"))).toMatchObject({ date: "2026-10-27", time: "08:00:00", weekday: "Tue", abbrev: "CDT", offsetMinutes: -300 });
    expect(utcToWall(new Date("2026-11-02T15:00:00Z"))).toMatchObject({ time: "09:00:00", abbrev: "CST", offsetMinutes: -360 });
    expect(formatCt("2026-10-27T00:17:00Z")).toBe("Mon 10/26 7:17 PM CDT");
    expect(formatCt("2026-11-07T05:59:59Z")).toBe("Fri 11/6 11:59 PM CST");
  });
});

describe("the definition's time grammar", () => {
  it("parses every form the October files use", () => {
    expect(parseTimeExpr("night+3 23:59:59")).toEqual({ type: "param", param: "night", days: 3, time: "23:59:59" });
    expect(parseTimeExpr("night 17:00")).toEqual({ type: "param", param: "night", days: 0, time: "17:00:00" });
    expect(parseTimeExpr("night_ask.first_post + 24h")).toEqual({ type: "ref", step: "night_ask", field: "first_post", offsetMs: 86_400_000 });
    expect(parseTimeExpr("desk_row.closes - 24h")).toEqual({ type: "ref", step: "desk_row", field: "closes", offsetMs: -86_400_000 });
    expect(parseTimeExpr("notice.delivered_at(winner)")).toEqual({ type: "ref", step: "notice", field: "delivered_at", arg: "winner", offsetMs: 0 });
    expect(parseTimeExpr("opens + 7 days 23:59:59")).toEqual({ type: "ref_days", step: "opens", field: "at", days: 7, time: "23:59:59" });
    expect(parseTimeExpr("2026-10-16T05:00:00Z")).toEqual({ type: "iso", instant: "2026-10-16T05:00:00.000Z" });
    expect(() => parseTimeExpr("night+3 25:00")).toThrow(/HH:MM/);
    expect(() => parseTimeExpr("draw_at 10:0")).toThrow(TimeError);
  });

  it("leaves a time that depends on an event unresolved until it happens", () => {
    expect(evalTimeExpr(parseTimeExpr("night_ask.first_post + 24h"), g5)).toBeNull();
    const known = { ...g5, instants: { "night_ask.first_post": new Date("2026-10-27T00:17:30Z") } };
    expect(evalTimeExpr(parseTimeExpr("night_ask.first_post + 24h"), known)!.toISOString()).toBe("2026-10-28T00:17:30.000Z");
  });

  it("reads dates, durations and windows", () => {
    expect(evalDateExpr("night+3", g5)).toBe("2026-10-29");
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(parseDuration("90s")).toBe(90_000);
    expect(parseDuration("7 days")).toBe(7 * 86_400_000);
    expect(parseWindow("19:17-23:00")).toEqual({ from: "19:17:00", to: "23:00:00" });
    expect(() => parseWindow("23:00-19:17")).toThrow(/ends before/);
  });
});

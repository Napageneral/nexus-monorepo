import { describe, expect, it } from "vitest";
import { canonicalize } from "./jcs.js";
import { jcsSha256, sha256Hex } from "./sha.js";

describe("RFC 8785 canonicalization", () => {
  it("matches the RFC's §3.2.2 example (numbers, escapes, literals)", () => {
    const input = JSON.parse(
      '{"numbers": [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001], "string": "\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/", "literals": [null, true, false]}',
    );
    expect(canonicalize(input)).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
    );
  });

  it("sorts keys by UTF-16 code units (the RFC's §3.2.3 example)", () => {
    const input = JSON.parse('{"\\u20ac": "Euro Sign", "\\r": "Carriage Return", "\\ufb33": "Hebrew Letter Dalet With Dagesh", "1": "One", "\\ud83d\\ude00": "Emoji: Grinning Face", "\\u0080": "Control", "\\u00f6": "Latin Small Letter O With Diaeresis"}');
    // Read the order off the canonical text: JSON.parse would put the integer-like key "1" first.
    const keys = [...canonicalize(input).matchAll(/"((?:[^"\\]|\\.)*)":/g)].map((match) => JSON.parse(`"${match[1]}"`) as string);
    expect(keys.map((key) => key.codePointAt(0)!.toString(16))).toEqual(["d", "31", "80", "f6", "20ac", "1f600", "fb33"]);
  });

  it("serializes the RFC's IEEE-754 number vectors", () => {
    const vectors: Array<[number, string]> = [
      [0, "0"],
      [-0, "0"],
      [5e-324, "5e-324"],
      [1.7976931348623157e308, "1.7976931348623157e+308"],
      [9007199254740992, "9007199254740992"],
      [295147905179352830000, "295147905179352830000"],
      [1e21, "1e+21"],
      [0.000001, "0.000001"],
      [1e-7, "1e-7"],
    ];
    for (const [value, text] of vectors) expect(canonicalize(value)).toBe(text);
    expect(() => canonicalize(Number.NaN)).toThrow(/finite/);
  });

  it("drops undefined members and hashes the canonical bytes", () => {
    expect(canonicalize({ b: 1, a: undefined, c: [undefined] })).toBe('{"b":1,"c":[null]}');
    expect(jcsSha256({ b: 2, a: 1 })).toBe(sha256Hex('{"a":1,"b":2}'));
  });
});

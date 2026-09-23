import { describe, expect, it } from "vitest";
import { formatScore } from "../lib/score-display";

describe("score presentation", () => {
  it.each([
    ["0.3452228016183431", "0.345"],
    ["0.28065901722124237", "0.281"],
    ["1.416", "1.42"],
    ["78.500000%", "78.5%"],
    ["<0.00001234567", "<0.0000123"],
    ["-0.037894589438910123", "-0.0379"],
    ["1.2345678901234567e-12", "1.23e-12"],
    ["-2.5000000000000000e-08", "-2.5e-8"],
    ["0.0000000000000000", "0"],
    ["-0", "0"],
    ["99.99999", "100"],
    [0.9012345, "0.901"],
    ["N/A", "N/A"],
    [null, "Not reported"],
    [undefined, "Not reported"],
    ["unreported", "unreported"],
    ["0.123 ± 0.004", "0.123 ± 0.004"],
    ["1.23 (Table 4)", "1.23 (Table 4)"],
    ["1e-400", "1e-400"],
    ["1e400", "1e400"],
  ])("formats %s as %s without losing annotations or tiny scores", (input, expected) => {
    expect(formatScore(input)).toBe(expected);
  });
});

import { parseNumeric } from "../numbers";

describe("parseNumeric", () => {
  it("parses finite numbers", () => {
    expect(parseNumeric(42)).toBe(42);
    expect(parseNumeric(-3.5)).toBe(-3.5);
  });

  it("parses numeric strings", () => {
    expect(parseNumeric("12")).toBe(12);
    expect(parseNumeric(" 7.25 ")).toBe(7.25);
  });

  it("returns null for invalid values", () => {
    expect(parseNumeric("")).toBeNull();
    expect(parseNumeric("abc")).toBeNull();
    expect(parseNumeric(NaN)).toBeNull();
    expect(parseNumeric(Infinity)).toBeNull();
    expect(parseNumeric(undefined)).toBeNull();
  });
});

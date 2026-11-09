import { describe, it, expect } from "vitest";
import { validateCheckInput } from "@/lib/check/validation";

/**
 * Task 5 — single-check input validation unit tests.
 *
 * The validator is a pure function over the raw request body (with date
 * strings), so these run without a database. They cover the required-field,
 * date-parsing, and optional-field paths.
 */
describe("validateCheckInput", () => {
  it("accepts a valid body with all fields", () => {
    const result = validateCheckInput({
      productType: "structural steel",
      grade: "E250",
      dimensions: "plates/sections/profiles",
      material: "carbon structural steel",
      hsCode: "7208.52",
      clearanceDate: "2021-06-01",
      billOfLadingDate: "2021-05-01",
      msmeRegistered: true,
      endUse: "construction",
      notDomesticallyAvailable: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.hsCode).toBe("7208.52");
    expect(result.input.grade).toBe("E250");
    expect(result.input.clearanceDate).toEqual(new Date("2021-06-01"));
    expect(result.input.billOfLadingDate).toEqual(new Date("2021-05-01"));
    expect(result.input.msmeRegistered).toBe(true);
    expect(result.input.endUse).toBe("construction");
    expect(result.input.notDomesticallyAvailable).toBeUndefined();
  });

  it("accepts a minimal body with only required fields", () => {
    const result = validateCheckInput({
      hsCode: "7318.15",
      clearanceDate: "2022-02-01",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.hsCode).toBe("7318.15");
    expect(result.input.productType).toBeUndefined();
    expect(result.input.grade).toBeUndefined();
    expect(result.input.billOfLadingDate).toBeUndefined();
    expect(result.input.msmeRegistered).toBeUndefined();
  });

  it("rejects a missing HS code", () => {
    const result = validateCheckInput({ clearanceDate: "2021-06-01" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("HS code is required.");
  });

  it("rejects an empty HS code (whitespace only)", () => {
    const result = validateCheckInput({
      hsCode: "   ",
      clearanceDate: "2021-06-01",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("HS code is required.");
  });

  it("rejects a missing clearance date", () => {
    const result = validateCheckInput({ hsCode: "7208.52" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("Clearance date is required.");
  });

  it("rejects an invalid clearance date", () => {
    const result = validateCheckInput({
      hsCode: "7208.52",
      clearanceDate: "not-a-date",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("Clearance date is not a valid date.");
  });

  it("rejects an invalid bill of lading date when present", () => {
    const result = validateCheckInput({
      hsCode: "7208.52",
      clearanceDate: "2021-06-01",
      billOfLadingDate: "garbage",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("Bill of Lading date is not a valid date.");
  });

  it("allows an absent bill of lading date", () => {
    const result = validateCheckInput({
      hsCode: "7208.52",
      clearanceDate: "2021-06-01",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.billOfLadingDate).toBeUndefined();
  });

  it("trims whitespace on string fields", () => {
    const result = validateCheckInput({
      hsCode: "  7208.52  ",
      grade: "  E250  ",
      clearanceDate: "2021-06-01",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.hsCode).toBe("7208.52");
    expect(result.input.grade).toBe("E250");
  });

  it("treats empty optional strings as undefined", () => {
    const result = validateCheckInput({
      hsCode: "7208.52",
      clearanceDate: "2021-06-01",
      grade: "",
      material: "  ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.grade).toBeUndefined();
    expect(result.input.material).toBeUndefined();
  });

  it("collects multiple errors at once", () => {
    const result = validateCheckInput({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors).toContain("HS code is required.");
    expect(result.errors).toContain("Clearance date is required.");
  });

  it("parses date-only strings as UTC midnight", () => {
    const result = validateCheckInput({
      hsCode: "7208.52",
      clearanceDate: "2020-12-22",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.clearanceDate).toEqual(
      new Date("2020-12-22T00:00:00.000Z"),
    );
  });
});

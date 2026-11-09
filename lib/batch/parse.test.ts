import { describe, it, expect } from "vitest";
import {
  parseBatchCsv,
  MAX_BATCH_ROWS,
  type ParsedRow,
} from "@/lib/batch/parse";

/**
 * Task 8 — CSV batch parse unit tests (pure, no DB).
 *
 * Verifies the server-side CSV parser:
 *  - Parses well-formed rows into typed EngineInput objects.
 *  - Reports structural errors for missing columns / empty files / row limit.
 *  - Collects per-row errors without discarding well-formed rows (row
 *    independence — a malformed row does not break other rows).
 *
 * These tests run without a database because `parseBatchCsv` is a pure
 * transform over a CSV string.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal valid CSV header. */
const HEADER =
  "productType,grade,dimensions,material,hsCode,clearanceDate,billOfLadingDate";

/** One well-formed steel row (E250, after grace window → RED). */
const VALID_STEEL_ROW =
  "structural steel,E250,plates/sections/profiles,carbon structural steel,7208.52,2021-06-01,2021-06-01";

/** A fastener row (after grace window → RED). */
const VALID_FASTENER_ROW =
  "fasteners,Property Class 8.8,M6-M48,carbon/alloy steel,7318.15,2022-06-01,2022-06-01";

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

// ---------------------------------------------------------------------------
// 1. Well-formed CSV parses into typed inputs
// ---------------------------------------------------------------------------

describe("Task 8 — parseBatchCsv: well-formed rows", () => {
  it("parses a single valid row into an EngineInput", () => {
    const result = parseBatchCsv(csv(VALID_STEEL_ROW));

    expect(result.structuralErrors).toEqual([]);
    expect(result.rowErrors).toEqual([]);
    expect(result.rows).toHaveLength(1);

    const row: ParsedRow = result.rows[0];
    expect(row.rowIndex).toBe(1);
    expect(row.input.hsCode).toBe("7208.52");
    expect(row.input.grade).toBe("E250");
    expect(row.input.productType).toBe("structural steel");
    expect(row.input.clearanceDate).toEqual(new Date("2021-06-01"));
    expect(row.input.billOfLadingDate).toEqual(new Date("2021-06-01"));
  });

  it("parses multiple valid rows", () => {
    const result = parseBatchCsv(csv(VALID_STEEL_ROW, VALID_FASTENER_ROW));

    expect(result.structuralErrors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].rowIndex).toBe(1);
    expect(result.rows[1].rowIndex).toBe(2);
    expect(result.rows[0].input.hsCode).toBe("7208.52");
    expect(result.rows[1].input.hsCode).toBe("7318.15");
  });

  it("parses optional columns when present", () => {
    const csvText = [
      "productType,grade,dimensions,material,hsCode,clearanceDate,billOfLadingDate,msmeRegistered,endUse,notDomesticallyAvailable",
      "structural steel,E250,plates/sections/profiles,carbon structural steel,7208.52,2021-06-01,2021-06-01,yes,capital goods,no",
    ].join("\n");

    const result = parseBatchCsv(csvText);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].input.msmeRegistered).toBe(true);
    expect(result.rows[0].input.endUse).toBe("capital goods");
    expect(result.rows[0].input.notDomesticallyAvailable).toBe(false);
  });

  it("accepts header variations (lowercase, hyphens, spaces)", () => {
    const csvText = [
      "product-type,grade,dimensions,material,hs code,clearance date,bill of lading date",
      "structural steel,E250,plates,steel,7208.52,2021-06-01,2021-06-01",
    ].join("\n");

    const result = parseBatchCsv(csvText);

    expect(result.structuralErrors).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Structural errors
// ---------------------------------------------------------------------------

describe("Task 8 — parseBatchCsv: structural errors", () => {
  it("reports missing required columns", () => {
    // Missing hsCode and clearanceDate.
    const csvText = [
      "productType,grade,dimensions,material,billOfLadingDate",
      "steel,E250,plates,carbon,2021-06-01",
    ].join("\n");

    const result = parseBatchCsv(csvText);

    expect(result.rows).toEqual([]);
    expect(result.structuralErrors.length).toBeGreaterThan(0);
    expect(result.structuralErrors[0]).toContain("missing required columns");
  });

  it("reports an empty file", () => {
    const result = parseBatchCsv("");

    expect(result.rows).toEqual([]);
    expect(result.structuralErrors.length).toBeGreaterThan(0);
  });

  it("reports a header-only file (no data rows)", () => {
    const result = parseBatchCsv(HEADER);

    expect(result.rows).toEqual([]);
    expect(result.structuralErrors.length).toBeGreaterThan(0);
    expect(result.structuralErrors[0]).toContain("no data rows");
  });

  it("enforces the row limit", () => {
    // Generate MAX_BATCH_ROWS + 1 valid rows.
    const rows = Array.from(
      { length: MAX_BATCH_ROWS + 1 },
      () => VALID_STEEL_ROW,
    );
    const result = parseBatchCsv(csv(...rows));

    expect(result.rows).toEqual([]);
    expect(result.structuralErrors.length).toBeGreaterThan(0);
    expect(result.structuralErrors[0]).toContain("exceeds the maximum");
  });
});

// ---------------------------------------------------------------------------
// 3. Per-row errors + row independence
// ---------------------------------------------------------------------------

describe("Task 8 — parseBatchCsv: malformed-row handling (row independence)", () => {
  it("reports a per-row error for a missing hsCode without affecting other rows", () => {
    // Row 1: valid. Row 2: missing hsCode. Row 3: valid.
    const malformedRow =
      "structural steel,E250,plates/sections/profiles,carbon structural steel,,2021-06-01,2021-06-01";
    const result = parseBatchCsv(csv(VALID_STEEL_ROW, malformedRow, VALID_FASTENER_ROW));

    // Two valid rows survive.
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].rowIndex).toBe(1);
    expect(result.rows[1].rowIndex).toBe(3);

    // One row error for row 2.
    expect(result.rowErrors).toHaveLength(1);
    expect(result.rowErrors[0].rowIndex).toBe(2);
    expect(result.rowErrors[0].errors.some((e) => e.includes("hsCode"))).toBe(
      true,
    );
  });

  it("reports a per-row error for an invalid clearance date", () => {
    const malformedRow =
      "structural steel,E250,plates/sections/profiles,carbon structural steel,7208.52,not-a-date,2021-06-01";
    const result = parseBatchCsv(csv(VALID_STEEL_ROW, malformedRow));

    expect(result.rows).toHaveLength(1);
    expect(result.rowErrors).toHaveLength(1);
    expect(result.rowErrors[0].rowIndex).toBe(2);
    expect(
      result.rowErrors[0].errors.some((e) => e.includes("clearanceDate")),
    ).toBe(true);
  });

  it("reports a per-row error for an invalid bill-of-lading date", () => {
    const malformedRow =
      "structural steel,E250,plates/sections/profiles,carbon structural steel,7208.52,2021-06-01,bad-bl-date";
    const result = parseBatchCsv(csv(VALID_STEEL_ROW, malformedRow));

    expect(result.rows).toHaveLength(1);
    expect(result.rowErrors).toHaveLength(1);
    expect(
      result.rowErrors[0].errors.some((e) => e.includes("billOfLadingDate")),
    ).toBe(true);
  });

  it("does not break other rows when multiple rows are malformed", () => {
    // Two valid rows interleaved with two malformed rows.
    const bad1 =
      "steel,E250,plates,carbon,,2021-06-01,2021-06-01"; // missing hsCode
    const bad2 =
      "steel,E250,plates,carbon,7208.52,garbage,2021-06-01"; // bad clearance date
    const result = parseBatchCsv(
      csv(VALID_STEEL_ROW, bad1, VALID_FASTENER_ROW, bad2),
    );

    // The two valid rows are preserved with correct indices.
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.rowIndex)).toEqual([1, 3]);

    // The two malformed rows are collected as errors.
    expect(result.rowErrors).toHaveLength(2);
    expect(result.rowErrors.map((r) => r.rowIndex)).toEqual([2, 4]);
  });
});

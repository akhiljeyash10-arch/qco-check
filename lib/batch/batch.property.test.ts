import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { evaluate } from "@/lib/engine/engine";
import { parseBatchCsv } from "@/lib/batch/parse";
import { validateCheckInput } from "@/lib/check/validation";
import { buildSeedContext } from "@/lib/engine/fixtures";
import type { RuleContext } from "@/lib/engine/types";

/**
 * Task 10 — Batch / CSV property-based tests (Vitest + fast-check).
 *
 * Four required invariants (see tasks.md + design.md §6):
 *
 *  1. **Batch row independence** — a malformed/errored row does not alter other
 *     rows' verdicts. The CSV parser is a pure transform; a bad row becomes a
 *     `RowError` and never touches the well-formed rows' inputs or verdicts.
 *  2. **Parse robustness** — CSV parsing preserves well-formed rows regardless
 *     of malformed rows elsewhere (the valid rows' fields + indices are intact).
 *  3. **Cross-path consistency** — identical inputs produce identical verdicts
 *     through both the single-check path (`validateCheckInput` → `evaluate`)
 *     and the batch path (`parseBatchCsv` → `evaluate`). Both paths funnel into
 *     the same pure engine, so the verdict must agree for any faithful input.
 *  4. **Date-boundary consistency** — at the effective-date / grace-window edges,
 *     the single and batch paths agree (no off-by-one between the two parse
 *     paths).
 *
 * All four are pure (no database) so they always run, mirroring the Task 4
 * engine property-test pattern.
 *
 * **Validates: Requirements §9 (property-based tests prove invariants) and §10
 * (reproducible, deterministic determination path).**
 */

// ---------------------------------------------------------------------------
// Shared helpers + constants
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** The full expected CSV header (matches lib/batch/parse.ts EXPECTED_HEADERS). */
const HEADER =
  "productType,grade,dimensions,material,hsCode,clearanceDate,billOfLadingDate,msmeRegistered,endUse,notDomesticallyAvailable";

const SEED_HS_CODES = [
  "7208.52", "7228.30", "7208.90", "7211.13",
  "7225.11", "7225.19", "7318.15", "7318.16", "7318.24",
];

const ctx: RuleContext = buildSeedContext();

/** CSV-escape a single cell (wrap in quotes if it contains a comma/quote). */
function csvCell(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** Build a CSV string from row arrays (header + rows). */
function buildCsv(rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

/** A valid date string "YYYY-MM-DD" (days 1-28 keep every generated date valid). */
const arbDateString = fc
  .tuple(
    fc.integer({ min: 2019, max: 2024 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

// ===========================================================================
// 1 + 2. Parse robustness + batch row independence
// ===========================================================================

/** A generator for a *valid* CSV data row (well-formed). Returns the row string
 * together with the hsCode + clearanceDate it was built from so tests can assert
 * on the exact values without re-parsing the (possibly quoted) row string. */
const arbValidRow = fc
  .tuple(
    fc.string({ maxLength: 15 }),
    fc.string({ maxLength: 15 }),
    fc.string({ maxLength: 15 }),
    fc.string({ maxLength: 15 }),
    fc.constantFrom(...SEED_HS_CODES),
    arbDateString,
    arbDateString,
  )
  .map(([productType, grade, dimensions, material, hsCode, clearanceDate, blDate]) => ({
    row: [
      csvCell(productType),
      csvCell(grade),
      csvCell(dimensions),
      csvCell(material),
      hsCode,
      clearanceDate,
      blDate,
      "", // msmeRegistered (optional)
      "", // endUse (optional)
      "", // notDomesticallyAvailable (optional)
    ].join(","),
    hsCode,
    clearanceDate,
  }));

/** A generator for a *malformed* CSV data row: missing hsCode OR a bad date.
 * The malformation is guaranteed (empty hsCode or a known-invalid date string);
 * all other cells are CSV-escaped so the row is rejected for the *intended*
 * reason, not because a stray special character confused the parser. */
const arbMalformedRow = fc.oneof(
  // Missing hsCode (empty cell).
  fc
    .tuple(arbDateString, arbDateString)
    .map(([clearanceDate, blDate]) =>
      [
        csvCell("x"),
        csvCell("x"),
        csvCell("x"),
        csvCell("x"),
        "", // empty hsCode → malformed (missing required field)
        clearanceDate,
        blDate,
        "", "", "",
      ].join(","),
    ),
  // Invalid clearance date (a string that is definitively not a date).
  fc
    .tuple(fc.constantFrom(...SEED_HS_CODES), arbDateString)
    .map(([hsCode, blDate]) =>
      [
        csvCell("x"),
        csvCell("x"),
        csvCell("x"),
        csvCell("x"),
        hsCode,
        "not-a-date", // invalid clearance date → malformed
        blDate,
        "", "", "",
      ].join(","),
    ),
);

describe("property — parse robustness", () => {
  it("well-formed rows are preserved regardless of malformed rows elsewhere", () => {
    fc.assert(
      fc.property(
        fc.array(arbValidRow, { minLength: 1, maxLength: 6 }),
        fc.array(arbMalformedRow, { maxLength: 6 }),
        (validRows, malformedRows) => {
          // Interleave valid + malformed rows deterministically (valid[i] then
          // malformed[i]), tracking the 1-based row index of each valid row.
          const interleaved: string[] = [];
          const validExpectedIndices: number[] = [];
          const max = Math.max(validRows.length, malformedRows.length);
          for (let i = 0; i < max; i++) {
            if (i < validRows.length) {
              interleaved.push(validRows[i].row);
              validExpectedIndices.push(interleaved.length); // 1-based (header is row 0)
            }
            if (i < malformedRows.length) {
              interleaved.push(malformedRows[i]);
            }
          }
          const result = parseBatchCsv(buildCsv(interleaved));

          // No structural errors (header is valid; row count within limit).
          expect(result.structuralErrors).toEqual([]);
          // Sanity: the interleaving was actually built.
          expect(interleaved.length).toBe(
            validRows.length + malformedRows.length,
          );

          // Every valid row survives as a parsed row with the right index and
          // the exact hsCode/date values it was built with.
          const validByIndex = new Map(result.rows.map((r) => [r.rowIndex, r]));
          for (let i = 0; i < validRows.length; i++) {
            const expectedRowIndex = validExpectedIndices[i];
            const parsed = validByIndex.get(expectedRowIndex);
            expect(parsed).toBeDefined();
            expect(parsed!.input.hsCode).toBe(validRows[i].hsCode);
            // Date round-trips to the same UTC midnight.
            expect(parsed!.input.clearanceDate.getTime()).toBe(
              new Date(validRows[i].clearanceDate).getTime(),
            );
          }
          // The number of row errors equals the number of malformed rows.
          expect(result.rowErrors.length).toBe(malformedRows.length);
        },
      ),
    );
  });
});

describe("property — batch row independence", () => {
  it("a malformed row does not alter other rows' verdicts", () => {
    fc.assert(
      fc.property(
        fc.array(arbValidRow, { minLength: 2, maxLength: 5 }),
        fc.array(arbMalformedRow, { maxLength: 5 }),
        (validRows, malformedRows) => {
          // Baseline: parse only the valid rows → record their verdicts.
          const baseline = parseBatchCsv(buildCsv(validRows.map((v) => v.row)));
          const baselineVerdicts = baseline.rows.map((r) =>
            evaluate(r.input, ctx).verdict,
          );

          // Now interleave malformed rows among the same valid rows.
          const interleaved: string[] = [];
          const max = Math.max(validRows.length, malformedRows.length);
          for (let i = 0; i < max; i++) {
            if (i < validRows.length) interleaved.push(validRows[i].row);
            if (i < malformedRows.length) interleaved.push(malformedRows[i]);
          }
          const withMalformed = parseBatchCsv(buildCsv(interleaved));

          // The valid rows that survived still produce the identical verdicts,
          // in the same relative order — proving the malformed rows did not
          // perturb them.
          const survivedVerdicts = withMalformed.rows.map((r) =>
            evaluate(r.input, ctx).verdict,
          );
          expect(survivedVerdicts).toEqual(baselineVerdicts);
        },
      ),
    );
  });
});

// ===========================================================================
// 3. Cross-path consistency (single-check vs batch)
// ===========================================================================

/** A logical "form" input shared by both paths (string fields, like a form). */
const arbFormInput = fc.record({
  productType: fc.string({ maxLength: 15 }),
  grade: fc.string({ maxLength: 15 }),
  dimensions: fc.string({ maxLength: 15 }),
  material: fc.string({ maxLength: 15 }),
  hsCode: fc.constantFrom(...SEED_HS_CODES),
  clearanceDate: arbDateString,
  billOfLadingDate: fc.oneof(fc.constant(""), arbDateString),
  endUse: fc.string({ maxLength: 15 }),
});

describe("property — cross-path consistency", () => {
  it("identical inputs produce identical verdicts through the single-check and batch paths", () => {
    fc.assert(
      fc.property(arbFormInput, (form) => {
        // --- Single-check path: validateCheckInput -> EngineInput ---
        const singleValidation = validateCheckInput({
          productType: form.productType,
          grade: form.grade,
          dimensions: form.dimensions,
          material: form.material,
          hsCode: form.hsCode,
          clearanceDate: form.clearanceDate,
          billOfLadingDate: form.billOfLadingDate || undefined,
          endUse: form.endUse || undefined,
        });
        // The generator always supplies a valid hsCode + clearanceDate, so
        // validation succeeds; guard anyway for robustness.
        if (!singleValidation.ok) {
          // If validation somehow fails, the batch parse must also reject it,
          // keeping the two paths consistent (neither produces a verdict).
          const batch = parseBatchCsv(
            buildCsv([
              [
                csvCell(form.productType), csvCell(form.grade), csvCell(form.dimensions), csvCell(form.material),
                form.hsCode, form.clearanceDate, form.billOfLadingDate,
                "", csvCell(form.endUse), "",
              ].join(","),
            ]),
          );
          expect(batch.rows.length + batch.rowErrors.length).toBe(1);
          return;
        }
        const singleInput = singleValidation.input;

        // --- Batch path: parseBatchCsv -> EngineInput ---
        const batchRow = [
          csvCell(form.productType),
          csvCell(form.grade),
          csvCell(form.dimensions),
          csvCell(form.material),
          form.hsCode,
          form.clearanceDate,
          form.billOfLadingDate,
          "",
          csvCell(form.endUse),
          "",
        ].join(",");
        const batch = parseBatchCsv(buildCsv([batchRow]));
        expect(batch.rows).toHaveLength(1);
        expect(batch.rowErrors).toHaveLength(0);
        const batchInput = batch.rows[0].input;

        // Both paths funnel into the same pure engine with the same context.
        const singleVerdict = evaluate(singleInput, ctx).verdict;
        const batchVerdict = evaluate(batchInput, ctx).verdict;

        // **Validates: Requirements §10** — deterministic, pure determination
        // path; the two entry points must agree.
        expect(batchVerdict).toBe(singleVerdict);
      }),
    );
  });
});

// ===========================================================================
// 4. Date-boundary consistency between single and batch paths
// ===========================================================================

const STEEL_EFFECTIVE = new Date("2020-12-22T00:00:00.000Z");
const STEEL_GRACE_END = new Date("2021-03-22T00:00:00.000Z"); // +90 days
const FASTENERS_EFFECTIVE = new Date("2022-01-01T00:00:00.000Z");

/** Format a Date as "YYYY-MM-DD" (UTC) for CSV/date inputs. */
function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe("property — date-boundary consistency between single and batch paths", () => {
  it("at the steel effective + grace-window edges, single and batch agree", () => {
    fc.assert(
      fc.property(fc.integer({ min: -2, max: 95 }), (n) => {
        // Steel is BL-triggered; vary the BL date around the effective + grace edges.
        const blDate = new Date(STEEL_EFFECTIVE.getTime() + n * DAY_MS);
        const clearanceDate = new Date("2021-06-01T00:00:00.000Z");
        const blDay = toIsoDay(blDate);
        const clearanceDay = toIsoDay(clearanceDate);

        // Single path.
        const single = validateCheckInput({
          productType: "structural steel",
          grade: "E250",
          dimensions: "plates/sections/profiles",
          material: "carbon structural steel",
          hsCode: "7208.52",
          clearanceDate: clearanceDay,
          billOfLadingDate: blDay,
        });
        if (!single.ok) throw new Error("single validation failed");
        const singleVerdict = evaluate(single.input, ctx).verdict;

        // Batch path.
        const batchRow = [
          "structural steel", "E250", "plates/sections/profiles",
          "carbon structural steel", "7208.52", clearanceDay, blDay, "", "", "",
        ].join(",");
        const batch = parseBatchCsv(buildCsv([batchRow]));
        expect(batch.rows).toHaveLength(1);
        const batchVerdict = evaluate(batch.rows[0].input, ctx).verdict;

        // The two paths agree at every boundary.
        expect(batchVerdict).toBe(singleVerdict);

        // Boundary semantics (inclusive both ends):
        //   n <= 90 → GREEN (in grace window), n > 90 → RED (active + no exemption).
        const expected = n <= 90 ? "GREEN" : "RED";
        expect(singleVerdict).toBe(expected);
      }),
    );
  });

  it("at the fasteners effective + grace-window edges (clearance-triggered), single and batch agree", () => {
    fc.assert(
      fc.property(fc.integer({ min: -2, max: 65 }), (n) => {
        // Fasteners are clearance-triggered; vary the clearance date.
        const clearanceDate = new Date(FASTENERS_EFFECTIVE.getTime() + n * DAY_MS);
        const clearanceDay = toIsoDay(clearanceDate);

        const single = validateCheckInput({
          productType: "fasteners",
          grade: "Property Class 8.8",
          dimensions: "M6-M48",
          material: "carbon/alloy steel",
          hsCode: "7318.15",
          clearanceDate: clearanceDay,
        });
        if (!single.ok) throw new Error("single validation failed");
        const singleVerdict = evaluate(single.input, ctx).verdict;

        const batchRow = [
          "fasteners", "Property Class 8.8", "M6-M48",
          "carbon/alloy steel", "7318.15", clearanceDay, "", "", "", "",
        ].join(",");
        const batch = parseBatchCsv(buildCsv([batchRow]));
        expect(batch.rows).toHaveLength(1);
        const batchVerdict = evaluate(batch.rows[0].input, ctx).verdict;

        expect(batchVerdict).toBe(singleVerdict);

        // Grace window [2022-01-01, 2022-03-02] inclusive both ends (60 days):
        //   n <= 60 → GREEN, n > 60 → RED.
        const expected = n <= 60 ? "GREEN" : "RED";
        expect(singleVerdict).toBe(expected);
      }),
    );
  });

  it("the exact grace-window end is inclusive and both paths agree (steel)", () => {
    const blDay = toIsoDay(STEEL_GRACE_END);
    const clearanceDay = toIsoDay(new Date("2021-06-01T00:00:00.000Z"));

    const single = validateCheckInput({
      grade: "E250",
      dimensions: "plates/sections/profiles",
      material: "carbon structural steel",
      hsCode: "7208.52",
      clearanceDate: clearanceDay,
      billOfLadingDate: blDay,
    });
    if (!single.ok) throw new Error("single validation failed");

    const batchRow = [
      "x", "E250", "plates/sections/profiles", "carbon structural steel",
      "7208.52", clearanceDay, blDay, "", "", "",
    ].join(",");
    const batch = parseBatchCsv(buildCsv([batchRow]));

    const singleVerdict = evaluate(single.input, ctx).verdict;
    const batchVerdict = evaluate(batch.rows[0].input, ctx).verdict;
    expect(batchVerdict).toBe(singleVerdict);
    expect(singleVerdict).toBe("GREEN"); // grace end inclusive
  });
});

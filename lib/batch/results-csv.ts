import Papa from "papaparse";
import type { Determination } from "@prisma/client";

/**
 * CSV batch-upload — results CSV builder.
 *
 * Converts stored {@link Determination} rows (linked to a Batch) into a
 * downloadable CSV string with per-row verdicts and all references. This is the
 * server-side "downloadable results CSV" — it reconstructs from the DB so it
 * remains available after the upload session ends.
 *
 * @module lib/batch/results-csv
 */

/** The column order for the downloadable results CSV. */
export const RESULTS_CSV_COLUMNS = [
  "determinationId",
  "productType",
  "grade",
  "dimensions",
  "material",
  "hsCode",
  "clearanceDate",
  "billOfLadingDate",
  "verdict",
  "confidence",
  "isNumber",
  "gazetteReference",
  "circularReference",
  "transitionalStatus",
  "status",
] as const;

/** Read a JSONB `input` field safely as a string or empty. */
function inputField(
  input: unknown,
  key: string,
): string {
  if (typeof input !== "object" || input === null) return "";
  const val = (input as Record<string, unknown>)[key];
  if (val == null) return "";
  // Dates were serialised to ISO strings in the JSONB; return as-is.
  return String(val);
}

/**
 * Build a CSV string from a list of stored Determinations.
 *
 * Each determination becomes one CSV row with the input fields echoed back plus
 * the verdict, confidence, and all legal references (IS number, Gazette ref,
 * circular ref, transitional status, lifecycle status).
 *
 * @param determinations The Determination rows linked to a Batch (any order;
 *                       they are emitted in the given order).
 * @returns A CSV string (header + data rows) via papaparse `unparse`.
 */
export function buildResultsCsv(determinations: Determination[]): string {
  const rows = determinations.map((d) => ({
    determinationId: d.id,
    productType: inputField(d.input, "productType"),
    grade: inputField(d.input, "grade"),
    dimensions: inputField(d.input, "dimensions"),
    material: inputField(d.input, "material"),
    hsCode: inputField(d.input, "hsCode"),
    clearanceDate: inputField(d.input, "clearanceDate"),
    billOfLadingDate: inputField(d.input, "billOfLadingDate"),
    verdict: d.verdict,
    confidence: d.confidence,
    isNumber: d.isNumber ?? "",
    gazetteReference: d.gazetteReference ?? "",
    circularReference: d.circularReference ?? "",
    transitionalStatus: d.transitionalStatus ?? "",
    status: d.status,
  }));

  return Papa.unparse({
    fields: [...RESULTS_CSV_COLUMNS],
    data: rows,
  });
}

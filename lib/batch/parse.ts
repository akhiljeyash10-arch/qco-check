import Papa from "papaparse";
import type { EngineInput } from "@/lib/engine/types";

/**
 * CSV batch-upload — server-side parse module.
 *
 * Parses a raw CSV string, validates required columns, and converts each row
 * into an {@link EngineInput} (or collects a per-row error). Well-formed rows
 * are never discarded because of errors on other rows (row independence).
 *
 * Expected columns (case-insensitive headers, trimmed):
 *   Required: productType, grade, dimensions, material, hsCode, clearanceDate,
 *             billOfLadingDate
 *   Optional: msmeRegistered, endUse, notDomesticallyAvailable
 *
 * @module lib/batch/parse
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum rows accepted per upload (abuse guard). */
export const MAX_BATCH_ROWS = 1000;

/** The required CSV column headers (lower-cased, stripped of spaces/underscores/
 * hyphens for comparison — see {@link normaliseHeader}). */
const REQUIRED_COLUMNS = [
  "producttype",
  "grade",
  "dimensions",
  "material",
  "hscode",
  "clearancedate",
  "billofladingdate", // normaliseHeader("billOfLadingDate") => "billofladingdate"
];

// The canonical expected column names for display / error messages.
export const EXPECTED_HEADERS = [
  "productType",
  "grade",
  "dimensions",
  "material",
  "hsCode",
  "clearanceDate",
  "billOfLadingDate",
  "msmeRegistered",
  "endUse",
  "notDomesticallyAvailable",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A successfully parsed row. */
export interface ParsedRow {
  rowIndex: number; // 1-based (header is row 0)
  input: EngineInput;
}

/** A row that failed to parse or validate. */
export interface RowError {
  rowIndex: number; // 1-based
  errors: string[];
  rawRow: Record<string, string>;
}

/** Result of parsing an entire CSV string. */
export interface BatchParseResult {
  /** Rows that parsed cleanly and are ready for the engine. */
  rows: ParsedRow[];
  /** Per-row errors for rows that could not be parsed. */
  rowErrors: RowError[];
  /** Top-level structural errors (missing columns, empty file, row-limit). */
  structuralErrors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise a header by stripping spaces and lower-casing. */
function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]/g, "");
}

/**
 * Parse a date string (ISO "YYYY-MM-DD" or similar) into UTC midnight.
 * Returns `null` on failure.
 */
function parseDate(value: string | undefined): Date | null {
  if (!value || value.trim() === "") return null;
  const d = new Date(value.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Return trimmed string or undefined when blank. */
function trimOrUndef(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

/** Parse a boolean-ish CSV cell ("true"/"false"/"1"/"0"/"yes"/"no"). */
function parseBool(v: string | undefined): boolean | undefined {
  if (!v) return undefined;
  const lower = v.trim().toLowerCase();
  if (lower === "true" || lower === "1" || lower === "yes") return true;
  if (lower === "false" || lower === "0" || lower === "no") return false;
  return undefined;
}

// ---------------------------------------------------------------------------
// Column resolver
// ---------------------------------------------------------------------------

/**
 * Build a lookup from normalised header → original key.
 * Allows the CSV to use camelCase, lowercase, or hyphenated column names.
 */
function buildHeaderMap(headers: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const h of headers) {
    map.set(normaliseHeader(h), h);
  }
  return map;
}

/** Get a cell value using normalised key lookup. */
function getCell(
  row: Record<string, string>,
  headerMap: Map<string, string>,
  normKey: string,
): string | undefined {
  const original = headerMap.get(normKey);
  return original !== undefined ? row[original] : undefined;
}

// ---------------------------------------------------------------------------
// Main parse function
// ---------------------------------------------------------------------------

/**
 * Parse a raw CSV string into typed engine inputs with per-row error collection.
 *
 * The function is a pure transform — no DB or HTTP dependency. It:
 * 1. Uses papaparse to tokenise the CSV.
 * 2. Validates the header row for required columns.
 * 3. Enforces the row limit.
 * 4. Converts each data row to an {@link EngineInput} or a {@link RowError}.
 *
 * Malformed rows produce a {@link RowError} entry and do NOT stop other rows
 * from being processed (row independence).
 */
export function parseBatchCsv(csvText: string): BatchParseResult {
  const structuralErrors: string[] = [];
  const rows: ParsedRow[] = [];
  const rowErrors: RowError[] = [];

  // --- Tokenise with papaparse ---
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  // --- Check for catastrophic parse errors ---
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    structuralErrors.push("CSV could not be parsed. Please check the file format.");
    return { rows, rowErrors, structuralErrors };
  }

  const actualHeaders = parsed.meta.fields ?? [];

  if (actualHeaders.length === 0) {
    structuralErrors.push("CSV has no header row.");
    return { rows, rowErrors, structuralErrors };
  }

  if (parsed.data.length === 0) {
    structuralErrors.push("CSV contains no data rows.");
    return { rows, rowErrors, structuralErrors };
  }

  // --- Validate required columns ---
  const headerMap = buildHeaderMap(actualHeaders);
  const missingCols: string[] = [];

  for (const requiredNorm of REQUIRED_COLUMNS) {
    if (!headerMap.has(requiredNorm)) {
      // Find the display name for the missing column
      const display = EXPECTED_HEADERS.find(
        (h) => normaliseHeader(h) === requiredNorm,
      ) ?? requiredNorm;
      missingCols.push(display);
    }
  }

  if (missingCols.length > 0) {
    structuralErrors.push(
      `CSV is missing required columns: ${missingCols.join(", ")}.`,
    );
    return { rows, rowErrors, structuralErrors };
  }

  // --- Row limit ---
  if (parsed.data.length > MAX_BATCH_ROWS) {
    structuralErrors.push(
      `CSV exceeds the maximum of ${MAX_BATCH_ROWS} rows (found ${parsed.data.length}).`,
    );
    return { rows, rowErrors, structuralErrors };
  }

  // --- Per-row processing ---
  parsed.data.forEach((rawRow, idx) => {
    const rowIndex = idx + 1; // 1-based
    const errors: string[] = [];

    const hsCode = trimOrUndef(getCell(rawRow, headerMap, "hscode"));
    if (!hsCode) errors.push("hsCode is required.");

    const clearanceDateStr = getCell(rawRow, headerMap, "clearancedate");
    const clearanceDate = parseDate(clearanceDateStr);
    if (!clearanceDateStr || clearanceDateStr.trim() === "") {
      errors.push("clearanceDate is required.");
    } else if (!clearanceDate) {
      errors.push(`clearanceDate "${clearanceDateStr}" is not a valid date.`);
    }

    const blDateStr = getCell(rawRow, headerMap, "billofladingdate");
    const billOfLadingDate = parseDate(blDateStr);
    if (blDateStr && blDateStr.trim() !== "" && !billOfLadingDate) {
      errors.push(`billOfLadingDate "${blDateStr}" is not a valid date.`);
    }

    if (errors.length > 0) {
      rowErrors.push({ rowIndex, errors, rawRow });
      return;
    }

    const input: EngineInput = {
      productType: trimOrUndef(getCell(rawRow, headerMap, "producttype")),
      grade: trimOrUndef(getCell(rawRow, headerMap, "grade")),
      dimensions: trimOrUndef(getCell(rawRow, headerMap, "dimensions")),
      material: trimOrUndef(getCell(rawRow, headerMap, "material")),
      hsCode: hsCode!,
      clearanceDate: clearanceDate!,
      billOfLadingDate: billOfLadingDate ?? undefined,
      msmeRegistered: parseBool(
        getCell(rawRow, headerMap, "msmeregistered"),
      ),
      endUse: trimOrUndef(getCell(rawRow, headerMap, "enduse")),
      notDomesticallyAvailable: parseBool(
        getCell(rawRow, headerMap, "notdomesticallyavailable"),
      ),
    };

    rows.push({ rowIndex, input });
  });

  return { rows, rowErrors, structuralErrors };
}

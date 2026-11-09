import type { EngineInput } from "@/lib/engine/types";

/**
 * Input validation for the single-check API.
 *
 * A pure function over the raw request body (with date strings) that returns
 * either a validated {@link EngineInput} (dates parsed to JS `Date`) or a list
 * of human-readable errors. Keeping this standalone makes it fully unit-testable
 * without an HTTP layer or database.
 *
 * @module lib/check/validation
 */

/** The raw shape of a POST /api/check body (all fields loosely typed). */
export interface CheckRequestBody {
  productType?: string;
  grade?: string;
  dimensions?: string;
  material?: string;
  hsCode?: string;
  /** ISO date string (e.g. "2021-06-01") from the date input. */
  clearanceDate?: string;
  /** ISO date string; optional unless the governing QCO keys off BL date. */
  billOfLadingDate?: string;
  msmeRegistered?: boolean;
  endUse?: string;
  notDomesticallyAvailable?: boolean;
}

export type ValidationResult =
  | { ok: true; input: EngineInput }
  | { ok: false; errors: string[] };

/**
 * Parse a date string into a UTC `Date`. Date-only strings ("2021-06-01") are
 * parsed as UTC midnight per the ES spec, matching the engine's convention.
 *
 * @returns a valid `Date`, or `null` when the value is empty/invalid.
 */
function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const d = new Date(value.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Validate a raw check-request body.
 *
 * Required: `hsCode` (non-empty), `clearanceDate` (valid date).
 * Optional: all other fields. `billOfLadingDate`, when present, must be a valid
 * date (the engine returns AMBER if a BL-trigger QCO needs it but it's absent;
 * an *invalid* date is a client error).
 */
export function validateCheckInput(body: Partial<CheckRequestBody>): ValidationResult {
  const errors: string[] = [];

  // --- hsCode (required) -----------------------------------------------------
  const hsCode = typeof body.hsCode === "string" ? body.hsCode.trim() : "";
  if (hsCode === "") {
    errors.push("HS code is required.");
  }

  // --- clearanceDate (required) ----------------------------------------------
  const clearanceDate = parseDate(body.clearanceDate);
  if (body.clearanceDate && body.clearanceDate.trim() !== "" && !clearanceDate) {
    errors.push("Clearance date is not a valid date.");
  }
  if (!body.clearanceDate || body.clearanceDate.trim() === "") {
    errors.push("Clearance date is required.");
  }

  // --- billOfLadingDate (optional, but must be valid if present) -------------
  const billOfLadingDate = parseDate(body.billOfLadingDate);
  if (body.billOfLadingDate && body.billOfLadingDate.trim() !== "" && !billOfLadingDate) {
    errors.push("Bill of Lading date is not a valid date.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const input: EngineInput = {
    productType: trimOrUndef(body.productType),
    grade: trimOrUndef(body.grade),
    dimensions: trimOrUndef(body.dimensions),
    material: trimOrUndef(body.material),
    hsCode,
    clearanceDate: clearanceDate!,
    billOfLadingDate: billOfLadingDate ?? undefined,
    msmeRegistered: body.msmeRegistered === true ? true : undefined,
    endUse: trimOrUndef(body.endUse),
    notDomesticallyAvailable:
      body.notDomesticallyAvailable === true ? true : undefined,
  };

  return { ok: true, input };
}

/** Return the trimmed string, or `undefined` when empty/not a string. */
function trimOrUndef(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

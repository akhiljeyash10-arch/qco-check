import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildFirmScope } from "@/lib/tenant";
import type { SessionUser } from "@/lib/session";
import { evaluate } from "@/lib/engine/engine";
import type { EngineResult, RuleContext } from "@/lib/engine/types";
import { loadRuleContext, serializeContext } from "@/lib/rule-loader";
import { routeAmberDeterminationToQueue } from "@/lib/queue/service";
import { parseBatchCsv } from "@/lib/batch/parse";
import type { BatchParseResult } from "@/lib/batch/parse";

/**
 * CSV batch-upload service.
 *
 * Orchestrates: parse CSV → run the engine per row → persist a Batch record +
 * N Determination records (firm-scoped) → return per-row results.
 *
 * Firm identity is derived exclusively from the session (never the client).
 * Per-row errors do NOT abort other rows (row independence).
 *
 * @module lib/batch/service
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single row's outcome, whether a verdict or an error. */
export interface BatchRowResult {
  rowIndex: number;
  /** Set when the engine produced a verdict. */
  determinationId?: string;
  verdict?: EngineResult["verdict"];
  confidence?: number;
  isNumber?: string | null;
  gazetteReference?: string | null;
  circularReference?: string | null;
  transitionalStatus?: string | null;
  /** Set when the row failed (parse error OR engine throw). */
  error?: string;
  /** Input data stored on the row for the results table display. */
  hsCode?: string;
  productType?: string;
  grade?: string;
}

/** Full result returned by {@link runBatch}. */
export interface BatchResult {
  batchId: string;
  fileName: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  rowResults: BatchRowResult[];
  /** Top-level structural errors (column mismatch, row-limit, empty file). */
  structuralErrors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

// ---------------------------------------------------------------------------
// Core service
// ---------------------------------------------------------------------------

/**
 * Run a CSV batch upload for a signed-in USER.
 *
 * Steps:
 * 1. Parse + validate the CSV (header + per-row).
 * 2. Create a {@link Batch} record with status PROCESSING.
 * 3. Load the rule context (once, shared for all rows).
 * 4. Run the engine per valid row; persist each as a {@link Determination}
 *    linked to the Batch and scoped to the user's firm.
 * 5. Collect per-row errors without aborting other rows.
 * 6. Update the Batch status to COMPLETED (or FAILED when 0 rows succeed).
 *
 * @param csvText  Raw file content as a UTF-8 string.
 * @param fileName Original filename (stored on the Batch for reference).
 * @param user     Session-derived user (firmId from session, never client).
 */
export async function runBatch(
  csvText: string,
  fileName: string,
  user: SessionUser,
): Promise<BatchResult> {
  const scope = buildFirmScope(user);
  const firmId = scope.firmId!; // guaranteed non-null for a USER

  // --- 1. Parse ---
  const parseResult: BatchParseResult = parseBatchCsv(csvText);

  if (parseResult.structuralErrors.length > 0) {
    // Structural errors: cannot proceed. Return without creating a Batch row.
    return {
      batchId: "",
      fileName,
      totalRows: 0,
      successRows: 0,
      errorRows: 0,
      rowResults: [],
      structuralErrors: parseResult.structuralErrors,
    };
  }

  const totalDataRows =
    parseResult.rows.length + parseResult.rowErrors.length;

  // --- 2. Create the Batch record ---
  const batch = await prisma.batch.create({
    data: {
      firmId,
      userId: user.id,
      fileName,
      totalRows: totalDataRows,
      status: "PROCESSING",
    },
  });

  // Audit the batch creation (full AuditLog coverage, Task 10).
  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "BATCH",
      entity: "Batch",
      entityId: batch.id,
      // No prior state on a create — omit `before` (Prisma JSON-null semantics).
      after: toJson({
        fileName,
        totalRows: totalDataRows,
        firmId,
      }),
    },
  });

  // --- 3. Load rule context once ---
  const ruleContext: RuleContext = await loadRuleContext();
  const serializedContext = serializeContext(ruleContext);

  const rowResults: BatchRowResult[] = [];

  // --- 4a. Engine + persist for valid rows ---
  for (const parsedRow of parseResult.rows) {
    const baseResult: BatchRowResult = {
      rowIndex: parsedRow.rowIndex,
      hsCode: parsedRow.input.hsCode,
      productType: parsedRow.input.productType,
      grade: parsedRow.input.grade,
    };

    try {
      const engineResult = evaluate(parsedRow.input, ruleContext);

      const determination = await prisma.determination.create({
        data: {
          firmId,
          userId: user.id,
          batchId: batch.id,
          input: toJson(parsedRow.input),
          qcoItemId: engineResult.qcoItemId,
          qcoId: engineResult.qcoId,
          enforcementCircularId: engineResult.enforcementCircularId,
          verdict: engineResult.verdict,
          confidence: engineResult.confidence,
          isNumber: engineResult.isNumber,
          gazetteReference: engineResult.gazetteReference,
          circularReference: engineResult.circularReference,
          transitionalStatus: engineResult.transitionalStatus,
          reasoningTrace: toJson(engineResult.reasoningTrace),
          status: engineResult.status,
          ruleVersionSnapshot: serializedContext,
        },
      });

      // Audit the per-row determination write (full AuditLog coverage, Task 10).
      await prisma.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "CHECK",
          entity: "Determination",
          entityId: determination.id,
          // No prior state on a create — omit `before` (Prisma JSON-null semantics).
          after: toJson({
            verdict: determination.verdict,
            confidence: determination.confidence,
            isNumber: determination.isNumber,
            batchId: batch.id,
            rowIndex: parsedRow.rowIndex,
          }),
        },
      });

      // Route Amber determinations to the admin review queue (Task 9).
      if (engineResult.status === "PENDING_REVIEW") {
        await routeAmberDeterminationToQueue(determination.id);
      }

      rowResults.push({
        ...baseResult,
        determinationId: determination.id,
        verdict: engineResult.verdict,
        confidence: engineResult.confidence,
        isNumber: engineResult.isNumber,
        gazetteReference: engineResult.gazetteReference,
        circularReference: engineResult.circularReference,
        transitionalStatus: engineResult.transitionalStatus,
      });
    } catch (err) {
      rowResults.push({
        ...baseResult,
        error:
          err instanceof Error ? err.message : "Unexpected error during check.",
      });
    }
  }

  // --- 4b. Collect parse errors ---
  for (const rowError of parseResult.rowErrors) {
    rowResults.push({
      rowIndex: rowError.rowIndex,
      hsCode: rowError.rawRow["hsCode"] ?? rowError.rawRow["hscode"],
      productType: rowError.rawRow["productType"] ?? rowError.rawRow["producttype"],
      grade: rowError.rawRow["grade"],
      error: rowError.errors.join("; "),
    });
  }

  // Sort results by row index for consistent ordering.
  rowResults.sort((a, b) => a.rowIndex - b.rowIndex);

  const successRows = rowResults.filter((r) => !r.error).length;
  const errorRows = rowResults.filter((r) => !!r.error).length;

  // --- 5. Update Batch status ---
  const finalStatus = successRows > 0 ? "COMPLETED" : "FAILED";
  await prisma.batch.update({
    where: { id: batch.id },
    data: { status: finalStatus },
  });

  return {
    batchId: batch.id,
    fileName,
    totalRows: totalDataRows,
    successRows,
    errorRows,
    rowResults,
    structuralErrors: [],
  };
}

import { Prisma, type Determination } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildFirmScope } from "@/lib/tenant";
import type { SessionUser } from "@/lib/session";
import { evaluate } from "@/lib/engine/engine";
import type { EngineInput, EngineResult, RuleContext } from "@/lib/engine/types";
import { loadRuleContext, serializeContext } from "@/lib/rule-loader";
import { routeAmberDeterminationToQueue } from "@/lib/queue/service";

/**
 * The single-check service.
 *
 * The core end-to-end flow: load the active rule versions, run the pure-TS
 * engine, persist a firm-scoped `Determination` (with reasoning trace + rule
 * version snapshot), and return the verdict. This is the testable unit the
 * API route delegates to — it has no HTTP dependency, so integration tests can
 * call it directly against the seeded DB.
 *
 * `firmId` is derived from the session via {@link buildFirmScope} and is never
 * accepted from the client.
 *
 * @module lib/check/service
 */

/** The engine result augmented with the persisted determination's id. */
export interface CheckResult extends EngineResult {
  determinationId: string;
}

/** Deep-clone a value to a JSON-safe form (Date → ISO string) for Prisma JSONB. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Convert an {@link EngineInput} to a JSON-safe snapshot for storage. */
function serializeInput(input: EngineInput): Prisma.InputJsonValue {
  return toJson(input);
}

/**
 * Run a single applicability check for a signed-in USER and persist the result.
 *
 * @param input  Validated engine input (dates are JS `Date` objects).
 * @param user   The session-derived user. Must be a USER with a firmId
 *               (enforced by {@link buildFirmScope}).
 * @returns the engine result plus the persisted determination id.
 */
export async function runCheck(
  input: EngineInput,
  user: SessionUser,
): Promise<CheckResult> {
  // Derive firmId from the session — never from the client.
  const scope = buildFirmScope(user);
  const firmId = scope.firmId!; // guaranteed non-null for a USER by buildFirmScope

  const ruleContext = await loadRuleContext();
  const result = evaluate(input, ruleContext);

  const determination = await persistDetermination(
    input,
    result,
    ruleContext,
    firmId,
    user.id,
  );

  // Audit every determination write (full AuditLog coverage, Task 10).
  await writeDeterminationAudit(user.id, determination);

  // Route Amber determinations to the admin review queue (Task 9).
  if (result.status === "PENDING_REVIEW") {
    await routeAmberDeterminationToQueue(determination.id);
  }

  return { ...result, determinationId: determination.id };
}

/**
 * Write an AuditLog entry for a freshly created Determination (full audit
 * coverage of all write operations). `before` is null on a create; `after`
 * carries the verdict + confidence + references so the audit trail records
 * what was decided, not just that something was written.
 */
async function writeDeterminationAudit(
  actorUserId: string,
  determination: Determination,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId,
      action: "CHECK",
      entity: "Determination",
      entityId: determination.id,
      // No prior state on a create — omit `before` (Prisma distinguishes JSON
      // null from an unset column; a create has no "before" state — matches the
      // rule-editor audit pattern in lib/admin/rules-actions.ts).
      after: {
        verdict: determination.verdict,
        confidence: determination.confidence,
        isNumber: determination.isNumber,
        gazetteReference: determination.gazetteReference,
        status: determination.status,
      } as Prisma.InputJsonValue,
    },
  });
}

/**
 * Persist a {@link Determination} scoped to the user's firm. Exported so tests
 * can verify the firm-scoped write directly.
 */
export async function persistDetermination(
  input: EngineInput,
  result: EngineResult,
  ruleContext: RuleContext,
  firmId: string,
  userId: string,
): Promise<Determination> {
  return prisma.determination.create({
    data: {
      firmId,
      userId,
      input: serializeInput(input),
      qcoItemId: result.qcoItemId,
      qcoId: result.qcoId,
      enforcementCircularId: result.enforcementCircularId,
      verdict: result.verdict,
      confidence: result.confidence,
      isNumber: result.isNumber,
      gazetteReference: result.gazetteReference,
      circularReference: result.circularReference,
      transitionalStatus: result.transitionalStatus,
      reasoningTrace: toJson(result.reasoningTrace),
      status: result.status,
      ruleVersionSnapshot: serializeContext(ruleContext),
    },
  });
}

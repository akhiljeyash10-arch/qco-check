"use server";

/**
 * Admin review-queue server actions (Task 9).
 *
 * Thin server-action wrappers over {@link lib/queue/service}. Each action:
 *  - requires an ADMIN session (the session is the source of identity; the
 *    service re-checks the role as defense-in-depth), and
 *  - delegates to the testable service layer, passing the session-derived user.
 *
 * Read helpers (`getReviewQueue`, `getReviewCase`) are also server actions so
 * they can be awaited from server components in the `(admin)` route group.
 *
 * @module lib/admin/queue-actions
 */

import { getSessionUser } from "@/lib/session";
import {
  listPendingReviewQueue,
  getReviewCase,
  resolveAmberCase,
  promoteToRule,
  type PromoteQcoItemInput,
  type ResolutionVerdict,
  type ReviewQueueEntry,
  type ReviewCaseDetail,
  type ActionResult,
} from "@/lib/queue/service";

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

/**
 * Require an authenticated ADMIN session. Returns the session-derived user so
 * it can be passed to the service layer. Mirrors the rule-editor guard.
 */
async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) throw new Error("Unauthenticated");
  if (user.role !== "ADMIN") throw new Error("Forbidden: ADMIN role required");
  return user;
}

// ---------------------------------------------------------------------------
// Read helpers (server components)
// ---------------------------------------------------------------------------

/** List all PENDING Amber cases across all firms (admin-only). */
export async function getReviewQueue(): Promise<ReviewQueueEntry[]> {
  await requireAdmin();
  return listPendingReviewQueue();
}

/** Load the full review-case detail (admin-only). */
export async function getReviewCaseDetail(
  determinationId: string,
): Promise<ReviewCaseDetail | null> {
  await requireAdmin();
  return getReviewCase(determinationId);
}

// ---------------------------------------------------------------------------
// Write actions
// ---------------------------------------------------------------------------

/**
 * Resolve an Amber case: admin sets a final verdict + notes.
 * @returns the action result (ok/error) from the service.
 */
export async function resolveCaseAction(
  determinationId: string,
  resolutionVerdict: ResolutionVerdict,
  adminNotes: string,
): Promise<ActionResult<{ determinationId: string }>> {
  const user = await requireAdmin();
  return resolveAmberCase(determinationId, user, resolutionVerdict, adminNotes);
}

/**
 * Promote an Amber case into a new QCOItem (the promote-to-rule flow).
 * @returns the action result with the created QCOItem id.
 */
export async function promoteCaseAction(
  determinationId: string,
  input: PromoteQcoItemInput,
): Promise<ActionResult<{ qcoItemId: string }>> {
  const user = await requireAdmin();
  return promoteToRule(determinationId, user, input);
}

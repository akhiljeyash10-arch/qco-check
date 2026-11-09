import type { Firm } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildFirmScope } from "@/lib/tenant";
import type { SessionUser } from "@/lib/session";

/**
 * Firm-scoped data-access layer.
 *
 * Every query here derives the firmId from the server-side session via the
 * {@link buildFirmScope} helper — a client-supplied `firmId` is never accepted.
 * Domain-specific queries (determinations/batches, admin queue) are added in
 * later tasks; this module establishes the scoping pattern the rest build on.
 */

/**
 * Resolve the signed-in USER's firm (server-side, session-derived firmId).
 *
 * @returns the firm for a USER, or `null` for an ADMIN (platform operators have
 *          no firm) / a USER whose firm could not be found.
 */
export async function getFirmForUser(user: SessionUser): Promise<Firm | null> {
  if (user.role !== "USER") return null;
  const scope = buildFirmScope(user);
  return scope.firmId
    ? prisma.firm.findUnique({ where: { id: scope.firmId } })
    : null;
}

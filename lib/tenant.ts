import type { SessionUser } from "@/lib/session";

/**
 * Tenant-scoping for the data-access layer.
 *
 * The design principle: `firmId` is always derived from the server-side session
 * and never trusted from the client. A USER is scoped to their own firm for
 * tenant-isolated data (determinations/batches). An ADMIN bypasses firm scoping
 * — they see all firms (e.g. the review queue and every firm's Amber cases).
 * Rules are global and never firm-scoped.
 *
 * This helper is a pure function over a {@link SessionUser} so it is fully
 * unit-testable without Auth.js or a database.
 */
export interface FirmScope {
  /**
   * Prisma `where` fragment that scopes a query to a single firm, or
   * `undefined` when the caller must apply no firm filter (ADMIN sees all).
   * Spread this into a query's `where` (e.g. `{ ...firmWhere, status: ... }`).
   */
  firmWhere: { firmId: string } | undefined;
  /** The effective firmId being applied, or `null` for an unscoped (ADMIN) query. */
  firmId: string | null;
  /** Whether this scope restricts results to a single firm. */
  scoped: boolean;
}

/**
 * Build the firm scope for a session-derived user.
 *
 * @param user The authenticated user derived from the session, or `null`.
 * @throws when there is no session, or when a USER session is missing a firmId
 *         (an invariant violation — every USER belongs to exactly one firm).
 */
export function buildFirmScope(user: SessionUser | null): FirmScope {
  if (!user) {
    throw new Error(
      "Unauthenticated: cannot build a firm scope without a session.",
    );
  }
  // ADMIN is a platform operator — no firm filter; sees all firms.
  if (user.role === "ADMIN") {
    return { firmWhere: undefined, firmId: null, scoped: false };
  }
  // USER scope — derive firmId from the session; never trust the client.
  if (!user.firmId) {
    throw new Error("Invalid session: a USER must belong to a firm.");
  }
  return {
    firmWhere: { firmId: user.firmId },
    firmId: user.firmId,
    scoped: true,
  };
}

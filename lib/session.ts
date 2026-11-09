import { safeAuth } from "@/lib/safe-auth";

/**
 * Application role. Structurally identical to the Prisma-generated `Role`
 * enum (`"USER" | "ADMIN"`) so the two can be used interchangeably; kept here as
 * a plain union so pure helpers (and their tests) don't need to import the
 * generated Prisma client.
 */
export type Role = "USER" | "ADMIN";

/**
 * The authenticated user as derived server-side from the Auth.js session.
 *
 * `firmId` + `role` come exclusively from the session, never from the client.
 * `firmId` is null for ADMIN platform operators and required for USER users
 * (enforced by `buildFirmScope`).
 */
export interface SessionUser {
  id: string;
  role: Role;
  firmId: string | null;
  name?: string | null;
  email?: string | null;
}

/**
 * Derive the authenticated user from the server-side Auth.js session.
 *
 * This is the single entry point data-access code should use to obtain the
 * caller's identity; it returns `null` when there is no session so callers can
 * guard unauthenticated access explicitly.
 *
 * Backed by `safeAuth` (not the raw `auth()`) so a stale or corrupt JWT cookie
 * is treated as "logged out" rather than crashing the request.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await safeAuth();
  if (!session?.user) return null;
  return {
    id: session.user.id,
    role: session.user.role,
    firmId: session.user.firmId,
    name: session.user.name,
    email: session.user.email,
  };
}

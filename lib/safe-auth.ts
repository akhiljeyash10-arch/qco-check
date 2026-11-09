import { auth } from "@/auth";

/**
 * Resilient wrapper around Auth.js `auth()`.
 *
 * The raw `auth()` from `@/auth` throws a `JWTSessionError` (or similar) when
 * the session cookie is present but cannot be decoded — for example when
 * `AUTH_SECRET` has been rotated, the cookie is corrupt, or it was signed by a
 * different environment. In server components this unhandled throw crashes the
 * whole page (HTTP 500) instead of simply treating the visitor as anonymous.
 *
 * `safeAuth` catches those decode failures and returns `null`, so callers can
 * fall through to their "unauthenticated" branch (redirect to sign-in / show the
 * landing page) instead of erroring. Every server component / layout that needs
 * the session should prefer `safeAuth` over the raw `auth()`; data-access code
 * continues to use `getSessionUser()` which is now backed by this helper.
 *
 * @returns the session object, or `null` when the visitor is anonymous **or**
 *          the JWT could not be decoded.
 */
export async function safeAuth() {
  try {
    return await auth();
  } catch {
    // JWT decode failure (stale/invalid/corrupt cookie) → treat as logged out.
    return null;
  }
}

/**
 * Lightweight in-memory rate limiter (Task 10).
 *
 * A minimal, dependency-free sliding-window counter keyed by an arbitrary
 * identifier (typically the session user id for authenticated routes, or the
 * request IP for public ones). State lives in a module-level `Map` and is
 * scoped to this server process — sufficient for a single-instance V1 and
 * intentionally simple to match the project's stack (no new dependencies).
 *
 * The limiter is a pure, deterministic function over a shared store so it is
 * fully unit-testable: tests can clear the store between cases and assert the
 * allow/deny boundary exactly.
 *
 * @module lib/rate-limit
 */

/** Result of a rate-limit check. */
export interface RateLimitResult {
  /** Whether the request is allowed (under the limit). */
  allowed: boolean;
  /** Remaining requests in the current window. */
  remaining: number;
  /** Unix ms timestamp at which the window resets (for Retry-After headers). */
  resetAt: number;
}

interface Bucket {
  /** Timestamp (ms) when the current window started. */
  windowStart: number;
  /** Count of requests recorded in the current window. */
  count: number;
}

/** The shared in-memory store: key → bucket. Exported for test access. */
export const rateLimitStore = new Map<string, Bucket>();

/**
 * Check + record a request against the sliding window for `key`.
 *
 * The window is fixed-size (not a true sliding log): when `now` falls outside
 * `[windowStart, windowStart + windowMs)`, a fresh window is started. Within a
 * window, each call increments the count; the request is allowed while
 * `count <= limit`.
 *
 * @param key       Identifier to limit by (user id / IP).
 * @param limit     Maximum requests allowed per window.
 * @param windowMs  Window size in milliseconds.
 * @param now       Optional "current time" (ms) — injected by tests so the
 *                  limiter is deterministic and time-independent.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  let bucket = rateLimitStore.get(key);

  // Start a fresh window if none exists or the previous window has elapsed.
  if (!bucket || now >= bucket.windowStart + windowMs) {
    bucket = { windowStart: now, count: 0 };
    rateLimitStore.set(key, bucket);
  }

  bucket.count += 1;
  const resetAt = bucket.windowStart + windowMs;

  if (bucket.count <= limit) {
    return {
      allowed: true,
      remaining: Math.max(0, limit - bucket.count),
      resetAt,
    };
  }

  return { allowed: false, remaining: 0, resetAt };
}

/** Clear the entire rate-limit store (test helper). */
export function resetRateLimitStore(): void {
  rateLimitStore.clear();
}

/**
 * Derive a rate-limit key from a Request + optional user id.
 *
 * Authenticated users are limited per user id (stable, avoids NAT/shared-IP
 * false positives); unauthenticated callers fall back to the client IP (best
 * effort — `x-forwarded-for` first, then the connection IP).
 */
export function rateLimitKey(
  request: Request,
  userId?: string | null,
): string {
  if (userId) return `user:${userId}`;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return `ip:${forwarded.split(",")[0]!.trim()}`;
  return `ip:${request.headers.get("x-real-ip") ?? "unknown"}`;
}

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { validateCheckInput } from "@/lib/check/validation";
import { runCheck } from "@/lib/check/service";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";

// A determination reads the live DB + session — never prerender at build.
export const dynamic = "force-dynamic";

/**
 * Per-user rate limit for the single-check endpoint: 60 checks per minute.
 * A simple abuse guard for V1 (single-instance, in-memory); a distributed
 * store would replace it for multi-instance deployments.
 */
const CHECK_LIMIT = 60;
const CHECK_WINDOW_MS = 60_000;

/**
 * POST /api/check — single applicability check.
 *
 * Requires an authenticated USER. Validates the body, loads the active rule
 * versions, runs the pure-TS engine, persists a firm-scoped Determination
 * (firmId from the session, never the client), and returns the verdict with
 * all references (IS number, Gazette ref, circular ref, transitional status,
 * reasoning trace).
 *
 * Status codes:
 *  401 — not authenticated.
 *  403 — authenticated but not a USER (admins curate rules, not determinations).
 *  400 — validation errors.
 *  200 — verdict returned.
 */
export async function POST(request: Request) {
  // --- Auth: the session is the source of identity + firm. -------------------
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (user.role !== "USER") {
    return NextResponse.json(
      { error: "Only users can run checks." },
      { status: 403 },
    );
  }

  // --- Rate limit: per-user sliding window (abuse guard). -------------------
  const limitKey = rateLimitKey(request, user.id);
  const rl = rateLimit(limitKey, CHECK_LIMIT, CHECK_WINDOW_MS);
  if (!rl.allowed) {
    const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Too many requests. Please slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.max(retryAfter, 1)) } },
    );
  }

  // --- Parse + validate the body. -------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const validation = validateCheckInput(body);
  if (!validation.ok) {
    return NextResponse.json(
      { error: "Validation failed.", details: validation.errors },
      { status: 400 },
    );
  }

  // --- Run the check (load rules, engine, persist). -------------------------
  try {
    const result = await runCheck(validation.input, user);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Check failed:", error);
    return NextResponse.json(
      { error: "An error occurred while running the check." },
      { status: 500 },
    );
  }
}

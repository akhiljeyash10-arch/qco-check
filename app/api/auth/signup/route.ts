import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Minimum password length for new accounts (matches the server action). */
const MIN_PASSWORD = 8;

/**
 * Per-IP rate limit for signups: 5 per minute (public endpoint, no auth).
 * Prevents automated account-creation spam.
 */
const SIGNUP_LIMIT = 5;
const SIGNUP_WINDOW_MS = 60_000;

/**
 * POST /api/auth/signup — self-serve registration endpoint.
 *
 * Creates a new `Firm` + `User` (role `USER`) in PostgreSQL via Prisma, hashing
 * the password with bcryptjs. Returns a JSON response on success or failure.
 *
 * Rate-limited per IP (5/min) since this is a public, unauthenticated endpoint.
 *
 * This endpoint handles registration only (no auto sign-in — the server action
 * `register` in `lib/auth-actions.ts` does both for the form flow). It exists
 * for programmatic / API consumers.
 */
export async function POST(request: Request) {
  // --- Rate limit: per-IP sliding window (spam guard). ----------------------
  const limitKey = rateLimitKey(request, null);
  const rl = rateLimit(limitKey, SIGNUP_LIMIT, SIGNUP_WINDOW_MS);
  if (!rl.allowed) {
    const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Too many sign-up attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.max(retryAfter, 1)) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const firmName = String(body.firmName ?? "").trim();
  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").toLowerCase().trim();
  const password = String(body.password ?? "");

  // --- Validation --------------------------------------------------------
  const fieldErrors: Record<string, string> = {};
  if (!firmName) fieldErrors.firmName = "Firm name is required.";
  if (!fullName) fieldErrors.fullName = "Full name is required.";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = "A valid email is required.";
  }
  if (!password || password.length < MIN_PASSWORD) {
    fieldErrors.password = `Password must be at least ${MIN_PASSWORD} characters.`;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json(
      { error: "Validation failed.", fieldErrors },
      { status: 400 },
    );
  }

  // --- Duplicate-email check ---------------------------------------------
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 },
    );
  }

  // --- Create Firm + User ------------------------------------------------
  const passwordHash = await bcrypt.hash(password, 12);
  const firm = await prisma.firm.create({ data: { name: firmName } });
  await prisma.user.create({
    data: {
      email,
      name: fullName,
      passwordHash,
      role: "USER",
      firmId: firm.id,
    },
  });

  return NextResponse.json(
    { ok: true, message: "Account created. Use the credentials to sign in." },
    { status: 201 },
  );
}

"use server";

import { signIn, signOut } from "@/auth";
import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Server actions for authentication.
 *
 * Kept in a `"use server"` module so they can be bound to `<form action={...}>`
 * and `useActionState` from client components.
 */

// ---------------------------------------------------------------------------
// Redirect-error detection
// ---------------------------------------------------------------------------

/**
 * Check whether an error thrown inside a server action is a Next.js redirect
 * error (which `signIn` throws on success via `redirect()`).
 *
 * Next.js encodes redirect errors as plain objects with a `digest` property
 * whose value starts with `"NEXT_REDIRECT;"`. These MUST be re-thrown so the
 * framework can perform the navigation — swallowing them causes the form to
 * hang on "Signing in…" forever.
 */
function isNextRedirectError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return false;
  }
  const digest = (error as { digest: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT;");
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/**
 * Credentials login.
 *
 * @returns a plain `{ error }` object on invalid credentials so the form can
 *          render the message; a successful login throws `NEXT_REDIRECT` (to
 *          `/`), which is re-thrown so Next.js performs the redirect — home
 *          then routes the user to their role's area.
 */
export async function login(
  _prevState: unknown,
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").toLowerCase();
  const password = String(formData.get("password") ?? "");
  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    // Redirect errors MUST escape so Next.js performs the navigation.
    if (isNextRedirectError(error)) {
      throw error;
    }
    // Auth.js throws AuthError for auth failures (invalid credentials, etc.).
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    // Database / network errors — don't hang, show a clean message.
    console.error("Sign-in error:", error);
    return { error: "Sign-in failed. Please try again." };
  }
  // On success the redirect above throws; reaching here means no error and
  // no redirect — return an empty object for completeness.
  return {};
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

/** Sign out, then return to home. */
export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

// ---------------------------------------------------------------------------
// Self-serve registration
// ---------------------------------------------------------------------------

/** Minimum password length for new accounts. */
const MIN_PASSWORD = 8;

/**
 * Validation + creation result returned to the signup form. On success the
 * caller never sees this — `signIn` throws `NEXT_REDIRECT` first — but the
 * type keeps the `useActionState` contract honest.
 */
export interface RegisterResult {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Self-serve sign-up for new Importers / CHAs.
 *
 * Creates a new `Firm` + `User` (role `USER`) in PostgreSQL via Prisma, hashes
 * the password with bcryptjs, then automatically signs the user in and
 * redirects to `/determinations`.
 *
 * @returns `{ error, fieldErrors }` on validation/duplicate failure; on success
 *          `signIn` throws `NEXT_REDIRECT` which escapes this handler.
 */
export async function register(
  _prevState: unknown,
  formData: FormData,
): Promise<RegisterResult> {
  const firmName = String(formData.get("firmName") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");

  // --- Server-side validation -------------------------------------------
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
    return { fieldErrors };
  }

  // --- Duplicate-email check ---------------------------------------------
  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return { error: "An account with this email already exists." };
    }
  } catch (error) {
    console.error("Duplicate-email check failed:", error);
    return { error: "Registration failed. Please try again." };
  }

  // --- Create Firm + User ------------------------------------------------
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const firm = await prisma.firm.create({
      data: { name: firmName },
    });
    await prisma.user.create({
      data: {
        email,
        name: fullName,
        passwordHash,
        role: "USER",
        firmId: firm.id,
      },
    });
  } catch (error) {
    console.error("Account creation failed:", error);
    return { error: "Account creation failed. Please try again." };
  }

  // --- Auto sign-in ------------------------------------------------------
  // `signIn` throws NEXT_REDIRECT on success (to `/determinations`), which must
  // escape this handler so Next.js performs the redirect. A credential failure
  // here would be a race condition (user was just created), but we handle it
  // gracefully anyway.
  try {
    await signIn("credentials", { email, password, redirectTo: "/determinations" });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    if (error instanceof AuthError) {
      return { error: "Account created, but auto sign-in failed. Please sign in manually." };
    }
    console.error("Auto sign-in error:", error);
    return { error: "Account created, but auto sign-in failed. Please sign in manually." };
  }

  return {};
}
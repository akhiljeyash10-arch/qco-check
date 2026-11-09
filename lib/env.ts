/**
 * Clean environment-variable handling.
 *
 * Centralises reading + validating the runtime environment so missing or
 * malformed config fails loudly with a clear message instead of a cryptic
 * downstream error (e.g. Prisma complaining about an empty `DATABASE_URL`).
 *
 * Values come from `process.env` (Next.js and the Vitest setup both populate
 * it from `.env`). Existing `process.env` entries are never overwritten, so
 * real environment variables always win over the file.
 *
 * @module lib/env
 */

/**
 * Required environment variables for the app to function. Each entry is
 * validated at read time by {@link requireEnv}; an absent/blank value throws a
 * descriptive error naming the offending variable.
 */
export interface AppEnv {
  /** PostgreSQL connection string (Prisma `datasource db.url`). */
  databaseUrl: string;
  /** Auth.js JWT signing secret (>= 32 chars recommended). */
  authSecret: string;
  /**
   * Canonical URL of the app (required for Auth.js in production so callbacks
   * are built against the correct host). Not required in development when
   * Auth.js infers the URL from the request.
   */
  authUrl?: string;
  /** Optional AWS region for S3-backed uploads and reports. */
  awsRegion?: string;
  /** Optional explicit AWS access key for S3. */
  awsAccessKeyId?: string;
  /** Optional explicit AWS secret key for S3. */
  awsSecretAccessKey?: string;
  /** Optional S3 bucket for durable batch and PDF storage. */
  awsS3Bucket?: string;
}

/** Trim a value, returning `null` for empty/whitespace-only strings. */
function trimmed(value: string | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

/**
 * Read a required environment variable or throw a clear, actionable error.
 *
 * @param name    The env var name (used in the error message).
 * @param minLen  Optional minimum length (e.g. AUTH_SECRET should be >= 32).
 */
export function requireEnv(name: string, minLen?: number): string {
  const value = trimmed(process.env[name]);
  if (value == null) {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `Copy .env.example to .env and fill it in.`,
    );
  }
  if (minLen != null && value.length < minLen) {
    throw new Error(
      `Environment variable "${name}" is too short (got ${value.length}, ` +
        `expected at least ${minLen} characters).`,
    );
  }
  return value;
}

/**
 * Validate and return the full {@link AppEnv}. Throws on the first missing /
 * malformed variable so callers get one clear error. Safe to call at startup
 * (route handlers, server components) — it only reads, never writes.
 *
 * AUTH_URL is required in production (where Auth.js cannot infer the canonical
 * host from the request) but optional in development.
 */
export function loadAppEnv(): AppEnv {
  const env: AppEnv = {
    databaseUrl: requireEnv("DATABASE_URL"),
    authSecret: requireEnv("AUTH_SECRET", 32),
  };
  const authUrl = trimmed(process.env.AUTH_URL);
  if (authUrl) {
    env.authUrl = authUrl;
  } else if (process.env.NODE_ENV === "production") {
    throw new Error(
      'Missing required environment variable "AUTH_URL" in production. ' +
        "Set it to the canonical base URL of your deployment (e.g. https://qcocheck.example.com).",
    );
  }
  const awsRegion = trimmed(process.env.AWS_REGION);
  const awsAccessKeyId = trimmed(process.env.AWS_ACCESS_KEY_ID);
  const awsSecretAccessKey = trimmed(process.env.AWS_SECRET_ACCESS_KEY);
  const awsS3Bucket = trimmed(process.env.AWS_S3_BUCKET);
  if (awsRegion) env.awsRegion = awsRegion;
  if (awsAccessKeyId) env.awsAccessKeyId = awsAccessKeyId;
  if (awsSecretAccessKey) env.awsSecretAccessKey = awsSecretAccessKey;
  if (awsS3Bucket) env.awsS3Bucket = awsS3Bucket;
  return env;
}

/**
 * Non-throwing validation report — used by the health route to surface a
 * "degraded" status when config is missing instead of crashing the process.
 *
 * @returns the set of missing variable names (empty when all are present).
 */
export function missingEnvVars(): string[] {
  const missing: string[] = [];
  if (trimmed(process.env.DATABASE_URL) == null) missing.push("DATABASE_URL");
  const secret = trimmed(process.env.AUTH_SECRET);
  if (secret == null) missing.push("AUTH_SECRET");
  else if (secret.length < 32) missing.push("AUTH_SECRET (too short)");
  // AUTH_URL is required in production only.
  if (
    process.env.NODE_ENV === "production" &&
    trimmed(process.env.AUTH_URL) == null
  ) {
    missing.push("AUTH_URL (required in production)");
  }
  return missing;
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Vitest setup: load `.env` into `process.env`.
 *
 * Next.js loads `.env` automatically; Prisma's `db seed` loads it via the Prisma
 * CLI. Vitest does neither, so DB-backed integration tests (e.g. the Task 3 seed
 * tests) would skip because `DATABASE_URL` is unset. This tiny, dependency-free
 * loader parses `.env` and populates `process.env` before any test runs.
 *
 * Existing `process.env` values win (we never overwrite), so real environment
 * variables take precedence over the file.
 */
try {
  const envPath = resolve(process.cwd(), ".env");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding single/double quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {
  // .env missing — DB-backed tests will skip gracefully via their connectivity
  // guard rather than failing the whole run.
}

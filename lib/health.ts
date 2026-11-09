/**
 * Health-check response builder.
 *
 * Extracted from the route handler so the response-shaping logic is
 * unit-testable without a live PostgreSQL connection. The route injects the
 * real Prisma query (`prisma.appMeta.count`); tests inject a plain async
 * function. This is dependency injection, not mocking — the real response
 * logic under test is unchanged.
 */
export interface HealthResponseBody {
  status: "ok" | "degraded";
  db: "connected" | "error";
  appMetaCount?: number;
  uptimeMs: number;
  error?: string;
  s3?: "configured" | "local-fallback";
  /** Missing/invalid environment variables (Task 10 clean env handling). */
  missingEnv?: string[];
}

export interface HealthResult {
  body: HealthResponseBody;
  httpStatus: number;
}

/**
 * Build the health-check result by pinging the database.
 *
 * @param dbCount   An async function returning a row count from the DB
 *                  (e.g. `prisma.appMeta.count`). Throws on DB failure.
 * @param startedAt Timestamp (ms) used to compute uptime.
 */
export async function getHealthStatus(
  dbCount: () => Promise<number>,
  startedAt: number = Date.now(),
): Promise<HealthResult> {
  try {
    const appMetaCount = await dbCount();
    return {
      body: {
        status: "ok",
        db: "connected",
        appMetaCount,
        uptimeMs: Date.now() - startedAt,
      },
      httpStatus: 200,
    };
  } catch (error) {
    return {
      body: {
        status: "degraded",
        db: "error",
        error: error instanceof Error ? error.message : "unknown error",
        uptimeMs: Date.now() - startedAt,
      },
      httpStatus: 503,
    };
  }
}

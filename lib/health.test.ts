import { describe, it, expect } from "vitest";
import { getHealthStatus } from "@/lib/health";

/**
 * Task 1 — health route unit tests.
 *
 * Validates the response-shaping logic of `/api/health` without a live
 * database: a reachable DB yields HTTP 200 + "ok", an unreachable DB yields
 * HTTP 503 + "degraded". The route handler wires the real `prisma.appMeta.count`
 * as the injected `dbCount`; here we inject plain async functions that exercise
 * each path deterministically.
 */
describe("health status", () => {
  it("returns HTTP 200 ok when the database is reachable", async () => {
    const result = await getHealthStatus(async () => 3);

    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe("ok");
    expect(result.body.db).toBe("connected");
    expect(result.body.appMetaCount).toBe(3);
  });

  it("returns HTTP 503 degraded when the database is unreachable", async () => {
    const result = await getHealthStatus(async () => {
      throw new Error("connection refused");
    });

    expect(result.httpStatus).toBe(503);
    expect(result.body.status).toBe("degraded");
    expect(result.body.db).toBe("error");
    expect(result.body.error).toBe("connection refused");
  });
});

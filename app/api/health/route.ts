import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHealthStatus } from "@/lib/health";
import { missingEnvVars } from "@/lib/env";
import { isS3Configured } from "@/lib/s3";

// A health check pings the live DB at request time — it must never be
// prerendered at build.
export const dynamic = "force-dynamic";

export async function GET() {
  // Real round-trip through the generated Prisma client; response shaping lives
  // in the unit-tested `getHealthStatus` helper.
  const result = await getHealthStatus(() => prisma.appMeta.count());
  // Surface any missing/invalid environment variables so a misconfigured
  // deploy is visible in the health check (clean env handling, Task 10).
  const missingEnv = missingEnvVars();
  const body = {
    ...result.body,
    missingEnv,
    s3: isS3Configured() ? "configured" : "local-fallback",
  };
  // If env config is incomplete, flag the overall status as degraded even when
  // the DB ping succeeded, so operators notice the misconfiguration.
  if (missingEnv.length > 0) {
    body.status = "degraded";
  }
  return NextResponse.json(body, { status: result.httpStatus });
}

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { buildFirmScope } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

// Determinations are read live from the DB — never prerender at build.
export const dynamic = "force-dynamic";

/**
 * GET /api/batch/[id] — load a stored batch and its determinations.
 *
 * Returns the batch metadata plus the per-row determination results so the UI
 * can render a results table. Firm-scoped: a USER can only access their own
 * firm's batch; an ADMIN can access any firm's batch.
 *
 * Status codes:
 *  401 — not authenticated.
 *  403 — batch does not belong to the user's firm.
 *  404 — batch not found.
 *  200 — batch + determinations returned.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // --- Auth ------------------------------------------------------------------
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  // --- Load the batch --------------------------------------------------------
  const batch = await prisma.batch.findUnique({ where: { id } });

  if (!batch) {
    return NextResponse.json(
      { error: "Batch not found." },
      { status: 404 },
    );
  }

  // --- Firm-scope check ------------------------------------------------------
  if (user.role === "USER") {
    const scope = buildFirmScope(user);
    if (!scope.firmId || batch.firmId !== scope.firmId) {
      return NextResponse.json(
        { error: "Access denied." },
        { status: 403 },
      );
    }
  }
  // ADMIN bypasses firm scoping (sees all firms' batches).

  // --- Load determinations linked to this batch ------------------------------
  const determinations = await prisma.determination.findMany({
    where: { batchId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      verdict: true,
      confidence: true,
      isNumber: true,
      gazetteReference: true,
      circularReference: true,
      transitionalStatus: true,
      status: true,
      input: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    batchId: batch.id,
    fileName: batch.fileName,
    totalRows: batch.totalRows,
    status: batch.status,
    createdAt: batch.createdAt.toISOString(),
    determinations,
  });
}

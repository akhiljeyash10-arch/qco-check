import { getSessionUser } from "@/lib/session";
import { buildFirmScope } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { buildResultsCsv } from "@/lib/batch/results-csv";
import { getPresignedDownloadUrl, isS3Configured } from "@/lib/s3";

// CSV is generated live from the DB — never prerender at build.
export const dynamic = "force-dynamic";

/**
 * GET /api/batch/[id]/csv — download a results CSV for a batch.
 *
 * Returns a CSV file with per-row verdicts reconstructed from the stored
 * Determinations linked to the batch. Firm-scoped: a USER can only download
 * their own firm's results; an ADMIN can download any firm's results.
 *
 * Status codes:
 *  401 — not authenticated.
 *  403 — batch does not belong to the user's firm.
 *  404 — batch not found.
 *  200 — streams the CSV as `text/csv` with a download filename.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // --- Auth ------------------------------------------------------------------
  const user = await getSessionUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Authentication required." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // --- Load the batch --------------------------------------------------------
  const batch = await prisma.batch.findUnique({ where: { id } });

  if (!batch) {
    return new Response(JSON.stringify({ error: "Batch not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // --- Firm-scope check ------------------------------------------------------
  if (user.role === "USER") {
    const scope = buildFirmScope(user);
    if (!scope.firmId || batch.firmId !== scope.firmId) {
      return new Response(JSON.stringify({ error: "Access denied." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
  // ADMIN bypasses firm scoping.

  if (batch.s3Key && isS3Configured()) {
    try {
      const downloadUrl = await getPresignedDownloadUrl(batch.s3Key, 60);
      return new Response(null, {
        status: 302,
        headers: {
          Location: downloadUrl,
          "Cache-Control": "private, no-store",
        },
      });
    } catch (error) {
      console.error("Batch results download signing failed:", error);
      return new Response(
        JSON.stringify({ error: "Could not create a cloud download link." }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // --- Load determinations and build the CSV ---------------------------------
  const determinations = await prisma.determination.findMany({
    where: { batchId: id },
    orderBy: { createdAt: "asc" },
  });

  const csv = buildResultsCsv(determinations);

  // --- Stream as text/csv ----------------------------------------------------
  const safeName = (batch.fileName || "results").replace(/[^\w.-]/g, "_");
  const filename = `results-${safeName}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

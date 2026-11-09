import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { buildFirmScope } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { renderDeterminationPdf } from "@/lib/pdf/DeterminationPdf";
import type {
  DeterminationPdfData,
  PdfReasoningStep,
} from "@/lib/pdf/DeterminationPdf";
import { getPresignedDownloadUrl, isS3Configured, uploadToS3 } from "@/lib/s3";

// Always dynamic — generates a live PDF from the DB.
export const dynamic = "force-dynamic";

/**
 * GET /api/determinations/[id]/pdf
 *
 * Returns a server-side rendered PDF for the given determination. The
 * determination must belong to the authenticated user's firm (firm-scoped
 * tenant isolation). ADMIN users can access any firm's determination.
 *
 * Status codes:
 *  401 — not authenticated.
 *  403 — determination does not belong to the user's firm.
 *  404 — determination not found.
 *  200 — streams the PDF as `application/pdf` with a download filename.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Await params (Next.js 15+ async params).
  const { id } = await params;

  // --- Auth ------------------------------------------------------------------
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  // --- Load determination (with firm + IS standard relations) ----------------
  const determination = await prisma.determination.findUnique({
    where: { id },
    include: {
      firm: { select: { id: true, name: true } },
      user: { select: { id: true, email: true } },
    },
  });

  if (!determination) {
    return NextResponse.json(
      { error: "Determination not found." },
      { status: 404 },
    );
  }

  // --- Firm-scope check: USERs can only download their own firm's PDFs -------
  if (user.role === "USER") {
    const scope = buildFirmScope(user);
    if (!scope.firmId || determination.firmId !== scope.firmId) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
  }
  // ADMIN users bypass firm scoping (they see all firms' determinations).

  const cloudStoredVerdict =
    determination.status === "COMPLETED" &&
    (determination.verdict === "GREEN" || determination.verdict === "RED");
  if (cloudStoredVerdict && determination.pdfS3Key && isS3Configured()) {
    try {
      const downloadUrl = await getPresignedDownloadUrl(
        determination.pdfS3Key,
        60,
      );
      return NextResponse.redirect(downloadUrl, {
        status: 302,
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      console.error("Determination PDF signing failed:", error);
      return NextResponse.json(
        { error: "Could not create a cloud download link." },
        { status: 502 },
      );
    }
  }

  // --- Build the PDF data from stored fields ---------------------------------
  const input = (determination.input as Record<string, unknown>) ?? {};
  const rawTrace = determination.reasoningTrace as unknown[];
  const reasoningTrace: PdfReasoningStep[] = Array.isArray(rawTrace)
    ? rawTrace.map((s) => {
        const step = s as Record<string, unknown>;
        return {
          step: String(step.step ?? ""),
          reason: step.reason != null ? String(step.reason) : undefined,
          verdict: step.verdict != null ? String(step.verdict) : undefined,
          ...step,
        };
      })
    : [];

  const pdfData: DeterminationPdfData = {
    id: determination.id,
    createdAt: determination.createdAt.toISOString(),
    verdict: determination.verdict as "GREEN" | "RED" | "AMBER",
    confidence: determination.confidence,
    isNumber: determination.isNumber,
    gazetteReference: determination.gazetteReference,
    circularReference: determination.circularReference,
    transitionalStatus: determination.transitionalStatus,
    // Exemption notes are stored in the reasoning trace; we surface any
    // "Exemption applies" step as a human-readable note.
    exemptionNotes: extractExemptionNotes(reasoningTrace),
    status: determination.status,
    reasoningTrace,
    input: {
      productType:
        input.productType != null ? String(input.productType) : undefined,
      grade: input.grade != null ? String(input.grade) : undefined,
      dimensions:
        input.dimensions != null ? String(input.dimensions) : undefined,
      material: input.material != null ? String(input.material) : undefined,
      hsCode: input.hsCode != null ? String(input.hsCode) : undefined,
      clearanceDate:
        input.clearanceDate != null ? String(input.clearanceDate) : undefined,
      billOfLadingDate:
        input.billOfLadingDate != null
          ? String(input.billOfLadingDate)
          : undefined,
      msmeRegistered:
        input.msmeRegistered === true || input.msmeRegistered === "true"
          ? true
          : undefined,
      endUse: input.endUse != null ? String(input.endUse) : undefined,
      notDomesticallyAvailable:
        input.notDomesticallyAvailable === true ||
        input.notDomesticallyAvailable === "true"
          ? true
          : undefined,
    },
    firmName: determination.firm.name,
  };

  // --- Render PDF to buffer --------------------------------------------------
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderDeterminationPdf(pdfData);
  } catch (err) {
    console.error("PDF render failed:", err);
    return NextResponse.json(
      { error: "Failed to generate PDF." },
      { status: 500 },
    );
  }

  if (cloudStoredVerdict && isS3Configured()) {
    const key = `firms/${determination.firmId}/determinations/${determination.id}.pdf`;
    const filename = `determination-${determination.id.slice(0, 8)}.pdf`;
    try {
      await uploadToS3(
        key,
        pdfBuffer,
        "application/pdf",
        `attachment; filename="${filename}"`,
      );
      await prisma.determination.update({
        where: { id: determination.id },
        data: { pdfS3Key: key },
      });
    } catch (error) {
      console.error("Determination PDF cloud storage failed:", error);
      return NextResponse.json(
        {
          error:
            "The PDF was generated, but could not be saved to cloud storage.",
        },
        { status: 502 },
      );
    }
  }

  // --- Stream as application/pdf --------------------------------------------
  const filename = `determination-${determination.id.slice(0, 8)}.pdf`;
  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.byteLength),
      // Prevent caching of determination PDFs (they are firm-scoped).
      "Cache-Control": "private, no-store",
    },
  });
}

// ---------------------------------------------------------------------------
// Helper: extract exemption notes from the reasoning trace
// ---------------------------------------------------------------------------

/**
 * Look for a "verdict" step in the trace whose reason starts with "Exemption
 * applies:" and return the reason text, or null.
 */
function extractExemptionNotes(trace: PdfReasoningStep[]): string | null {
  for (const step of trace) {
    if (
      step.verdict === "GREEN" &&
      typeof step.reason === "string" &&
      step.reason.startsWith("Exemption applies:")
    ) {
      return step.reason;
    }
  }
  return null;
}

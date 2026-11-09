import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { runBatch } from "@/lib/batch/service";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { isS3Configured, uploadToS3 } from "@/lib/s3";
import { prisma } from "@/lib/prisma";
import { buildResultsCsv } from "@/lib/batch/results-csv";
import type { BatchResult } from "@/lib/batch/service";

// A batch upload reads the live DB + session — never prerender at build.
export const dynamic = "force-dynamic";

/**
 * Maximum accepted upload size in bytes (≈ 1 MB). Guards against accidental
 * huge uploads; the row limit (MAX_BATCH_ROWS = 1000) is enforced in the
 * parser, but a size check avoids loading a gigantic file into memory.
 */
const MAX_UPLOAD_BYTES = 1_024 * 1024;

/**
 * Per-user rate limit for batch uploads: 10 uploads per minute (a batch is
 * heavier than a single check, so the window is tighter).
 */
const BATCH_LIMIT = 10;
const BATCH_WINDOW_MS = 60_000;

/**
 * POST /api/batch/upload — CSV batch applicability check.
 *
 * Accepts a `multipart/form-data` request with a `file` field containing the
 * CSV. Requires an authenticated USER (admins curate rules, not determinations).
 * The server parses the CSV, validates columns, runs the engine per row,
 * persists a firm-scoped Batch + N Determinations, and returns per-row results
 * (verdicts + errors) so the UI can render a results table immediately.
 *
 * `firmId` is derived from the session (never the client).
 *
 * Status codes:
 *  401 — not authenticated.
 *  403 — authenticated but not a USER.
 *  400 — no file, wrong content type, file too large, or empty file.
 *  200 — batch processed; per-row results returned.
 */
export async function POST(request: Request) {
  // --- Auth: the session is the source of identity + firm. -------------------
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (user.role !== "USER") {
    return NextResponse.json(
      { error: "Only users can run batch checks." },
      { status: 403 },
    );
  }

  // --- Rate limit: per-user sliding window (abuse guard). -------------------
  const limitKey = rateLimitKey(request, user.id);
  const rl = rateLimit(limitKey, BATCH_LIMIT, BATCH_WINDOW_MS);
  if (!rl.allowed) {
    const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      {
        error:
          "Too many batch uploads. Please slow down and try again shortly.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(retryAfter, 1)) },
      },
    );
  }

  // --- Parse the multipart form. --------------------------------------------
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a CSV file." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No CSV file provided. Use a form field named 'file'." },
      { status: 400 },
    );
  }

  // --- Size guard. -----------------------------------------------------------
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `File too large (${file.size} bytes). Maximum is ${MAX_UPLOAD_BYTES} bytes.`,
      },
      { status: 400 },
    );
  }

  const csvText = await file.text();
  if (csvText.trim() === "") {
    return NextResponse.json(
      { error: "The CSV file is empty." },
      { status: 400 },
    );
  }

  // --- Run the batch (parse + engine + persist), firm-scoped. ----------------
  let result: BatchResult;
  try {
    result = await runBatch(csvText, file.name || "upload.csv", user);
  } catch (error) {
    console.error("Batch upload failed:", error);
    return NextResponse.json(
      { error: "An error occurred while processing the batch." },
      { status: 500 },
    );
  }

  if (result.batchId && user.firmId && isS3Configured()) {
    try {
      const determinations = await prisma.determination.findMany({
        where: { batchId: result.batchId },
        orderBy: { createdAt: "asc" },
      });
      const safeName = (result.fileName || "results").replace(/[^\w.-]/g, "_");
      const key = `firms/${user.firmId}/batches/${result.batchId}.csv`;

      await uploadToS3(
        key,
        buildResultsCsv(determinations),
        "text/csv; charset=utf-8",
        `attachment; filename="results-${safeName}.csv"`,
      );
      await prisma.batch.update({
        where: { id: result.batchId },
        data: { s3Key: key },
      });
    } catch (error) {
      console.error("Batch results cloud storage failed:", error);
      return NextResponse.json(
        {
          error:
            "The batch was processed, but its results could not be saved to cloud storage.",
          batchId: result.batchId,
        },
        { status: 502 },
      );
    }
  }

  return NextResponse.json(result);
}

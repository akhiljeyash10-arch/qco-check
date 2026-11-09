import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { reproduceDetermination } from "@/lib/check/reproducibility";

// Always dynamic — re-runs the engine against the live snapshot.
export const dynamic = "force-dynamic";

/**
 * GET /api/determinations/[id]/reproduce
 *
 * Reproducibility check (Task 10): re-run an old determination's inputs against
 * its snapshotted rule versions and verify the verdict is unchanged. This is
 * the legal-defensibility guarantee — a determination made today stays
 * reproducible after future amendments because it carries the exact rule
 * versions it was decided against.
 *
 * ADMIN-only: a verification tool for platform operators auditing whether a
 * past determination still reproduces (e.g. after a rule migration).
 *
 * Status codes:
 *  401 — not authenticated.
 *  403 — not an ADMIN.
 *  404 — determination not found.
 *  200 — the reproducibility result (matches flag + original/reproduced verdicts).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only admins can run reproducibility checks." },
      { status: 403 },
    );
  }

  const result = await reproduceDetermination(id);
  if (!result) {
    return NextResponse.json(
      { error: "Determination not found." },
      { status: 404 },
    );
  }

  return NextResponse.json(result);
}

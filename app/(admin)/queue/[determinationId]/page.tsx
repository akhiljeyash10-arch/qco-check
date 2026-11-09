import { notFound } from "next/navigation";
import Link from "next/link";
import { getReviewCaseDetail } from "@/lib/admin/queue-actions";
import { CaseDetail } from "./CaseDetail";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ determinationId: string }>;
}

/**
 * Admin review-case detail page (Task 9).
 *
 * Shows the Amber determination's input + reasoning and lets the admin resolve
 * the case (final verdict + notes) and link out to the promote-to-rule flow.
 */
export default async function CasePage({ params }: Props) {
  const { determinationId } = await params;
  const detail = await getReviewCaseDetail(determinationId);
  if (!detail) notFound();

  const canResolve = detail.status === "PENDING_REVIEW";
  const canPromote =
    detail.queueItem !== null && detail.queueItem.status !== "PROMOTED";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <nav className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/queue" className="hover:text-zinc-900 hover:underline">
          Queue
        </Link>
        <span>/</span>
        <span className="text-zinc-900">Case {determinationId.slice(-8)}</span>
      </nav>

      <CaseDetail detail={detail} canResolve={canResolve} canPromote={canPromote} />
    </div>
  );
}

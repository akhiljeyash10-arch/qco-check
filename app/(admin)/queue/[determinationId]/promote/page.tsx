import { notFound } from "next/navigation";
import Link from "next/link";
import { getReviewCaseDetail } from "@/lib/admin/queue-actions";
import { getQcos, getISStandards } from "@/lib/admin/rules-actions";
import { PromoteForm } from "./PromoteForm";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ determinationId: string }>;
}

/**
 * Promote-to-rule page (Task 9).
 *
 * Loads the Amber case's input to prefill a new QCOItem form, plus the list of
 * QCOs (non-superseded) and IS standards for the admin to select. On save the
 * form calls `promoteCaseAction`, which creates the QCOItem and links it back
 * to the review-queue item.
 */
export default async function PromotePage({ params }: Props) {
  const { determinationId } = await params;
  const [detail, qcos, isStandards] = await Promise.all([
    getReviewCaseDetail(determinationId),
    getQcos(),
    getISStandards(),
  ]);
  if (!detail) notFound();

  // Only non-superseded QCOs can receive new items.
  const eligibleQcos = qcos.filter((q) => q.status !== "SUPERSEDED");

  return (
    <div className="mx-auto w-full max-w-2xl">
      <nav className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/queue" className="hover:text-zinc-900 hover:underline">
          Queue
        </Link>
        <span>/</span>
        <Link
          href={`/queue/${determinationId}`}
          className="hover:text-zinc-900 hover:underline"
        >
          Case {determinationId.slice(-8)}
        </Link>
        <span>/</span>
        <span className="text-zinc-900">Promote to rule</span>
      </nav>

      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-900">
        Promote to Rule
      </h1>
      <p className="mb-6 text-sm text-zinc-600">
        Create a QCO item prefilled from this Amber case. Future identical
        queries will then auto-resolve to a direct Green/Red verdict.
      </p>

      <PromoteForm
        determinationId={determinationId}
        input={detail.input}
        qcos={eligibleQcos.map((q) => ({ id: q.id, title: q.title }))}
        isStandards={isStandards.map((is) => ({
          id: is.id,
          isNumber: is.isNumber,
          title: is.title,
        }))}
      />
    </div>
  );
}

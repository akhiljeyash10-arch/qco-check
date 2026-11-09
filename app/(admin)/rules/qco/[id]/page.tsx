import Link from "next/link";
import { notFound } from "next/navigation";
import { getQco, getISStandards } from "@/lib/admin/rules-actions";
import { QcoForm } from "../QcoForm";
import { QcoStatusChanger } from "./QcoStatusChanger";
import { QcoItemList } from "./QcoItemList";
import { EnforcementCircularList } from "./EnforcementCircularList";
import { ExemptionList } from "./ExemptionList";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700",
  PUBLISHED: "bg-green-100 text-green-800",
  SUPERSEDED: "bg-amber-100 text-amber-800",
  IN_ABEYANCE: "bg-red-100 text-red-800",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function QcoDetailPage({ params }: Props) {
  const { id } = await params;
  const [qco, isStandards] = await Promise.all([getQco(id), getISStandards()]);

  if (!qco) notFound();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/rules" className="hover:text-zinc-900 hover:underline">
          Rules
        </Link>
        <span>/</span>
        <span className="text-zinc-900">{qco.title}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-zinc-900">{qco.title}</h1>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[qco.status] ?? "bg-zinc-100 text-zinc-700"}`}
            >
              {qco.status}
            </span>
            <span className="text-sm text-zinc-500">v{qco.version}</span>
          </div>
          <p className="mt-1 text-sm text-zinc-500">{qco.gazetteReference}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/rules/qco/${qco.id}/new-version`}
            className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
          >
            New version
          </Link>
          <QcoStatusChanger
            id={qco.id}
            currentStatus={qco.status}
          />
        </div>
      </div>

      {/* Edit form */}
      <section aria-labelledby="qco-edit-heading">
        <h2
          id="qco-edit-heading"
          className="mb-3 text-base font-semibold text-zinc-900"
        >
          QCO details
        </h2>
        <QcoForm existing={qco} />
      </section>

      {/* QCO Items */}
      <section aria-labelledby="items-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2
            id="items-heading"
            className="text-base font-semibold text-zinc-900"
          >
            QCO Items
            <span className="ml-2 text-sm font-normal text-zinc-500">
              ({qco.qcoItems.length})
            </span>
          </h2>
          {qco.status !== "SUPERSEDED" && (
            <Link
              href={`/rules/qco/${qco.id}/item/new`}
              className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
            >
              + Add item
            </Link>
          )}
        </div>
        <QcoItemList qcoId={qco.id} items={qco.qcoItems} isStandards={isStandards} />
      </section>

      {/* Enforcement Circulars */}
      <section aria-labelledby="circulars-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2
            id="circulars-heading"
            className="text-base font-semibold text-zinc-900"
          >
            Enforcement Circulars
            <span className="ml-2 text-sm font-normal text-zinc-500">
              ({qco.enforcementCirculars.length})
            </span>
          </h2>
          <Link
            href={`/rules/qco/${qco.id}/circular/new`}
            className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
          >
            + Add circular
          </Link>
        </div>
        <EnforcementCircularList
          qcoId={qco.id}
          circulars={qco.enforcementCirculars}
        />
      </section>

      {/* Exemptions */}
      <section aria-labelledby="exemptions-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2
            id="exemptions-heading"
            className="text-base font-semibold text-zinc-900"
          >
            Exemptions
            <span className="ml-2 text-sm font-normal text-zinc-500">
              ({qco.exemptions.length})
            </span>
          </h2>
          <Link
            href={`/rules/qco/${qco.id}/exemption/new`}
            className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
          >
            + Add exemption
          </Link>
        </div>
        <ExemptionList qcoId={qco.id} exemptions={qco.exemptions} />
      </section>
    </div>
  );
}

import Link from "next/link";
import { getQcos, getISStandards } from "@/lib/admin/rules-actions";
import { prisma } from "@/lib/prisma";
import { StatCards } from "@/components/StatCards";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700",
  PUBLISHED: "bg-green-100 text-green-800",
  SUPERSEDED: "bg-amber-100 text-amber-800",
  IN_ABEYANCE: "bg-red-100 text-red-800",
};

export default async function RulesPage() {
  const [qcos, isStandards] = await Promise.all([getQcos(), getISStandards()]);
  const [pendingCases, promotedRules] = await Promise.all([
    prisma.reviewQueueItem.count({ where: { status: "PENDING" } }),
    prisma.reviewQueueItem.count({ where: { status: "PROMOTED" } }),
  ]);
  const activeQcos = qcos.filter((qco) => qco.status === "PUBLISHED").length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Rule Editor
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Curate and version QCOs, IS standards, QCO items, enforcement
            circulars, transitional arrangements, and exemptions.
          </p>
        </div>
      </div>

      <StatCards
        cards={[
          {
            icon: "ShieldCheck",
            label: "Active QCOs",
            value: activeQcos,
            accent: "blue",
          },
          {
            icon: "BookOpen",
            label: "IS Standards",
            value: isStandards.length,
            accent: "zinc",
          },
          {
            icon: "AlertTriangle",
            label: "Pending Amber Cases",
            value: pendingCases,
            accent: "amber",
          },
          {
            icon: "Lightbulb",
            label: "Promoted Rules",
            value: promotedRules,
            accent: "green",
          },
        ]}
      />

      {/* QCO section */}
      <section aria-labelledby="qco-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="qco-heading" className="text-lg font-semibold text-zinc-900">
            Quality Control Orders
            <span className="ml-2 text-sm font-normal text-zinc-500">
              ({qcos.length})
            </span>
          </h2>
          <Link
            href="/rules/qco/new"
            className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
          >
            + New QCO
          </Link>
        </div>

        {qcos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
            <p className="text-sm text-zinc-500">
              No QCOs yet.{" "}
              <Link
                href="/rules/qco/new"
                className="text-zinc-900 underline hover:no-underline"
              >
                Create the first one.
              </Link>
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full text-sm" role="grid">
              <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Gazette ref</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Version</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Circulars</th>
                  <th className="px-4 py-3">Exemptions</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {qcos.map((q) => (
                  <tr
                    key={q.id}
                    className="transition-colors hover:bg-zinc-50 motion-reduce:transition-none"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-900">
                      {q.title}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {q.gazetteReference}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[q.status] ?? "bg-zinc-100 text-zinc-700"}`}
                      >
                        {q.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">v{q.version}</td>
                    <td className="px-4 py-3 text-zinc-600">
                      {q._count.qcoItems}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {q._count.enforcementCirculars}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {q._count.exemptions}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/rules/qco/${q.id}`}
                        className="text-zinc-700 underline-offset-2 hover:underline"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* IS Standards section */}
      <section aria-labelledby="is-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="is-heading" className="text-lg font-semibold text-zinc-900">
            IS Standards
            <span className="ml-2 text-sm font-normal text-zinc-500">
              ({isStandards.length})
            </span>
          </h2>
          <Link
            href="/rules/is-standard/new"
            className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
          >
            + New IS Standard
          </Link>
        </div>

        {isStandards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
            <p className="text-sm text-zinc-500">
              No IS standards yet.{" "}
              <Link
                href="/rules/is-standard/new"
                className="text-zinc-900 underline hover:no-underline"
              >
                Create the first one.
              </Link>
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full text-sm" role="grid">
              <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">IS Number</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Version year</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {isStandards.map((is) => (
                  <tr
                    key={is.id}
                    className="transition-colors hover:bg-zinc-50 motion-reduce:transition-none"
                  >
                    <td className="px-4 py-3 font-mono font-medium text-zinc-900">
                      {is.isNumber}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">{is.title}</td>
                    <td className="px-4 py-3 text-zinc-600">
                      {is.versionYear ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/rules/is-standard/${is.id}`}
                        className="text-zinc-700 underline-offset-2 hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getFirmForUser } from "@/lib/data-access";
import { prisma } from "@/lib/prisma";
import { DownloadPdfButton } from "@/components/DownloadPdfButton";
import { StatCards } from "@/components/StatCards";

export const dynamic = "force-dynamic";

/**
 * USER determinations area — the firm-scoped workspace landing.
 *
 * Lists the user's own determinations (firm-scoped via the session-derived
 * firmId) and links to the single-check screen.
 */
export default async function DeterminationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "USER") redirect("/rules");

  const firm = await getFirmForUser(user);

  // Firm-scoped determination list (firmId from the session, never the client).
  const determinations = firm
    ? await prisma.determination.findMany({
        where: { firmId: firm.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          verdict: true,
          confidence: true,
          isNumber: true,
          input: true,
          createdAt: true,
          status: true,
        },
      })
    : [];
  const [total, green, red, amberPending] = firm
    ? await Promise.all([
        prisma.determination.count({ where: { firmId: firm.id } }),
        prisma.determination.count({
          where: { firmId: firm.id, verdict: "GREEN" },
        }),
        prisma.determination.count({
          where: { firmId: firm.id, verdict: "RED" },
        }),
        prisma.determination.count({
          where: { firmId: firm.id, status: "PENDING_REVIEW" },
        }),
      ])
    : ([0, 0, 0, 0] as const);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Determinations
        </h1>
        <p className="text-sm text-zinc-600">
          Firm:{" "}
          <span className="font-medium text-zinc-900">
            {firm?.name ?? "Unknown"}
          </span>
        </p>
      </div>

      <StatCards
        cards={[
          {
            icon: "ClipboardList",
            label: "Total Checks",
            value: total,
            accent: "zinc",
          },
          {
            icon: "CheckCircle2",
            label: "Green",
            value: green,
            accent: "green",
          },
          { icon: "XCircle", label: "Red", value: red, accent: "red" },
          {
            icon: "AlertTriangle",
            label: "Amber Pending",
            value: amberPending,
            accent: "amber",
          },
        ]}
      />

      <div className="flex flex-wrap gap-3">
        <Link
          href="/determinations/check"
          className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Run a single check
        </Link>
        <Link
          href="/batch"
          className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Upload CSV batch
        </Link>
      </div>

      {determinations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <p className="text-sm text-zinc-500">
            No determinations yet. Run a single check to get started.
          </p>
        </div>
      ) : (
        <DeterminationsTable rows={determinations} />
      )}
    </div>
  );
}

function DeterminationsTable({
  rows,
}: {
  rows: Array<{
    id: string;
    verdict: string;
    confidence: number;
    isNumber: string | null;
    input: unknown;
    createdAt: Date;
    status: string;
  }>;
}) {
  const VERDICT_BADGE: Record<string, string> = {
    GREEN: "bg-green-100 text-green-800",
    RED: "bg-red-100 text-red-800",
    AMBER: "bg-amber-100 text-amber-800",
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50/80 text-left text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Verdict
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              HS code
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              IS number
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Confidence
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Date
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => {
            const input = (row.input as Record<string, unknown>) ?? {};
            return (
              <tr
                key={row.id}
                className="transition-colors hover:bg-zinc-50 motion-reduce:transition-none"
              >
                <td className="whitespace-nowrap px-4 py-3.5">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${VERDICT_BADGE[row.verdict] ?? "bg-zinc-100 text-zinc-700"}`}
                  >
                    {row.verdict}
                  </span>
                  {row.status === "PENDING_REVIEW" && (
                    <span className="ml-1 text-xs text-amber-600">
                      (pending)
                    </span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-zinc-600">
                  {String(input.hsCode ?? "—")}
                </td>
                <td className="px-4 py-3.5 text-zinc-600">
                  {row.isNumber ?? "—"}
                </td>
                <td className="px-4 py-3.5 text-zinc-600">
                  {row.confidence.toFixed(2)}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-zinc-500">
                  {row.createdAt.toISOString().slice(0, 10)}
                </td>
                <td className="px-4 py-3.5">
                  <DownloadPdfButton determinationId={row.id} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

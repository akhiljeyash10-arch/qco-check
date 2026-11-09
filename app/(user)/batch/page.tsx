import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getFirmForUser } from "@/lib/data-access";
import { prisma } from "@/lib/prisma";
import { BatchUploadForm } from "./BatchUploadForm";

export const dynamic = "force-dynamic";

/**
 * USER batch upload page.
 *
 * Renders the CSV upload form and a list of the user's recent batches
 * (firm-scoped via the session-derived firmId). Determinations and batches
 * are isolated per firm; rules are a shared global knowledge base.
 */
export default async function BatchPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "USER") redirect("/rules");

  const firm = await getFirmForUser(user);

  // Firm-scoped batch list (firmId from the session, never the client).
  const batches = firm
    ? await prisma.batch.findMany({
        where: { firmId: firm.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          fileName: true,
          totalRows: true,
          status: true,
          createdAt: true,
        },
      })
    : [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Batch upload
        </h1>
        <p className="text-sm text-zinc-600">
          Firm:{" "}
          <span className="font-medium text-zinc-900">
            {firm?.name ?? "Unknown"}
          </span>
        </p>
      </div>

      <div>
        <Link
          href="/determinations/check"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
        >
          ← Back to single check
        </Link>
      </div>

      <BatchUploadForm />

      {batches.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">
            Recent batches
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/80 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    File
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Rows
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Date
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {batches.map((b) => (
                  <tr
                    key={b.id}
                    className="transition-colors hover:bg-zinc-50 motion-reduce:transition-none"
                  >
                    <td className="px-3 py-2 text-zinc-900">{b.fileName}</td>
                    <td className="px-3 py-2 text-zinc-600">{b.totalRows}</td>
                    <td className="px-3 py-2 text-zinc-600">{b.status}</td>
                    <td className="px-3 py-2 text-zinc-500">
                      {b.createdAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-3 py-2">
                      <a
                        href={`/api/batch/${b.id}/csv`}
                        download
                        aria-label={`Download results CSV for ${b.fileName}`}
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
                      >
                        CSV
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

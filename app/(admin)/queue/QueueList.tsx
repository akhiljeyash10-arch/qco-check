import Link from "next/link";

import type { ReviewQueueEntry } from "@/lib/queue/service";

/**
 * Presentational table of PENDING Amber review cases (all firms).
 *
 * Each row links to the case detail page where the admin resolves and/or
 * promotes the case. Renders text labels (not color alone) for accessibility.
 */
export function QueueList({ items }: { items: ReviewQueueEntry[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
        <p className="text-sm text-zinc-500">
          No Amber cases awaiting review. New low-confidence determinations will
          appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <table className="w-full text-sm" role="grid">
        <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3">Firm</th>
            <th className="px-4 py-3">Product / HS</th>
            <th className="px-4 py-3">Verdict</th>
            <th className="px-4 py-3">Confidence</th>
            <th className="px-4 py-3">Raised</th>
            <th className="px-4 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-zinc-50">
              <td className="px-4 py-3.5">
                <div className="font-medium text-zinc-900">{item.firmName}</div>
                <div className="text-xs text-zinc-500">{item.userEmail}</div>
              </td>
              <td className="px-4 py-3.5">
                <div className="text-zinc-900">
                  {item.productType ?? <span className="text-zinc-400">—</span>}
                </div>
                <div className="font-mono text-xs text-zinc-500">
                  HS {item.hsCode || "—"}
                  {item.grade ? ` · ${item.grade}` : ""}
                </div>
              </td>
              <td className="px-4 py-3.5">
                <span
                  className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
                  role="status"
                  aria-label={`Verdict: Amber, pending review`}
                >
                  Amber · Pending
                </span>
              </td>
              <td className="px-4 py-3.5 text-zinc-600">
                {item.confidence.toFixed(2)}
              </td>
              <td className="px-4 py-3.5 text-xs text-zinc-500">
                {item.createdAt.toISOString().slice(0, 10)}
              </td>
              <td className="px-4 py-3.5 text-right">
                <Link
                  href={`/queue/${item.determinationId}`}
                  className="text-zinc-700 underline-offset-2 hover:underline"
                >
                  Review
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

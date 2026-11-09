"use client";

import Link from "next/link";

interface Exemption {
  id: string;
  type: string;
  description: string;
  conditions: unknown;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}

interface Props {
  qcoId: string;
  exemptions: Exemption[];
}

const TYPE_BADGE: Record<string, string> = {
  MSME_PHASED: "bg-blue-100 text-blue-800",
  END_USE: "bg-purple-100 text-purple-800",
  NOT_DOMESTICALLY_AVAILABLE: "bg-orange-100 text-orange-800",
  ABEYANCE: "bg-red-100 text-red-800",
  DEFERRED: "bg-zinc-100 text-zinc-700",
};

function fmt(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ExemptionList({ qcoId, exemptions }: Props) {
  if (exemptions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-8 text-center">
        <p className="text-sm text-zinc-500">
          No exemptions yet.{" "}
          <Link
            href={`/rules/qco/${qcoId}/exemption/new`}
            className="text-zinc-900 underline hover:no-underline"
          >
            Add the first exemption.
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-sm" role="grid">
        <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3">Effective window</th>
            <th className="px-4 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {exemptions.map((ex) => (
            <tr key={ex.id} className="hover:bg-zinc-50">
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_BADGE[ex.type] ?? "bg-zinc-100 text-zinc-700"}`}
                >
                  {ex.type.replace(/_/g, " ")}
                </span>
              </td>
              <td className="px-4 py-3 text-zinc-700 max-w-xs truncate">
                {ex.description}
              </td>
              <td className="px-4 py-3 text-zinc-600 text-xs">
                {fmt(ex.effectiveFrom)} → {fmt(ex.effectiveTo)}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/rules/qco/${qcoId}/exemption/${ex.id}`}
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
  );
}

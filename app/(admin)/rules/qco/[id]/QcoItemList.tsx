"use client";

import Link from "next/link";

interface ISStandard {
  id: string;
  isNumber: string;
  title: string;
  versionYear: number | null;
}

interface QcoItem {
  id: string;
  productName: string;
  productDescription: string | null;
  gradeSpec: unknown;
  hsCodes: unknown;
  notes: string | null;
  isStandards: ISStandard[];
}

interface Props {
  qcoId: string;
  items: QcoItem[];
  isStandards: ISStandard[];
}

export function QcoItemList({ qcoId, items }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-8 text-center">
        <p className="text-sm text-zinc-500">
          No QCO items yet.{" "}
          <Link
            href={`/rules/qco/${qcoId}/item/new`}
            className="text-zinc-900 underline hover:no-underline"
          >
            Add the first item.
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
            <th className="px-4 py-3">Product</th>
            <th className="px-4 py-3">IS standards</th>
            <th className="px-4 py-3">HS codes</th>
            <th className="px-4 py-3">Grade / spec</th>
            <th className="px-4 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {items.map((item) => {
            const gs = item.gradeSpec as { grade?: string; dimensions?: string; material?: string };
            const hsCodes = Array.isArray(item.hsCodes) ? (item.hsCodes as string[]) : [];

            return (
              <tr key={item.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-900">
                    {item.productName}
                  </div>
                  {item.productDescription && (
                    <div className="text-xs text-zinc-500 line-clamp-1">
                      {item.productDescription}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  {item.isStandards.length > 0
                    ? item.isStandards.map((is) => is.isNumber).join(", ")
                    : <span className="text-zinc-400">—</span>}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                  {hsCodes.length > 0
                    ? hsCodes.slice(0, 3).join(", ") + (hsCodes.length > 3 ? `+${hsCodes.length - 3}` : "")
                    : <span className="text-zinc-400">—</span>}
                </td>
                <td className="px-4 py-3 text-xs text-zinc-600">
                  {[gs.grade, gs.dimensions, gs.material].filter(Boolean).join(" / ") || <span className="text-zinc-400">—</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/rules/qco/${qcoId}/item/${item.id}`}
                    className="text-zinc-700 underline-offset-2 hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import Link from "next/link";

interface TransitionalArrangement {
  id: string;
  triggerDateType: string;
  gracePeriodDays: number;
  conditionText: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}

interface Circular {
  id: string;
  circularReference: string;
  circularDate: Date | null;
  effectiveDate: Date | null;
  notes: string | null;
  transitionalArrangement: TransitionalArrangement | null;
}

interface Props {
  qcoId: string;
  circulars: Circular[];
}

function fmt(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function EnforcementCircularList({ qcoId, circulars }: Props) {
  if (circulars.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-8 text-center">
        <p className="text-sm text-zinc-500">
          No enforcement circulars yet.{" "}
          <Link
            href={`/rules/qco/${qcoId}/circular/new`}
            className="text-zinc-900 underline hover:no-underline"
          >
            Add the first circular.
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {circulars.map((ec) => (
        <div
          key={ec.id}
          className="rounded-lg border border-zinc-200 bg-white p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-zinc-900">{ec.circularReference}</p>
              <p className="mt-0.5 text-sm text-zinc-500">
                Circular date: {fmt(ec.circularDate)} · Effective:{" "}
                {fmt(ec.effectiveDate)}
              </p>
              {ec.notes && (
                <p className="mt-1 text-sm text-zinc-600">{ec.notes}</p>
              )}
            </div>
            <Link
              href={`/rules/qco/${qcoId}/circular/${ec.id}`}
              className="flex-shrink-0 text-sm text-zinc-700 underline-offset-2 hover:underline"
            >
              Edit
            </Link>
          </div>

          {/* Transitional arrangement inline */}
          {ec.transitionalArrangement ? (
            <div className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-sm">
              <p className="font-medium text-zinc-700">
                Transitional arrangement
              </p>
              <ul className="mt-1 text-xs text-zinc-600">
                <li>
                  Trigger date: <strong>{ec.transitionalArrangement.triggerDateType}</strong>
                </li>
                <li>
                  Grace period:{" "}
                  <strong>{ec.transitionalArrangement.gracePeriodDays} days</strong>
                </li>
                {ec.transitionalArrangement.conditionText && (
                  <li>Condition: {ec.transitionalArrangement.conditionText}</li>
                )}
                <li>
                  Window: {fmt(ec.transitionalArrangement.effectiveFrom)} →{" "}
                  {fmt(ec.transitionalArrangement.effectiveTo)}
                </li>
              </ul>
              <Link
                href={`/rules/qco/${qcoId}/circular/${ec.id}/transitional`}
                className="mt-1 inline-block text-xs text-zinc-700 underline-offset-2 hover:underline"
              >
                Edit transitional arrangement
              </Link>
            </div>
          ) : (
            <div className="mt-3">
              <Link
                href={`/rules/qco/${qcoId}/circular/${ec.id}/transitional/new`}
                className="text-xs text-zinc-700 underline-offset-2 hover:underline"
              >
                + Add transitional arrangement
              </Link>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

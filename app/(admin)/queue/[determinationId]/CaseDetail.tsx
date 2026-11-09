"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { resolveCaseAction } from "@/lib/admin/queue-actions";
import type { ReviewCaseDetail } from "@/lib/queue/service";

interface Props {
  detail: ReviewCaseDetail;
  canResolve: boolean;
  canPromote: boolean;
}

/**
 * Client component rendering a single review case: the determination input +
 * reasoning trace, the resolve form (final verdict + notes), and a link to the
 * promote-to-rule flow.
 */
export function CaseDetail({ detail, canResolve, canPromote }: Props) {
  const router = useRouter();
  const [verdict, setVerdict] = useState<"GREEN" | "RED">("RED");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResolve(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await resolveCaseAction(
      detail.determinationId,
      verdict,
      notes,
    );
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const queue = detail.queueItem;
  const input = detail.input;

  return (
    <div className="flex flex-col gap-6">
      {/* Header --------------------------------------------------------------- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Review Case
          </h1>
          <p className="text-sm text-zinc-500">
            {detail.firmName} · {detail.userEmail}
          </p>
        </div>
        <StatusBadge status={detail.status} queueStatus={queue?.status} />
      </div>

      {/* Determination input -------------------------------------------------- */}
      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Determination input
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Field label="HS code" value={str(input.hsCode)} />
          <Field label="Product type" value={str(input.productType)} />
          <Field label="Grade" value={str(input.grade)} />
          <Field label="Dimensions" value={str(input.dimensions)} />
          <Field label="Material" value={str(input.material)} />
          <Field
            label="Clearance date"
            value={str(input.clearanceDate)?.slice(0, 10)}
          />
          <Field
            label="BL date"
            value={str(input.billOfLadingDate)?.slice(0, 10)}
          />
        </dl>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Field label="Engine verdict" value={detail.verdict} />
          <Field label="Confidence" value={detail.confidence.toFixed(2)} />
          <Field label="IS number" value={detail.isNumber ?? "—"} />
        </div>
      </section>

      {/* Reasoning trace ------------------------------------------------------ */}
      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Reasoning trace
        </h2>
        <ReasoningTrace trace={detail.reasoningTrace} />
      </section>

      {/* Resolution + promote ------------------------------------------------- */}
      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Resolve &amp; promote
        </h2>

        {queue?.resolutionVerdict && (
          <p className="mb-3 text-sm text-zinc-600">
            Resolved verdict:{" "}
            <strong>{queue.resolutionVerdict}</strong>
            {queue.adminNotes ? ` — ${queue.adminNotes}` : ""}
          </p>
        )}
        {queue?.promotedQcoItemId && (
          <p className="mb-3 text-sm text-emerald-700">
            Promoted to rule (QCO item {queue.promotedQcoItemId.slice(-8)}).
          </p>
        )}

        {canResolve ? (
          <form onSubmit={handleResolve} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="resolution-verdict"
                className="text-sm font-medium text-zinc-700"
              >
                Final verdict
              </label>
              <select
                id="resolution-verdict"
                name="resolutionVerdict"
                value={verdict}
                onChange={(e) => setVerdict(e.target.value as "GREEN" | "RED")}
                className="max-w-xs rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
              >
                <option value="RED">RED — BIS mandatory</option>
                <option value="GREEN">GREEN — not applicable</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="admin-notes"
                className="text-sm font-medium text-zinc-700"
              >
                Resolution notes
              </label>
              <textarea
                id="admin-notes"
                name="adminNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Explain the basis for this verdict (cited IS standard, reference, etc.)."
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
              />
            </div>

            {error && (
              <div
                className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                role="alert"
              >
                {error}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Resolving…" : "Resolve case"}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-zinc-500">
            This case has been resolved (status: {detail.status}).
          </p>
        )}

        {canPromote && (
          <div className="mt-5 border-t border-zinc-100 pt-5">
            <Link
              href={`/queue/${detail.determinationId}/promote`}
              className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
            >
              Promote to rule →
            </Link>
            <p className="mt-2 text-xs text-zinc-500">
              Create a QCO item prefilled from this case so future identical
              queries auto-resolve to a direct Green/Red.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-zinc-900">{value || "—"}</dd>
    </div>
  );
}

function StatusBadge({
  status,
  queueStatus,
}: {
  status: string;
  queueStatus?: string | null;
}) {
  const label =
    queueStatus === "PROMOTED"
      ? "Promoted"
      : queueStatus === "RESOLVED"
        ? "Resolved"
        : status === "RESOLVED"
          ? "Resolved"
          : "Pending review";
  const tone =
    label === "Pending review"
      ? "bg-amber-100 text-amber-800"
      : label === "Promoted"
        ? "bg-emerald-100 text-emerald-800"
        : "bg-zinc-100 text-zinc-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}
      role="status"
      aria-label={`Status: ${label}`}
    >
      {label}
    </span>
  );
}

function ReasoningTrace({ trace }: { trace: unknown }) {
  if (!Array.isArray(trace)) {
    return <p className="text-sm text-zinc-400">No reasoning trace.</p>;
  }
  return (
    <ol className="flex flex-col gap-1.5">
      {trace.map((step, i) => {
        const s = step as Record<string, unknown>;
        const label =
          typeof s.step === "string" ? s.step : `step ${i + 1}`;
        const reason =
          typeof s.reason === "string"
            ? s.reason
            : typeof s.verdict === "string"
              ? `verdict: ${s.verdict}`
              : null;
        return (
          <li key={i} className="text-sm text-zinc-600">
            <span className="font-mono text-xs text-zinc-400">{label}</span>
            {reason ? ` — ${reason}` : ""}
          </li>
        );
      })}
    </ol>
  );
}

/** Coerce an unknown input field to a string. */
function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

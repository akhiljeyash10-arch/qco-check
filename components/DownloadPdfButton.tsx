"use client";

/**
 * Download PDF button — a small client component that renders a link to the
 * PDF API endpoint for a given determination. Uses a plain `<a href>` with
 * `download` so the browser handles the file save natively; no client-side
 * blob fetching required.
 *
 * Accessible: the link includes an `aria-label` that names the action and the
 * determination ID so screen readers can distinguish multiple rows.
 */
export function DownloadPdfButton({
  determinationId,
}: {
  determinationId: string;
}) {
  return (
    <a
      href={`/api/determinations/${determinationId}/pdf`}
      download
      aria-label={`Download PDF for determination ${determinationId.slice(0, 8)}`}
      className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
    >
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
        />
      </svg>
      PDF
    </a>
  );
}

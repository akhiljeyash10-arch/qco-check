"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, FileSpreadsheet, Upload, X } from "lucide-react";

/**
 * CSV batch-upload form (client component).
 *
 * Accepts a CSV file, posts it to `/api/batch/upload` as multipart/form-data,
 * and renders a results table with per-row Green/Red/Amber badges (text + ARIA,
 * never color alone) plus a downloadable results CSV link. Structural errors
 * (missing columns, row-limit, empty file) are surfaced distinctly from
 * per-row errors.
 *
 * Accessibility (WCAG AA):
 *  - The file input has a <label> bound via htmlFor/id.
 *  - The results region uses role="status" + aria-live="polite" so screen readers
 *    announce it on arrival.
 *  - Per-row verdict badges carry aria-label with the verdict word + description
 *    (not color alone).
 *  - Badge colour combinations meet AA contrast (dark text on light bg).
 */

// ---------------------------------------------------------------------------
// Types (mirror the API response from lib/batch/service.ts)
// ---------------------------------------------------------------------------

interface BatchRowResult {
  rowIndex: number;
  determinationId?: string;
  verdict?: "GREEN" | "RED" | "AMBER";
  confidence?: number;
  isNumber?: string | null;
  gazetteReference?: string | null;
  circularReference?: string | null;
  transitionalStatus?: string | null;
  error?: string;
  hsCode?: string;
  productType?: string;
  grade?: string;
}

interface BatchResult {
  batchId: string;
  fileName: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  rowResults: BatchRowResult[];
  structuralErrors: string[];
}

interface ErrorResponse {
  error: string;
}

// ---------------------------------------------------------------------------
// Verdict badge styles + descriptive text (matches CheckForm conventions)
// ---------------------------------------------------------------------------

const VERDICT_BADGE = {
  GREEN: {
    className: "bg-green-100 text-green-900 border-green-300",
    title: "GREEN — Not applicable",
    description: "No BIS certification required.",
  },
  RED: {
    className: "bg-red-100 text-red-900 border-red-300",
    title: "RED — BIS mandatory",
    description: "BIS certification is required for this product.",
  },
  AMBER: {
    className: "bg-amber-100 text-amber-900 border-amber-300",
    title: "AMBER — Pending review",
    description: "Ambiguous case routed for expert review.",
  },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BatchUploadForm() {
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  function selectFile(file: File | null) {
    setResult(null);
    setError(null);
    if (file && !file.name.toLowerCase().endsWith(".csv")) {
      setSelectedFile(null);
      setError("Choose a CSV file to upload.");
      return;
    }
    setSelectedFile(file);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    selectFile(event.dataTransfer.files[0] ?? null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = selectedFile;
    if (!file) {
      setError("Please choose a CSV file to upload.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/batch/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        const err = data as ErrorResponse;
        setError(err.error);
      } else {
        setResult(data as BatchResult);
      }
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ----------------------------------------------------------------- */}
      {/* Upload form                                                       */}
      {/* ----------------------------------------------------------------- */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
        aria-label="CSV batch upload"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="csv-file"
              className="text-sm font-semibold text-zinc-900"
            >
              Upload a batch file
              <span className="ml-0.5 text-red-600" aria-hidden="true">
                *
              </span>
            </label>
            <div
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                const nextTarget = event.relatedTarget;
                if (
                  !(nextTarget instanceof Node) ||
                  !event.currentTarget.contains(nextTarget)
                ) {
                  setDragActive(false);
                }
              }}
              onDrop={handleDrop}
              className={`mt-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors motion-reduce:transition-none ${
                dragActive
                  ? "border-blue-500 bg-blue-50"
                  : "border-zinc-300 bg-zinc-50/70 hover:border-zinc-400 hover:bg-zinc-50"
              }`}
            >
              <input
                ref={inputRef}
                id="csv-file"
                name="file"
                type="file"
                accept=".csv,text/csv"
                aria-required="true"
                onChange={handleFileChange}
                className="sr-only"
              />
              <label
                htmlFor="csv-file"
                className="flex cursor-pointer flex-col items-center"
              >
                {selectedFile ? (
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                ) : (
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-zinc-600 shadow-sm ring-1 ring-zinc-200">
                    <Upload className="h-5 w-5" />
                  </span>
                )}
                <span className="mt-3 text-sm font-semibold text-zinc-900">
                  {selectedFile
                    ? selectedFile.name
                    : "Drop your CSV here, or browse"}
                </span>
                <span className="mt-1 text-xs text-zinc-500">
                  CSV files up to 1 MB · maximum 1,000 SKUs
                </span>
              </label>
              {selectedFile && (
                <div className="mx-auto mt-4 flex max-w-sm items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 flex-none text-emerald-700" />
                    <span className="truncate text-xs font-medium text-zinc-800">
                      {selectedFile.name}
                    </span>
                    <span className="flex-none text-xs text-zinc-500">
                      {formatFileSize(selectedFile.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      selectFile(null);
                      if (inputRef.current) inputRef.current.value = "";
                    }}
                    aria-label="Remove selected file"
                    className="ml-2 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-zinc-500">
              Required columns: productType, grade, dimensions, material,
              hsCode, clearanceDate, billOfLadingDate. Optional: msmeRegistered,
              endUse, notDomesticallyAvailable. Max 1000 rows.
            </p>
          </div>

          {loading && (
            <div
              className="overflow-hidden rounded-full bg-zinc-100"
              role="status"
              aria-label="Processing batch"
            >
              <motion.div
                className="h-1.5 rounded-full bg-blue-600"
                initial={{ width: "12%" }}
                animate={
                  reduceMotion
                    ? { width: "60%" }
                    : { width: ["12%", "82%", "34%", "90%"] }
                }
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: 2, repeat: Infinity, ease: "easeInOut" }
                }
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !selectedFile}
            className="inline-flex w-fit items-center justify-center rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
          >
            {loading ? "Processing…" : "Upload and check"}
          </button>
        </div>
      </form>

      {/* ----------------------------------------------------------------- */}
      {/* Error                                                              */}
      {/* ----------------------------------------------------------------- */}
      {error && (
        <div
          className="rounded-md border border-red-200 bg-red-50 p-4"
          role="alert"
        >
          <p className="text-sm font-medium text-red-900">{error}</p>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Results                                                            */}
      {/* ----------------------------------------------------------------- */}
      {result && <BatchResults result={result} />}
    </div>
  );
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Results rendering
// ---------------------------------------------------------------------------

function BatchResults({ result }: { result: BatchResult }) {
  // Structural errors mean the whole file was rejected — no batch was created.
  if (result.structuralErrors.length > 0) {
    return (
      <div
        className="rounded-md border border-red-200 bg-red-50 p-4"
        role="alert"
      >
        <h2 className="text-sm font-semibold text-red-900">
          Could not process the CSV
        </h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-red-800">
          {result.structuralErrors.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section
      className="rounded-lg border border-zinc-200 bg-white p-6"
      aria-labelledby="batch-results-heading"
    >
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-3">
        <h2
          id="batch-results-heading"
          className="text-lg font-semibold text-zinc-900"
        >
          Batch results
        </h2>
        <span className="text-sm text-zinc-500">{result.fileName}</span>
        <div
          className="flex flex-wrap gap-3 text-sm"
          role="status"
          aria-live="polite"
          aria-label={`Batch complete. ${result.totalRows} total rows, ${result.successRows} processed, ${result.errorRows} with errors.`}
        >
          <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700">
            {result.totalRows} rows
          </span>
          <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-900">
            {result.successRows} processed
          </span>
          {result.errorRows > 0 && (
            <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-900">
              {result.errorRows} errors
            </span>
          )}
        </div>
      </div>

      {/* Download CSV */}
      {result.batchId && (
        <div className="mt-4">
          <a
            href={`/api/batch/${result.batchId}/csv`}
            download
            aria-label="Download results CSV file"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
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
            Download results CSV
          </a>
        </div>
      )}

      {/* Per-row table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Row
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Verdict
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                HS code
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Grade
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                IS number
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Confidence
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {result.rowResults.map((row) => (
              <tr key={row.rowIndex} className="hover:bg-zinc-50">
                <td className="px-3 py-2 text-zinc-500">{row.rowIndex}</td>
                <td className="px-3 py-2">
                  <VerdictBadge verdict={row.verdict} />
                </td>
                <td className="px-3 py-2 text-zinc-600">{row.hsCode ?? "—"}</td>
                <td className="px-3 py-2 text-zinc-600">{row.grade ?? "—"}</td>
                <td className="px-3 py-2 text-zinc-600">
                  {row.isNumber ?? "—"}
                </td>
                <td className="px-3 py-2 text-zinc-600">
                  {row.confidence != null ? row.confidence.toFixed(2) : "—"}
                </td>
                <td className="px-3 py-2 text-zinc-600">
                  {row.error ? (
                    <span className="text-red-700">{row.error}</span>
                  ) : (
                    <RowDetails row={row} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** A verdict badge — always carries the verdict word + ARIA label (not color alone). */
function VerdictBadge({ verdict }: { verdict?: "GREEN" | "RED" | "AMBER" }) {
  if (!verdict) {
    // Errored row — show an "ERROR" badge.
    return (
      <span
        className="inline-flex items-center rounded-full border bg-zinc-100 border-zinc-300 px-2.5 py-0.5 text-xs font-bold text-zinc-900"
        role="img"
        aria-label="Error — this row could not be processed."
      >
        ERROR
      </span>
    );
  }

  const info = VERDICT_BADGE[verdict];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${info.className}`}
      role="img"
      aria-label={`Verdict: ${verdict}. ${info.description}`}
    >
      {verdict}
    </span>
  );
}

/** Compact detail line for a successful row (references). */
function RowDetails({ row }: { row: BatchRowResult }) {
  const parts: string[] = [];
  if (row.gazetteReference) parts.push(`Gazette: ${row.gazetteReference}`);
  if (row.circularReference) parts.push(`Circular: ${row.circularReference}`);
  if (row.transitionalStatus) parts.push(row.transitionalStatus);
  if (parts.length === 0) return <span className="text-zinc-400">—</span>;
  return <span className="text-xs">{parts.join(" · ")}</span>;
}

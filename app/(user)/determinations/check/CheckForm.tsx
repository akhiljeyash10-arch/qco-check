"use client";

import { useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Download } from "lucide-react";

/**
 * Single-check form (client component).
 *
 * Collects the product + shipment details, posts to `/api/check`, and renders
 * the verdict with an accessible badge (text label + ARIA, never color alone),
 * all references (IS number, Gazette ref, circular ref, transitional status),
 * and the reasoning trace.
 *
 * Accessibility (WCAG AA):
 *  - Every field has a <label> bound via htmlFor/id.
 *  - Required fields are marked and announce via aria-required.
 *  - The verdict badge carries role="status" + aria-live="polite" so screen
 *    readers announce it on arrival; the badge text always includes the verdict
 *    word (GREEN/RED/AMBER), not color alone.
 *  - Badge colour combinations meet AA contrast (light bg / dark text).
 */

// ---------------------------------------------------------------------------
// Types (mirror the API response)
// ---------------------------------------------------------------------------

interface CheckResponse {
  determinationId: string;
  verdict: "GREEN" | "RED" | "AMBER";
  confidence: number;
  isNumber: string | null;
  gazetteReference: string | null;
  circularReference: string | null;
  transitionalStatus: string | null;
  qcoItemId: string | null;
  qcoId: string | null;
  enforcementCircularId: string | null;
  status: string;
  reasoningTrace: Array<Record<string, unknown> & { step: string }>;
}

interface ErrorResponse {
  error: string;
  details?: string[];
}

// ---------------------------------------------------------------------------
// Verdict badge styles + descriptive text
// ---------------------------------------------------------------------------

const VERDICT_INFO = {
  GREEN: {
    container: "bg-green-100 border-green-300",
    badge: "bg-green-600 text-white",
    title: "GREEN â€” Not applicable",
    description: "No BIS certification required.",
  },
  RED: {
    container: "bg-red-100 border-red-300",
    badge: "bg-red-600 text-white",
    title: "RED â€” BIS mandatory",
    description: "BIS certification is required for this product.",
  },
  AMBER: {
    container: "bg-amber-100 border-amber-300",
    badge: "bg-amber-600 text-white",
    title: "AMBER â€” Pending review",
    description: "Ambiguous case routed for expert review.",
  },
} as const;

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormData {
  productType: string;
  grade: string;
  dimensions: string;
  material: string;
  hsCode: string;
  clearanceDate: string;
  billOfLadingDate: string;
  msmeRegistered: boolean;
  endUse: string;
  notDomesticallyAvailable: boolean;
}

const EMPTY_FORM: FormData = {
  productType: "",
  grade: "",
  dimensions: "",
  material: "",
  hsCode: "",
  clearanceDate: "",
  billOfLadingDate: "",
  msmeRegistered: false,
  endUse: "",
  notDomesticallyAvailable: false,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CheckForm() {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors([]);
    setResult(null);

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        const err = data as ErrorResponse;
        setError(err.error);
        if (err.details) setFieldErrors(err.details);
      } else {
        setResult(data as CheckResponse);
      }
    } catch {
      setError("Network error â€” could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ----------------------------------------------------------------- */}
      {/* Form                                                              */}
      {/* ----------------------------------------------------------------- */}
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-zinc-200 bg-white p-6"
        aria-label="Single applicability check"
      >
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-sm font-semibold text-zinc-900">
            Product details
          </legend>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="productType"
              label="Product type"
              value={form.productType}
              onChange={(v) => update("productType", v)}
              placeholder="e.g. structural steel"
            />
            <Field
              id="grade"
              label="Grade"
              value={form.grade}
              onChange={(v) => update("grade", v)}
              placeholder="e.g. E250"
            />
            <Field
              id="dimensions"
              label="Dimensions"
              value={form.dimensions}
              onChange={(v) => update("dimensions", v)}
              placeholder="e.g. plates/sections/profiles"
            />
            <Field
              id="material"
              label="Material"
              value={form.material}
              onChange={(v) => update("material", v)}
              placeholder="e.g. carbon structural steel"
            />
            <Field
              id="hsCode"
              label="HS code"
              required
              value={form.hsCode}
              onChange={(v) => update("hsCode", v)}
              placeholder="e.g. 7208.52"
            />
          </div>
        </fieldset>

        <fieldset className="mt-6 flex flex-col gap-4">
          <legend className="mb-1 text-sm font-semibold text-zinc-900">
            Shipment dates
          </legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="clearanceDate"
              label="Clearance date"
              type="date"
              required
              value={form.clearanceDate}
              onChange={(v) => update("clearanceDate", v)}
            />
            <Field
              id="billOfLadingDate"
              label="Bill of Lading date"
              type="date"
              value={form.billOfLadingDate}
              onChange={(v) => update("billOfLadingDate", v)}
            />
          </div>
        </fieldset>

        <fieldset className="mt-6 flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold text-zinc-900">
            Exemption qualifiers (optional)
          </legend>
          <CheckboxField
            id="msmeRegistered"
            label="MSME registered"
            checked={form.msmeRegistered}
            onChange={(v) => update("msmeRegistered", v)}
          />
          <CheckboxField
            id="notDomesticallyAvailable"
            label="Not domestically available"
            checked={form.notDomesticallyAvailable}
            onChange={(v) => update("notDomesticallyAvailable", v)}
          />
          <Field
            id="endUse"
            label="End use (if applicable)"
            value={form.endUse}
            onChange={(v) => update("endUse", v)}
            placeholder="e.g. capital goods project"
          />
        </fieldset>

        {fieldErrors.length > 0 && (
          <div
            className="mt-4 rounded-md border border-red-200 bg-red-50 p-3"
            role="alert"
          >
            <p className="text-sm font-medium text-red-900">
              Please fix the following:
            </p>
            <ul className="mt-1 list-disc pl-5 text-sm text-red-800">
              {fieldErrors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Checkingâ€¦" : "Run check"}
        </button>
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
      {/* Result                                                             */}
      {/* ----------------------------------------------------------------- */}
      {result && <VerdictResult result={result} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verdict result rendering
// ---------------------------------------------------------------------------

function VerdictResult({ result }: { result: CheckResponse }) {
  const info = VERDICT_INFO[result.verdict];
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.4, ease: "easeOut" }}
      className={`rounded-lg border p-6 ${info.container}`}
      aria-labelledby="verdict-heading"
    >
      {/* Badge: text + ARIA (not color alone) */}
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${info.badge}`}
          role="status"
          aria-live="polite"
          aria-label={`Verdict: ${result.verdict}. ${info.description}`}
        >
          {result.verdict}
        </span>
        <h2
          id="verdict-heading"
          className="text-lg font-semibold text-zinc-900"
        >
          {info.title}
        </h2>
        <span className="ml-auto text-sm text-zinc-700">
          Confidence: {result.confidence.toFixed(2)}
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-800">{info.description}</p>

      {/* References */}
      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Reference label="IS Number" value={result.isNumber} />
        <Reference label="QCO Gazette ref" value={result.gazetteReference} />
        <Reference label="CBIC Circular ref" value={result.circularReference} />
        <Reference
          label="Transitional status"
          value={result.transitionalStatus}
        />
        <Reference label="Determination ID" value={result.determinationId} />
        <Reference
          label="Status"
          value={
            result.status === "PENDING_REVIEW" ? "Pending review" : "Completed"
          }
        />
      </dl>

      {/* Download PDF */}
      <div className="mt-4">
        <a
          href={`/api/determinations/${result.determinationId}/pdf`}
          download
          aria-label="Download PDF determination report"
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
        >
          <Download className="h-4 w-4" />
          Download PDF Report
        </a>
      </div>

      {/* Reasoning trace */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-zinc-900 hover:text-zinc-700">
          Reasoning trace ({result.reasoningTrace.length} steps)
        </summary>
        <ol className="relative mt-4 ml-2 border-l border-zinc-200">
          {result.reasoningTrace.map((step, i) => (
            <li key={i} className="relative pb-5 pl-6 last:pb-0">
              <span
                aria-hidden="true"
                className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-zinc-400 ring-1 ring-zinc-200"
              />
              <div className="rounded-lg border border-zinc-200 bg-white/80 px-3.5 py-3">
                <p className="text-sm font-semibold text-zinc-900">
                  {step.step}
                </p>
                {Boolean(step.reason) && (
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                    {String(step.reason)}
                  </p>
                )}
                {Boolean(step.verdict) && (
                  <p className="mt-1 text-sm font-medium text-zinc-800">
                    → {String(step.verdict)}
                  </p>
                )}
                <StepDetails step={step} />
              </div>
            </li>
          ))}
        </ol>
      </details>
    </motion.section>
  );
}

/** Render non-standard trace keys (everything except step/reason/verdict). */
function StepDetails({
  step,
}: {
  step: Record<string, unknown> & { step: string };
}) {
  const extra = Object.entries(step).filter(
    ([k]) => k !== "step" && k !== "reason" && k !== "verdict",
  );
  if (extra.length === 0) return null;
  return (
    <ul className="mt-1 text-xs text-zinc-500">
      {extra.map(([k, v]) => (
        <li key={k}>
          <span className="font-mono">{k}</span>:{" "}
          {typeof v === "object" ? JSON.stringify(v) : String(v)}
        </li>
      ))}
    </ul>
  );
}

function Reference({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="text-sm text-zinc-900">
        {value ?? <span className="text-zinc-400">â€”</span>}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable form fields
// ---------------------------------------------------------------------------

function Field({
  id,
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-zinc-700">
        {label}
        {required && (
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        required={required}
        aria-required={required ?? false}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
      />
    </div>
  );
}

function CheckboxField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        name={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
      />
      <label htmlFor={id} className="text-sm text-zinc-700">
        {label}
      </label>
    </div>
  );
}

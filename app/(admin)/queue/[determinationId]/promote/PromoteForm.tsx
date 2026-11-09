"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { promoteCaseAction } from "@/lib/admin/queue-actions";

interface QcoOption {
  id: string;
  title: string;
}

interface ISOption {
  id: string;
  isNumber: string;
  title: string;
}

interface Props {
  determinationId: string;
  input: Record<string, unknown>;
  qcos: QcoOption[];
  isStandards: ISOption[];
}

/**
 * Promote-to-rule form (Task 9).
 *
 * Prefilled from the Amber case's input (product type, grade, dimensions,
 * material, HS code). The admin selects the governing QCO + IS standards,
 * adjusts the values, and submits — `promoteCaseAction` creates the QCOItem
 * and links it back to the review-queue item.
 */
export function PromoteForm({
  determinationId,
  input,
  qcos,
  isStandards,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const read = (key: string): string => {
    const v = input[key];
    return typeof v === "string" ? v : "";
  };

  const [qcoId, setQcoId] = useState(qcos[0]?.id ?? "");
  const [productName, setProductName] = useState(
    read("productType") || "Promoted product",
  );
  const [productDescription, setProductDescription] = useState("");
  const [grade, setGrade] = useState(read("grade"));
  const [dimensions, setDimensions] = useState(read("dimensions"));
  const [material, setMaterial] = useState(read("material"));
  const [hsCodesRaw, setHsCodesRaw] = useState(read("hsCode"));
  const [notes, setNotes] = useState("");
  const [selectedIsIds, setSelectedIsIds] = useState<string[]>([]);

  function toggleIs(id: string) {
    setSelectedIsIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (!qcoId) {
      setError("Please select a QCO.");
      setSaving(false);
      return;
    }

    const hsCodes = hsCodesRaw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const result = await promoteCaseAction(determinationId, {
      qcoId,
      productName,
      productDescription: productDescription || undefined,
      gradeSpec: {
        grade: grade || undefined,
        dimensions: dimensions || undefined,
        material: material || undefined,
      },
      hsCodes,
      isStandardIds: selectedIsIds,
      notes: notes || undefined,
    });

    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/queue/${determinationId}`);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-lg border border-zinc-200 bg-white p-6"
      aria-label="Promote Amber case to a QCO item"
    >
      {/* QCO selector */}
      <div className="flex flex-col gap-1">
        <label htmlFor="qcoId" className="text-sm font-medium text-zinc-700">
          Governing QCO <span className="text-red-600">*</span>
        </label>
        <select
          id="qcoId"
          name="qcoId"
          value={qcoId}
          required
          aria-required
          onChange={(e) => setQcoId(e.target.value)}
          className="max-w-md rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
        >
          {qcos.length === 0 ? (
            <option value="">No eligible QCOs available</option>
          ) : (
            qcos.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title}
              </option>
            ))
          )}
        </select>
      </div>

      <Field
        id="productName"
        label="Product name"
        required
        value={productName}
        onChange={setProductName}
        placeholder="e.g. Hot Rolled Structural Steel (E350 grade)"
      />

      <div className="flex flex-col gap-1">
        <label
          htmlFor="productDescription"
          className="text-sm font-medium text-zinc-700"
        >
          Product description
        </label>
        <textarea
          id="productDescription"
          name="productDescription"
          value={productDescription}
          onChange={(e) => setProductDescription(e.target.value)}
          rows={2}
          placeholder="Plain-language description as in the QCO product table."
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
        />
      </div>

      <fieldset className="rounded-md border border-zinc-200 p-4">
        <legend className="px-1 text-sm font-semibold text-zinc-900">
          Grade specification
        </legend>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            id="grade"
            label="Grade"
            value={grade}
            onChange={setGrade}
            placeholder="e.g. E350"
          />
          <Field
            id="dimensions"
            label="Dimensions"
            value={dimensions}
            onChange={setDimensions}
            placeholder="e.g. plates/sections/profiles"
          />
          <Field
            id="material"
            label="Material"
            value={material}
            onChange={setMaterial}
            placeholder="e.g. carbon structural steel"
          />
        </div>
      </fieldset>

      <Field
        id="hsCodes"
        label="HS codes (comma or space separated)"
        value={hsCodesRaw}
        onChange={setHsCodesRaw}
        placeholder="e.g. 7208.52, 7228.30"
      />

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-zinc-700">
          IS Standards
        </legend>
        {isStandards.length === 0 ? (
          <p className="text-xs text-zinc-500">
            No IS standards available. Create them first under Rules.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {isStandards.map((is) => (
              <label
                key={is.id}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors motion-reduce:transition-none ${
                  selectedIsIds.includes(is.id)
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selectedIsIds.includes(is.id)}
                  onChange={() => toggleIs(is.id)}
                  aria-label={`Include ${is.isNumber}`}
                />
                {is.isNumber}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className="text-sm font-medium text-zinc-700">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g. Promoted from review case — confirmed E350 grade per mill cert."
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
          {saving ? "Promoting…" : "Promote to rule"}
        </button>
        <a
          href={`/queue/${determinationId}`}
          className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
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
        type="text"
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

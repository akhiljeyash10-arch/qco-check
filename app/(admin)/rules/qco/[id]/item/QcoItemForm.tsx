"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createQcoItem,
  updateQcoItem,
  type CreateQcoItemInput,
} from "@/lib/admin/rules-actions";

interface ISStandard {
  id: string;
  isNumber: string;
  title: string;
}

interface Existing {
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
  isStandards: ISStandard[];
  existing?: Existing;
}

function parseHsCodes(raw: unknown): string {
  if (Array.isArray(raw)) return (raw as string[]).join(", ");
  if (typeof raw === "string") return raw;
  return "";
}

function parseGrade(raw: unknown): {
  grade: string;
  dimensions: string;
  material: string;
} {
  const gs = (raw ?? {}) as Record<string, string | undefined>;
  return {
    grade: gs.grade ?? "",
    dimensions: gs.dimensions ?? "",
    material: gs.material ?? "",
  };
}

export function QcoItemForm({ qcoId, isStandards, existing }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const gs = parseGrade(existing?.gradeSpec);

  const [productName, setProductName] = useState(existing?.productName ?? "");
  const [productDescription, setProductDescription] = useState(
    existing?.productDescription ?? "",
  );
  const [grade, setGrade] = useState(gs.grade);
  const [dimensions, setDimensions] = useState(gs.dimensions);
  const [material, setMaterial] = useState(gs.material);
  const [hsCodesRaw, setHsCodesRaw] = useState(parseHsCodes(existing?.hsCodes));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [selectedIsIds, setSelectedIsIds] = useState<string[]>(
    existing?.isStandards.map((s) => s.id) ?? [],
  );

  function toggleIs(id: string) {
    setSelectedIsIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Parse HS codes: split by comma/space, trim, filter empty.
    const hsCodes = hsCodesRaw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const input: CreateQcoItemInput = {
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
    };

    const result = existing
      ? await updateQcoItem(existing.id, input)
      : await createQcoItem(input);

    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/rules/qco/${qcoId}`);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-lg border border-zinc-200 bg-white p-6"
      aria-label={existing ? "Edit QCO item" : "Create QCO item"}
    >
      <Field
        id="productName"
        label="Product name"
        required
        value={productName}
        onChange={setProductName}
        placeholder="e.g. Hot Rolled Steel Plates"
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
            placeholder="e.g. E250"
          />
          <Field
            id="dimensions"
            label="Dimensions"
            value={dimensions}
            onChange={setDimensions}
            placeholder="e.g. plates"
          />
          <Field
            id="material"
            label="Material"
            value={material}
            onChange={setMaterial}
            placeholder="e.g. carbon structural"
          />
        </div>
      </fieldset>

      <Field
        id="hsCodes"
        label="HS codes (comma or space separated)"
        value={hsCodesRaw}
        onChange={setHsCodesRaw}
        placeholder="e.g. 7208, 7225.11, 7226.91"
      />

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-zinc-700">
          IS Standards
        </legend>
        {isStandards.length === 0 ? (
          <p className="text-xs text-zinc-500">
            No IS standards available. Create them first.
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
          {saving ? "Saving…" : existing ? "Save changes" : "Create item"}
        </button>
        <a
          href={`/rules/qco/${qcoId}`}
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

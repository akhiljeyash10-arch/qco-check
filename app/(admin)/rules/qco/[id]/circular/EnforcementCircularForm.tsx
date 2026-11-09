"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createEnforcementCircular,
  updateEnforcementCircular,
  type CreateEnforcementCircularInput,
} from "@/lib/admin/rules-actions";

interface Existing {
  id: string;
  circularReference: string;
  circularDate: Date | null;
  effectiveDate: Date | null;
  notes: string | null;
}

interface Props {
  qcoId: string;
  existing?: Existing;
}

function toDateInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().split("T")[0];
}

export function EnforcementCircularForm({ qcoId, existing }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [circularReference, setCircularReference] = useState(
    existing?.circularReference ?? "",
  );
  const [circularDate, setCircularDate] = useState(
    toDateInput(existing?.circularDate ?? null),
  );
  const [effectiveDate, setEffectiveDate] = useState(
    toDateInput(existing?.effectiveDate ?? null),
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const input: CreateEnforcementCircularInput = {
      qcoId,
      circularReference,
      circularDate: circularDate || undefined,
      effectiveDate: effectiveDate || undefined,
      notes: notes || undefined,
    };

    const result = existing
      ? await updateEnforcementCircular(existing.id, input)
      : await createEnforcementCircular(input);

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
      aria-label={existing ? "Edit enforcement circular" : "Create enforcement circular"}
    >
      <Field
        id="circularReference"
        label="Circular reference"
        required
        value={circularReference}
        onChange={setCircularReference}
        placeholder="e.g. Circular No. 12/2020-Customs"
      />
      <div className="grid grid-cols-2 gap-4">
        <Field
          id="circularDate"
          label="Circular date"
          type="date"
          value={circularDate}
          onChange={setCircularDate}
        />
        <Field
          id="effectiveDate"
          label="Effective date"
          type="date"
          value={effectiveDate}
          onChange={setEffectiveDate}
        />
      </div>
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
          {saving ? "Saving…" : existing ? "Save changes" : "Create circular"}
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
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
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

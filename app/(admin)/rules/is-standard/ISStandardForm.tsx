"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createISStandard,
  updateISStandard,
  type CreateISStandardInput,
} from "@/lib/admin/rules-actions";

interface Existing {
  id: string;
  isNumber: string;
  title: string;
  versionYear: number | null;
  notes: string | null;
}

interface Props {
  existing?: Existing;
}

export function ISStandardForm({ existing }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [isNumber, setIsNumber] = useState(existing?.isNumber ?? "");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [versionYear, setVersionYear] = useState(
    existing?.versionYear ? String(existing.versionYear) : "",
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const input: CreateISStandardInput = {
      isNumber,
      title,
      versionYear: versionYear ? parseInt(versionYear, 10) : null,
      notes: notes || undefined,
    };

    const result = existing
      ? await updateISStandard(existing.id, input)
      : await createISStandard(input);

    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/rules");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-lg border border-zinc-200 bg-white p-6"
      aria-label={existing ? "Edit IS standard" : "Create IS standard"}
    >
      <div className="grid grid-cols-2 gap-4">
        <Field
          id="isNumber"
          label="IS number"
          required
          value={isNumber}
          onChange={setIsNumber}
          placeholder="e.g. IS 2062"
        />
        <div className="flex flex-col gap-1">
          <label
            htmlFor="versionYear"
            className="text-sm font-medium text-zinc-700"
          >
            Version year
          </label>
          <input
            id="versionYear"
            name="versionYear"
            type="number"
            min={1900}
            max={2100}
            value={versionYear}
            onChange={(e) => setVersionYear(e.target.value)}
            placeholder="e.g. 2011"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
          />
        </div>
      </div>
      <Field
        id="title"
        label="Title"
        required
        value={title}
        onChange={setTitle}
        placeholder="e.g. Hot Rolled Medium and High Tensile Structural Steel"
      />
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
          {saving ? "Saving…" : existing ? "Save changes" : "Create IS standard"}
        </button>
        <a
          href="/rules"
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

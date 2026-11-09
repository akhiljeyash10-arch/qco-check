"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createQco, updateQco, type CreateQcoInput } from "@/lib/admin/rules-actions";

interface Props {
  existing?: {
    id: string;
    title: string;
    issuingAuthority: string;
    gazetteReference: string;
    notificationDate: Date | null;
    effectiveFrom: Date | null;
    sourceUrl: string | null;
    notes: string | null;
    status: string;
  };
}

function toDateInput(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().split("T")[0];
}

export function QcoForm({ existing }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState(existing?.title ?? "");
  const [issuingAuthority, setIssuingAuthority] = useState(
    existing?.issuingAuthority ?? "",
  );
  const [gazetteReference, setGazetteReference] = useState(
    existing?.gazetteReference ?? "",
  );
  const [notificationDate, setNotificationDate] = useState(
    toDateInput(existing?.notificationDate ?? null),
  );
  const [effectiveFrom, setEffectiveFrom] = useState(
    toDateInput(existing?.effectiveFrom ?? null),
  );
  const [sourceUrl, setSourceUrl] = useState(existing?.sourceUrl ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const isEditMode = Boolean(existing);
  const isLocked = existing && existing.status !== "DRAFT";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const input: CreateQcoInput = {
      title,
      issuingAuthority,
      gazetteReference,
      notificationDate: notificationDate || undefined,
      effectiveFrom: effectiveFrom || undefined,
      sourceUrl: sourceUrl || undefined,
      notes: notes || undefined,
    };

    const result = isEditMode
      ? await updateQco({ id: existing!.id, ...input })
      : await createQco(input);

    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.push(isEditMode ? `/rules/qco/${existing!.id}` : `/rules/qco/${result.data.id}`);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-lg border border-zinc-200 bg-white p-6"
      aria-label={isEditMode ? "Edit QCO" : "Create QCO"}
    >
      {isLocked && (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="alert"
        >
          This QCO is <strong>{existing?.status}</strong> and cannot be edited
          directly. Use &ldquo;Create new version&rdquo; to amend it.
        </div>
      )}

      <Field
        id="title"
        label="Title"
        required
        disabled={!!isLocked}
        value={title}
        onChange={setTitle}
        placeholder="e.g. Steel and Steel Products (Quality Control) Order, 2020"
      />
      <Field
        id="issuingAuthority"
        label="Issuing authority"
        required
        disabled={!!isLocked}
        value={issuingAuthority}
        onChange={setIssuingAuthority}
        placeholder="e.g. Ministry of Steel"
      />
      <Field
        id="gazetteReference"
        label="Gazette reference"
        required
        disabled={!!isLocked}
        value={gazetteReference}
        onChange={setGazetteReference}
        placeholder="e.g. S.O. 1234(E)"
      />
      <div className="grid grid-cols-2 gap-4">
        <Field
          id="notificationDate"
          label="Notification date"
          type="date"
          disabled={!!isLocked}
          value={notificationDate}
          onChange={setNotificationDate}
        />
        <Field
          id="effectiveFrom"
          label="Effective from"
          type="date"
          disabled={!!isLocked}
          value={effectiveFrom}
          onChange={setEffectiveFrom}
        />
      </div>
      <Field
        id="sourceUrl"
        label="Source URL"
        type="url"
        disabled={!!isLocked}
        value={sourceUrl}
        onChange={setSourceUrl}
        placeholder="https://egazette.nic.in/…"
      />
      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className="text-sm font-medium text-zinc-700">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          value={notes}
          disabled={!!isLocked}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Curation notes, VERIFY markers, etc."
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1 disabled:bg-zinc-50 disabled:text-zinc-400"
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
        {!isLocked && (
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : isEditMode ? "Save changes" : "Create QCO"}
          </button>
        )}
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
  disabled,
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  disabled?: boolean;
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
        disabled={disabled}
        aria-required={required ?? false}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1 disabled:bg-zinc-50 disabled:text-zinc-400"
      />
    </div>
  );
}

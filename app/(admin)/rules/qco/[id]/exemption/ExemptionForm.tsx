"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createExemption,
  updateExemption,
  type CreateExemptionInput,
} from "@/lib/admin/rules-actions";

interface Existing {
  id: string;
  type: string;
  description: string;
  conditions: unknown;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}

interface Props {
  qcoId: string;
  existing?: Existing;
}

const EXEMPTION_TYPES = [
  { value: "MSME_PHASED", label: "MSME Phased" },
  { value: "END_USE", label: "End Use" },
  { value: "NOT_DOMESTICALLY_AVAILABLE", label: "Not Domestically Available" },
  { value: "ABEYANCE", label: "Abeyance" },
  { value: "DEFERRED", label: "Deferred" },
] as const;

function toDateInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().split("T")[0];
}

export function ExemptionForm({ qcoId, existing }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [type, setType] = useState<CreateExemptionInput["type"]>(
    (existing?.type as CreateExemptionInput["type"]) ?? "MSME_PHASED",
  );
  const [description, setDescription] = useState(existing?.description ?? "");
  const [conditionsRaw, setConditionsRaw] = useState(
    existing?.conditions ? JSON.stringify(existing.conditions, null, 2) : "",
  );
  const [conditionsError, setConditionsError] = useState<string | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(
    toDateInput(existing?.effectiveFrom ?? null),
  );
  const [effectiveTo, setEffectiveTo] = useState(
    toDateInput(existing?.effectiveTo ?? null),
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setConditionsError(null);

    let conditions: Record<string, unknown> | undefined;
    if (conditionsRaw.trim()) {
      try {
        conditions = JSON.parse(conditionsRaw) as Record<string, unknown>;
      } catch {
        setConditionsError("Conditions must be valid JSON.");
        setSaving(false);
        return;
      }
    }

    const input: CreateExemptionInput = {
      qcoId,
      type,
      description,
      conditions,
      effectiveFrom: effectiveFrom || undefined,
      effectiveTo: effectiveTo || undefined,
    };

    const result = existing
      ? await updateExemption(existing.id, input)
      : await createExemption(input);

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
      aria-label={existing ? "Edit exemption" : "Create exemption"}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="type" className="text-sm font-medium text-zinc-700">
          Exemption type
          <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>
        </label>
        <select
          id="type"
          name="type"
          value={type}
          required
          onChange={(e) => setType(e.target.value as CreateExemptionInput["type"])}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
        >
          {EXEMPTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium text-zinc-700">
          Description
          <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          value={description}
          required
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Plain-language description of the exemption."
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="conditions"
          className="text-sm font-medium text-zinc-700"
        >
          Conditions (JSON, optional)
        </label>
        <textarea
          id="conditions"
          name="conditions"
          value={conditionsRaw}
          onChange={(e) => {
            setConditionsRaw(e.target.value);
            setConditionsError(null);
          }}
          rows={4}
          placeholder={'{ "threshold": 50, "unit": "employees" }'}
          className="rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
        />
        {conditionsError && (
          <p className="text-xs text-red-600" role="alert">
            {conditionsError}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="effectiveFrom" className="text-sm font-medium text-zinc-700">
            Effective from
          </label>
          <input
            id="effectiveFrom"
            name="effectiveFrom"
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="effectiveTo" className="text-sm font-medium text-zinc-700">
            Effective to
          </label>
          <input
            id="effectiveTo"
            name="effectiveTo"
            type="date"
            value={effectiveTo}
            onChange={(e) => setEffectiveTo(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
          />
        </div>
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
          {saving ? "Saving…" : existing ? "Save changes" : "Create exemption"}
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

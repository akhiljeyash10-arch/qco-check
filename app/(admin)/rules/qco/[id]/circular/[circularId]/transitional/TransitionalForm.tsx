"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createTransitionalArrangement,
  updateTransitionalArrangement,
  type CreateTransitionalArrangementInput,
} from "@/lib/admin/rules-actions";

interface Existing {
  id: string;
  triggerDateType: string;
  gracePeriodDays: number;
  conditionText: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}

interface Props {
  qcoId: string;
  circularId: string;
  existing?: Existing;
}

const TRIGGER_DATE_TYPES = [
  { value: "BILL_OF_LADING", label: "Bill of Lading date" },
  { value: "CLEARANCE_DATE", label: "Clearance date" },
  { value: "BILL_OF_ENTRY", label: "Bill of Entry date" },
  { value: "IMPORT_DATE", label: "Import date" },
] as const;

function toDateInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().split("T")[0];
}

export function TransitionalForm({ qcoId, circularId, existing }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [triggerDateType, setTriggerDateType] = useState<CreateTransitionalArrangementInput["triggerDateType"]>(
    (existing?.triggerDateType as CreateTransitionalArrangementInput["triggerDateType"]) ?? "BILL_OF_LADING",
  );
  const [gracePeriodDays, setGracePeriodDays] = useState(
    String(existing?.gracePeriodDays ?? 0),
  );
  const [conditionText, setConditionText] = useState(
    existing?.conditionText ?? "",
  );
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

    const days = parseInt(gracePeriodDays, 10);
    if (isNaN(days) || days < 0) {
      setError("Grace period must be a non-negative whole number.");
      setSaving(false);
      return;
    }

    const input: CreateTransitionalArrangementInput = {
      enforcementCircularId: circularId,
      triggerDateType,
      gracePeriodDays: days,
      conditionText: conditionText || undefined,
      effectiveFrom: effectiveFrom || undefined,
      effectiveTo: effectiveTo || undefined,
    };

    const result = existing
      ? await updateTransitionalArrangement(existing.id, input)
      : await createTransitionalArrangement(input);

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
      aria-label={existing ? "Edit transitional arrangement" : "Create transitional arrangement"}
    >
      <div className="flex flex-col gap-1">
        <label
          htmlFor="triggerDateType"
          className="text-sm font-medium text-zinc-700"
        >
          Trigger date type
          <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>
        </label>
        <select
          id="triggerDateType"
          name="triggerDateType"
          value={triggerDateType}
          required
          onChange={(e) =>
            setTriggerDateType(
              e.target.value as CreateTransitionalArrangementInput["triggerDateType"],
            )
          }
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
        >
          {TRIGGER_DATE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="gracePeriodDays"
          className="text-sm font-medium text-zinc-700"
        >
          Grace period (days)
          <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>
        </label>
        <input
          id="gracePeriodDays"
          name="gracePeriodDays"
          type="number"
          min={0}
          required
          value={gracePeriodDays}
          onChange={(e) => setGracePeriodDays(e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
        />
        <p className="text-xs text-zinc-500">
          Inclusive grace window after the effective date (0 = no grace period).
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="conditionText"
          className="text-sm font-medium text-zinc-700"
        >
          Condition text
        </label>
        <textarea
          id="conditionText"
          name="conditionText"
          value={conditionText}
          onChange={(e) => setConditionText(e.target.value)}
          rows={3}
          placeholder="As worded in the circular (e.g. 'goods loaded on or before…')"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
        />
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
          {saving
            ? "Saving…"
            : existing
              ? "Save changes"
              : "Create arrangement"}
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

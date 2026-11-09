"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changeQcoStatus } from "@/lib/admin/rules-actions";

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["IN_ABEYANCE", "SUPERSEDED"],
  IN_ABEYANCE: ["PUBLISHED", "SUPERSEDED"],
  SUPERSEDED: [],
};

const STATUS_LABELS: Record<string, string> = {
  PUBLISHED: "Publish",
  IN_ABEYANCE: "Place in abeyance",
  SUPERSEDED: "Mark superseded",
};

const STATUS_WARNING: Record<string, string> = {
  PUBLISHED:
    "Publishing this QCO will make it active. Once published, it cannot be edited — only versioned. Confirm?",
  IN_ABEYANCE:
    "Placing this QCO in abeyance suspends enforcement. Confirm?",
  SUPERSEDED:
    "Marking as SUPERSEDED is irreversible. This QCO will no longer be active. Confirm?",
};

interface Props {
  id: string;
  currentStatus: string;
}

export function QcoStatusChanger({ id, currentStatus }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = TRANSITIONS[currentStatus] ?? [];
  if (allowed.length === 0) return null;

  async function handleChange(newStatus: string) {
    const warning = STATUS_WARNING[newStatus] ?? `Change status to ${newStatus}?`;
    if (!window.confirm(warning)) return;

    setPending(true);
    setError(null);
    const result = await changeQcoStatus(
      id,
      newStatus as import("@prisma/client").QcoStatus,
    );
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {allowed.map((s) => (
          <button
            key={s}
            type="button"
            disabled={pending}
            onClick={() => handleChange(s)}
            className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "…" : STATUS_LABELS[s] ?? s}
          </button>
        ))}
      </div>
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

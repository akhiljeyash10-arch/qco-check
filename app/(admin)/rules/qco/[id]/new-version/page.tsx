"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createQcoVersion } from "@/lib/admin/rules-actions";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function NewVersionPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (
      !window.confirm(
        "This creates a new DRAFT version of the QCO. The existing version remains unchanged until you separately supersede it. Confirm?",
      )
    )
      return;

    setSaving(true);
    setError(null);

    const result = await createQcoVersion(id, {
      notes: notes || undefined,
    });

    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/rules/qco/${result.data.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <nav className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/rules" className="hover:text-zinc-900 hover:underline">
          Rules
        </Link>
        <span>/</span>
        <Link href={`/rules/qco/${id}`} className="hover:text-zinc-900 hover:underline">
          QCO
        </Link>
        <span>/</span>
        <span className="text-zinc-900">New version</span>
      </nav>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-900">
        Create new version
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        A new DRAFT version is created as a copy of the existing QCO. You can
        edit it freely until you publish it. The existing version is unaffected
        until you explicitly mark it as SUPERSEDED.
      </p>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 rounded-lg border border-zinc-200 bg-white p-6"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="notes" className="text-sm font-medium text-zinc-700">
            Version notes (optional)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="What changed in this version?"
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
            {saving ? "Creating…" : "Create new version"}
          </button>
          <a
            href={`/rules/qco/${id}`}
            className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}

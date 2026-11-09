import { notFound } from "next/navigation";
import Link from "next/link";
import { getQco } from "@/lib/admin/rules-actions";
import { EnforcementCircularForm } from "../EnforcementCircularForm";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NewCircularPage({ params }: Props) {
  const { id } = await params;
  const qco = await getQco(id);
  if (!qco) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <nav className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/rules" className="hover:text-zinc-900 hover:underline">Rules</Link>
        <span>/</span>
        <Link href={`/rules/qco/${id}`} className="hover:text-zinc-900 hover:underline">{qco.title}</Link>
        <span>/</span>
        <span className="text-zinc-900">New enforcement circular</span>
      </nav>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900">
        New Enforcement Circular
      </h1>
      <EnforcementCircularForm qcoId={id} />
    </div>
  );
}

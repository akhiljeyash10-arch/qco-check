import { notFound } from "next/navigation";
import Link from "next/link";
import { getQco, getISStandards } from "@/lib/admin/rules-actions";
import { QcoItemForm } from "../QcoItemForm";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NewQcoItemPage({ params }: Props) {
  const { id } = await params;
  const [qco, isStandards] = await Promise.all([getQco(id), getISStandards()]);
  if (!qco) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <nav className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/rules" className="hover:text-zinc-900 hover:underline">Rules</Link>
        <span>/</span>
        <Link href={`/rules/qco/${id}`} className="hover:text-zinc-900 hover:underline">{qco.title}</Link>
        <span>/</span>
        <span className="text-zinc-900">New QCO item</span>
      </nav>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900">
        New QCO Item
      </h1>
      <QcoItemForm qcoId={id} isStandards={isStandards} />
    </div>
  );
}

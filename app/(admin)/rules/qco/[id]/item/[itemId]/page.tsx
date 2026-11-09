import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getISStandards } from "@/lib/admin/rules-actions";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { QcoItemForm } from "../QcoItemForm";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string; itemId: string }>;
}

export default async function EditQcoItemPage({ params }: Props) {
  const { id, itemId } = await params;

  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "ADMIN") redirect("/determinations");

  const [item, isStandards] = await Promise.all([
    prisma.qCOItem.findUnique({
      where: { id: itemId },
      include: { isStandards: true, qco: true },
    }),
    getISStandards(),
  ]);

  if (!item || item.qcoId !== id) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <nav className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/rules" className="hover:text-zinc-900 hover:underline">Rules</Link>
        <span>/</span>
        <Link href={`/rules/qco/${id}`} className="hover:text-zinc-900 hover:underline">{item.qco.title}</Link>
        <span>/</span>
        <span className="text-zinc-900">Edit item</span>
      </nav>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900">
        Edit QCO Item
      </h1>
      <QcoItemForm
        qcoId={id}
        isStandards={isStandards}
        existing={item}
      />
    </div>
  );
}

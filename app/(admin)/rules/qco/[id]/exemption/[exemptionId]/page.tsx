import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { ExemptionForm } from "../ExemptionForm";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string; exemptionId: string }>;
}

export default async function EditExemptionPage({ params }: Props) {
  const { id, exemptionId } = await params;

  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "ADMIN") redirect("/determinations");

  const exemption = await prisma.exemption.findUnique({
    where: { id: exemptionId },
    include: { qco: true },
  });

  if (!exemption || exemption.qcoId !== id) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <nav className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/rules" className="hover:text-zinc-900 hover:underline">Rules</Link>
        <span>/</span>
        <Link href={`/rules/qco/${id}`} className="hover:text-zinc-900 hover:underline">{exemption.qco.title}</Link>
        <span>/</span>
        <span className="text-zinc-900">Edit exemption</span>
      </nav>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900">
        Edit Exemption
      </h1>
      <ExemptionForm qcoId={id} existing={exemption} />
    </div>
  );
}

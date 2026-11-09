import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { EnforcementCircularForm } from "../EnforcementCircularForm";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string; circularId: string }>;
}

export default async function EditCircularPage({ params }: Props) {
  const { id, circularId } = await params;

  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "ADMIN") redirect("/determinations");

  const circular = await prisma.enforcementCircular.findUnique({
    where: { id: circularId },
    include: { qco: true },
  });

  if (!circular || circular.qcoId !== id) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <nav className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/rules" className="hover:text-zinc-900 hover:underline">Rules</Link>
        <span>/</span>
        <Link href={`/rules/qco/${id}`} className="hover:text-zinc-900 hover:underline">{circular.qco.title}</Link>
        <span>/</span>
        <span className="text-zinc-900">Edit circular</span>
      </nav>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900">
        Edit Enforcement Circular
      </h1>
      <EnforcementCircularForm qcoId={id} existing={circular} />
    </div>
  );
}

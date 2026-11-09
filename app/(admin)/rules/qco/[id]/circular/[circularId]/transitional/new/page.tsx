import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { TransitionalForm } from "../TransitionalForm";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string; circularId: string }>;
}

export default async function NewTransitionalPage({ params }: Props) {
  const { id, circularId } = await params;

  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "ADMIN") redirect("/determinations");

  const circular = await prisma.enforcementCircular.findUnique({
    where: { id: circularId },
    include: { qco: true, transitionalArrangement: true },
  });
  if (!circular || circular.qcoId !== id) notFound();
  if (circular.transitionalArrangement) {
    // Already has one — redirect to edit.
    redirect(`/rules/qco/${id}/circular/${circularId}/transitional`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <nav className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/rules" className="hover:text-zinc-900 hover:underline">Rules</Link>
        <span>/</span>
        <Link href={`/rules/qco/${id}`} className="hover:text-zinc-900 hover:underline">{circular.qco.title}</Link>
        <span>/</span>
        <span className="text-zinc-900">New transitional arrangement</span>
      </nav>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900">
        New Transitional Arrangement
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        For circular: <strong>{circular.circularReference}</strong>
      </p>
      <TransitionalForm qcoId={id} circularId={circularId} />
    </div>
  );
}

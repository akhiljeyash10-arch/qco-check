import { getReviewQueue } from "@/lib/admin/queue-actions";
import { prisma } from "@/lib/prisma";
import { QueueList } from "./QueueList";
import { StatCards } from "@/components/StatCards";

export const dynamic = "force-dynamic";

/**
 * Admin review-queue page (Task 9).
 *
 * Lists all PENDING Amber determinations across ALL firms (admin bypasses firm
 * scoping). Resolve each case with a final verdict, then optionally promote it
 * into a rule so future identical queries auto-resolve.
 */
export default async function QueuePage() {
  const items = await getReviewQueue();

  // KPI counts across all review queue items.
  const [counts, activeQcos, isStandards] = await Promise.all([
    prisma.reviewQueueItem.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.qCO.count({ where: { status: "PUBLISHED" } }),
    prisma.iSStandard.count(),
  ]);
  const pending = counts.find((c) => c.status === "PENDING")?._count._all ?? 0;
  const promoted =
    counts.find((c) => c.status === "PROMOTED")?._count._all ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Review Queue
        </h1>
        <span className="text-sm text-zinc-500">
          {items.length} Amber case{items.length === 1 ? "" : "s"} awaiting
          review
        </span>
      </div>

      <p className="text-sm text-zinc-600">
        Low-confidence (Amber) determinations from all firms are routed here.
        Resolve each case with a final verdict, then optionally promote it into
        a rule so future identical queries auto-resolve.
      </p>

      <StatCards
        cards={[
          {
            icon: "ShieldCheck",
            label: "Active QCOs",
            value: activeQcos,
            accent: "blue",
          },
          {
            icon: "BookOpen",
            label: "IS Standards",
            value: isStandards,
            accent: "zinc",
          },
          {
            icon: "AlertTriangle",
            label: "Pending Cases",
            value: pending,
            accent: "amber",
          },
          {
            icon: "Lightbulb",
            label: "Promoted Rules",
            value: promoted,
            accent: "green",
          },
        ]}
      />

      <QueueList items={items} />
    </div>
  );
}

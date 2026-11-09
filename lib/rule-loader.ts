import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  EnforcementCircular,
  Exemption,
  ISStandard,
  QCO,
  QCOItem,
  RuleContext,
  TransitionalArrangement,
} from "@/lib/engine/types";

/**
 * Server-side rule loader.
 *
 * Loads the full set of rule versions from the DB and constructs a
 * {@link RuleContext} (plain typed objects) for the pure-TS engine. The engine
 * has no Prisma dependency; this module is the bridge that converts Prisma rows
 * (with JSONB fields and DateTime columns) into the engine's standalone types.
 *
 * The engine performs point-in-time resolution itself (it decides which QCO is
 * active as of a given date), so the loader returns *all* rule versions —
 * including superseded QCOs and their items — so the engine can reason about
 * supersession correctly. The loaded context is what gets snapshotted into a
 * `Determination.ruleVersionSnapshot` for reproducibility.
 *
 * @module lib/rule-loader
 */

/**
 * Deep-clone a value into a JSON-safe form (Date → ISO string). Used when the
 * context needs to be serialised to Prisma JSONB (`ruleVersionSnapshot`); the
 * engine itself receives the live `Date` objects.
 */
export function serializeContext(ctx: RuleContext): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(ctx)) as Prisma.InputJsonValue;
}

/**
 * Load all rule versions from the DB and build a {@link RuleContext}.
 *
 * Conversions performed here:
 *  - `QCO.supersededAt` (engine-only) is derived from the *superseding* QCO's
 *    `effectiveFrom` — i.e. when this QCO stopped being active.
 *  - `QCOItem.gradeSpec` / `hsCodes` (Prisma `Json`) are cast to their typed
 *    shapes.
 *  - `Exemption.conditions` (Prisma `Json`) is cast to a plain record.
 *  - Prisma `DateTime` columns pass through as JS `Date` objects (the engine
 *    compares them with `.getTime()`, all UTC).
 */
export async function loadRuleContext(): Promise<RuleContext> {
  const [qcos, qcoItems, enforcementCirculars, transitionalArrangements, exemptions] =
    await Promise.all([
      prisma.qCO.findMany(),
      prisma.qCOItem.findMany({ include: { isStandards: true } }),
      prisma.enforcementCircular.findMany(),
      prisma.transitionalArrangement.findMany(),
      prisma.exemption.findMany(),
    ]);

  // Lookup for supersededAt derivation: map QCO id → its effectiveFrom.
  const effectiveByQcoId = new Map(
    qcos.map((q) => [q.id, q.effectiveFrom ?? null]),
  );

  const engineQcos: QCO[] = qcos.map((q) => {
    let supersededAt: Date | null = null;
    if (q.supersededById) {
      const supersedingEffective = effectiveByQcoId.get(q.supersededById);
      if (supersedingEffective) supersededAt = supersedingEffective;
    }
    return {
      id: q.id,
      title: q.title,
      gazetteReference: q.gazetteReference,
      notificationDate: q.notificationDate,
      status: q.status,
      supersededById: q.supersededById,
      supersededAt,
      version: q.version,
      effectiveFrom: q.effectiveFrom,
    };
  });

  const engineQcoItems: QCOItem[] = qcoItems.map((item) => ({
    id: item.id,
    qcoId: item.qcoId,
    productName: item.productName,
    productDescription: item.productDescription,
    gradeSpec: item.gradeSpec as unknown as QCOItem["gradeSpec"],
    hsCodes: Array.isArray(item.hsCodes) ? (item.hsCodes as string[]) : [],
    isStandards: item.isStandards.map(
      (is): ISStandard => ({
        id: is.id,
        isNumber: is.isNumber,
        title: is.title,
        versionYear: is.versionYear,
      }),
    ),
  }));

  const engineCirculars: EnforcementCircular[] = enforcementCirculars.map(
    (ec) => ({
      id: ec.id,
      qcoId: ec.qcoId,
      circularReference: ec.circularReference,
      circularDate: ec.circularDate,
      effectiveDate: ec.effectiveDate,
    }),
  );

  const engineTransitional: TransitionalArrangement[] =
    transitionalArrangements.map((ta) => ({
      id: ta.id,
      enforcementCircularId: ta.enforcementCircularId,
      triggerDateType: ta.triggerDateType,
      gracePeriodDays: ta.gracePeriodDays,
      effectiveFrom: ta.effectiveFrom,
      effectiveTo: ta.effectiveTo,
    }));

  const engineExemptions: Exemption[] = exemptions.map((ex) => ({
    id: ex.id,
    qcoId: ex.qcoId,
    type: ex.type,
    description: ex.description,
    conditions: (ex.conditions as Record<string, unknown> | null) ?? null,
    effectiveFrom: ex.effectiveFrom,
    effectiveTo: ex.effectiveTo,
  }));

  return {
    qcos: engineQcos,
    isStandards: engineQcoItems.flatMap((i) => i.isStandards),
    qcoItems: engineQcoItems,
    enforcementCirculars: engineCirculars,
    transitionalArrangements: engineTransitional,
    exemptions: engineExemptions,
  };
}

import { prisma } from "@/lib/prisma";
import { evaluate } from "@/lib/engine/engine";
import type {
  EngineInput,
  EngineResult,
  Exemption,
  EnforcementCircular,
  ISStandard,
  QCO,
  QCOItem,
  RuleContext,
  TransitionalArrangement,
} from "@/lib/engine/types";

/**
 * Reproducibility check (Task 10).
 *
 * A determination is only legally defensible if it stays reproducible after
 * later rule amendments. Every {@link Determination} stores a
 * `ruleVersionSnapshot` (the serialised rule context active at check time) and
 * the `input` the user supplied. This module re-hydrates that snapshot back
 * into a live {@link RuleContext} (ISO date strings → `Date` objects) and
 * re-runs the pure-TS engine, then compares the reproduced verdict against the
 * stored one.
 *
 * The deserialisers are plain, dependency-free functions so they are fully unit-
 * and property-testable without a database; {@link reproduceDetermination} is
 * the DB-backed entry point used by the API/UI and the regression test.
 *
 * @module lib/check/reproducibility
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Outcome of a reproducibility check. */
export interface ReproducibilityResult {
  determinationId: string;
  /** The verdict stored on the original determination row. */
  originalVerdict: EngineResult["verdict"];
  /** The verdict produced by re-running the engine against the snapshot. */
  reproducedVerdict: EngineResult["verdict"];
  /** True when the two verdicts match. */
  matches: boolean;
  /** The full re-evaluated engine result (references + reasoning trace). */
  reproduced: EngineResult;
}

// ---------------------------------------------------------------------------
// Date hydration helpers
// ---------------------------------------------------------------------------

/**
 * Convert a JSON-snapshot value back into a `Date` (or `null`).
 *
 * `serializeContext` round-trips through `JSON.stringify`, so every `Date`
 * becomes an ISO string and `undefined`-valued properties are dropped. This
 * helper accepts both shapes: a valid ISO date string → `Date`; `null` or a
 * missing value → `null`. Non-date strings are passed through untouched
 * (`new Date(...)` is guarded so a non-date never throws).
 */
function toDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** A date-or-undefined hydrator (preserves the "absent" semantics for BL date). */
function toDateOrUndef(value: unknown): Date | undefined {
  if (value == null) return undefined;
  const d = toDate(value);
  return d ?? undefined;
}

// ---------------------------------------------------------------------------
// Context deserialiser
// ---------------------------------------------------------------------------

/**
 * Re-hydrate a JSON-snapshot rule context back into a live {@link RuleContext}
 * with `Date` objects.
 *
 * Only the known date-bearing fields are converted; all other fields pass
 * through as-is (they are plain JSON after the snapshot round-trip). The result
 * is structurally identical to the original context the engine evaluated
 * against at check time, which is exactly what makes determinations
 * reproducible after later amendments.
 */
export function deserializeContext(snapshot: unknown): RuleContext {
  const s = (snapshot ?? {}) as Record<string, unknown>;
  return {
    qcos: Array.isArray(s.qcos) ? s.qcos.map(deserializeQco) : [],
    isStandards: Array.isArray(s.isStandards)
      ? s.isStandards.map(deserializeIsStandard)
      : [],
    qcoItems: Array.isArray(s.qcoItems) ? s.qcoItems.map(deserializeQcoItem) : [],
    enforcementCirculars: Array.isArray(s.enforcementCirculars)
      ? s.enforcementCirculars.map(deserializeCircular)
      : [],
    transitionalArrangements: Array.isArray(s.transitionalArrangements)
      ? s.transitionalArrangements.map(deserializeTransitional)
      : [],
    exemptions: Array.isArray(s.exemptions)
      ? s.exemptions.map(deserializeExemption)
      : [],
  };
}

function deserializeQco(raw: unknown): QCO {
  const q = raw as Record<string, unknown>;
  return {
    id: String(q.id ?? ""),
    title: String(q.title ?? ""),
    gazetteReference: String(q.gazetteReference ?? ""),
    notificationDate: toDate(q.notificationDate),
    status: (q.status as QCO["status"]) ?? "DRAFT",
    supersededById: (q.supersededById as string | null | undefined) ?? null,
    supersededAt: toDate(q.supersededAt),
    version: Number(q.version ?? 1),
    effectiveFrom: toDate(q.effectiveFrom),
  };
}

function deserializeIsStandard(raw: unknown): ISStandard {
  const i = raw as Record<string, unknown>;
  return {
    id: String(i.id ?? ""),
    isNumber: String(i.isNumber ?? ""),
    title: String(i.title ?? ""),
    versionYear:
      i.versionYear == null ? null : Number(i.versionYear),
  };
}

function deserializeQcoItem(raw: unknown): QCOItem {
  const it = raw as Record<string, unknown>;
  return {
    id: String(it.id ?? ""),
    qcoId: String(it.qcoId ?? ""),
    productName: String(it.productName ?? ""),
    productDescription:
      it.productDescription == null ? null : String(it.productDescription),
    gradeSpec: (it.gradeSpec ?? {}) as QCOItem["gradeSpec"],
    hsCodes: Array.isArray(it.hsCodes)
      ? it.hsCodes.map((c) => String(c))
      : [],
    isStandards: Array.isArray(it.isStandards)
      ? it.isStandards.map(deserializeIsStandard)
      : [],
  };
}

function deserializeCircular(raw: unknown): EnforcementCircular {
  const c = raw as Record<string, unknown>;
  return {
    id: String(c.id ?? ""),
    qcoId: String(c.qcoId ?? ""),
    circularReference: String(c.circularReference ?? ""),
    circularDate: toDate(c.circularDate),
    effectiveDate: toDate(c.effectiveDate),
  };
}

function deserializeTransitional(raw: unknown): TransitionalArrangement {
  const t = raw as Record<string, unknown>;
  return {
    id: String(t.id ?? ""),
    enforcementCircularId: String(t.enforcementCircularId ?? ""),
    triggerDateType: (t.triggerDateType as TransitionalArrangement["triggerDateType"]) ??
      "CLEARANCE_DATE",
    gracePeriodDays: Number(t.gracePeriodDays ?? 0),
    effectiveFrom: toDate(t.effectiveFrom),
    effectiveTo: toDate(t.effectiveTo),
  };
}

function deserializeExemption(raw: unknown): Exemption {
  const e = raw as Record<string, unknown>;
  return {
    id: String(e.id ?? ""),
    qcoId: String(e.qcoId ?? ""),
    type: (e.type as Exemption["type"]) ?? "END_USE",
    description: String(e.description ?? ""),
    conditions:
      e.conditions == null
        ? null
        : (e.conditions as Record<string, unknown> | null),
    effectiveFrom: toDate(e.effectiveFrom),
    effectiveTo: toDate(e.effectiveTo),
  };
}

// ---------------------------------------------------------------------------
// Input deserialiser
// ---------------------------------------------------------------------------

/**
 * Re-hydrate a stored determination `input` (JSONB) back into an
 * {@link EngineInput} with `Date` objects. Mirrors the snapshot round-trip:
 * `clearanceDate` (always present) and `billOfLadingDate` (optional) come back
 * as ISO strings and are converted.
 */
export function deserializeInput(stored: unknown): EngineInput {
  const i = (stored ?? {}) as Record<string, unknown>;
  return {
    productType: i.productType == null ? undefined : String(i.productType),
    grade: i.grade == null ? undefined : String(i.grade),
    dimensions: i.dimensions == null ? undefined : String(i.dimensions),
    material: i.material == null ? undefined : String(i.material),
    hsCode: String(i.hsCode ?? ""),
    clearanceDate: toDate(i.clearanceDate) ?? new Date(0),
    billOfLadingDate: toDateOrUndef(i.billOfLadingDate),
    msmeRegistered:
      i.msmeRegistered === true ? true : undefined,
    endUse: i.endUse == null ? undefined : String(i.endUse),
    notDomesticallyAvailable:
      i.notDomesticallyAvailable === true ? true : undefined,
  };
}

// ---------------------------------------------------------------------------
// DB-backed reproducibility check
// ---------------------------------------------------------------------------

/**
 * Re-run an old determination's inputs against its snapshotted rule versions
 * and verify the verdict is unchanged.
 *
 * Loads the determination, re-hydrates its `ruleVersionSnapshot` (via
 * {@link deserializeContext}) and its stored `input` (via {@link deserializeInput}),
 * calls the pure-TS {@link evaluate}, and compares the reproduced verdict to
 * the stored one. Returns the full reproduced result for inspection.
 *
 * @returns `null` when the determination does not exist.
 */
export async function reproduceDetermination(
  determinationId: string,
): Promise<ReproducibilityResult | null> {
  const det = await prisma.determination.findUnique({
    where: { id: determinationId },
  });
  if (!det) return null;

  const ruleContext = deserializeContext(det.ruleVersionSnapshot);
  const input = deserializeInput(det.input);

  const reproduced = evaluate(input, ruleContext);

  return {
    determinationId: det.id,
    originalVerdict: det.verdict,
    reproducedVerdict: reproduced.verdict,
    matches: reproduced.verdict === det.verdict,
    reproduced,
  };
}

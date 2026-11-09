/**
 * Pure-TS rules-engine type definitions.
 *
 * These types mirror the Prisma model shapes (see `prisma/schema.prisma`) but are
 * defined standalone so the engine has NO database or Prisma-client dependency.
 * The server-side loader (Task 5) builds a {@link RuleContext} from Prisma rows;
 * the engine consumes it as plain data and returns an {@link EngineResult}.
 *
 * @module lib/engine/types
 */

// ---------------------------------------------------------------------------
// Enums (mirror Prisma enums as plain string unions)
// ---------------------------------------------------------------------------

export type QcoStatus = "DRAFT" | "PUBLISHED" | "SUPERSEDED" | "IN_ABEYANCE";

export type TriggerDateType =
  | "BILL_OF_LADING"
  | "CLEARANCE_DATE"
  | "BILL_OF_ENTRY"
  | "IMPORT_DATE";

export type ExemptionType =
  | "MSME_PHASED"
  | "END_USE"
  | "NOT_DOMESTICALLY_AVAILABLE"
  | "ABEYANCE"
  | "DEFERRED";

export type Verdict = "GREEN" | "RED" | "AMBER";

// ---------------------------------------------------------------------------
// Entity shapes (mirror Prisma models; JSONB fields deserialised to TS)
// ---------------------------------------------------------------------------

/** JSONB spec payload stored on each QCOItem. */
export interface GradeSpec {
  grade: string;
  dimensions: string;
  material: string;
}

/** An Indian Standard (e.g. "IS 2062") referenced by QCOItems. */
export interface ISStandard {
  id: string;
  isNumber: string;
  title: string;
  versionYear?: number | null;
}

/**
 * A Quality Control Order — the legal mandate. Holds the product table + IS
 * numbers + Gazette reference. Immutable once PUBLISHED; edits create a new
 * version row. Supersession is an explicit self-relation.
 */
export interface QCO {
  id: string;
  title: string;
  gazetteReference: string;
  notificationDate?: Date | null;
  status: QcoStatus;
  /** Self-relation: the QCO that legally replaces this one. */
  supersededById?: string | null;
  /**
   * Engine-only field: the effective date of the superseding QCO (when this QCO
   * stopped being active). Populated by the server-side loader from the
   * superseding QCO's `effectiveFrom`. `null` when not superseded or the date
   * is unknown.
   */
  supersededAt?: Date | null;
  version: number;
  /** When the QCO itself becomes legally effective (mandate side). */
  effectiveFrom?: Date | null;
}

/**
 * The atomic rule: "a product matching these specs + HS-code hints requires BIS
 * certification under [IS number] per [QCO]". The spec match (grade /
 * dimensions / material) carries the decision; `hsCodes` is a matching hint.
 */
export interface QCOItem {
  id: string;
  qcoId: string;
  productName: string;
  productDescription?: string | null;
  gradeSpec: GradeSpec;
  /** HS-code hints (matching guidance only — QCOs are written against IS
   * standards, not HS codes). */
  hsCodes: string[];
  isStandards: ISStandard[];
}

/**
 * The CBIC instrument that makes a QCO's date effective at customs. Carries the
 * customs effective date and (optionally) a transitional arrangement.
 */
export interface EnforcementCircular {
  id: string;
  qcoId: string;
  circularReference: string;
  circularDate?: Date | null;
  /** The date customs starts enforcing the QCO. */
  effectiveDate?: Date | null;
}

/**
 * Transitional arrangement tied to an enforcement circular: the grace window
 * and which shipment date (BL vs. clearance vs. bill of entry vs. import date)
 * the engine evaluates against.
 */
export interface TransitionalArrangement {
  id: string;
  enforcementCircularId: string;
  triggerDateType: TriggerDateType;
  /** Grace period in days after the effective date (inclusive window). */
  gracePeriodDays: number;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
}

/** Carve-outs from a QCO: MSME phasing, end-use, not-domestically-available,
 * abeyance, or deferred enforcement. */
export interface Exemption {
  id: string;
  qcoId: string;
  type: ExemptionType;
  description: string;
  /** Free-form conditions JSON (e.g. `{ appliesTo, endUse }`). */
  conditions?: Record<string, unknown> | null;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
}

// ---------------------------------------------------------------------------
// RuleContext (the rule versions, loaded server-side)
// ---------------------------------------------------------------------------

/**
 * The full set of rule versions the engine evaluates against. Built server-side
 * from Prisma rows; the engine treats it as read-only plain data. This is what
 * gets snapshotted into a `Determination.ruleVersionSnapshot` for reproducibility.
 */
export interface RuleContext {
  qcos: QCO[];
  isStandards: ISStandard[];
  qcoItems: QCOItem[];
  enforcementCirculars: EnforcementCircular[];
  transitionalArrangements: TransitionalArrangement[];
  exemptions: Exemption[];
}

// ---------------------------------------------------------------------------
// Engine input
// ---------------------------------------------------------------------------

/**
 * A single applicability check input. The engine takes this plus a
 * {@link RuleContext} and returns an {@link EngineResult}.
 */
export interface EngineInput {
  productType?: string;
  grade?: string;
  dimensions?: string;
  material?: string;
  /** HS code (the matching hint to resolve candidate QCOItems). */
  hsCode: string;
  /** Customs clearance date (required — the default applicable date). */
  clearanceDate: Date;
  /** Bill of Lading date (required when the trigger type is BILL_OF_LADING). */
  billOfLadingDate?: Date;
  /** Optional exemption-qualification flags (V1). */
  msmeRegistered?: boolean;
  endUse?: string;
  notDomesticallyAvailable?: boolean;
}

// ---------------------------------------------------------------------------
// Engine output
// ---------------------------------------------------------------------------

/** A single step in the reasoning trace (legal defensibility). */
export interface ReasoningStep {
  step: string;
  /** Human-readable explanation of this step (on verdict steps). */
  reason?: string;
  /** The verdict reached (on verdict steps). */
  verdict?: string;
  [key: string]: unknown;
}

/** Determination lifecycle (mirrors the Prisma `DeterminationStatus` enum). */
export type EngineStatus = "COMPLETED" | "PENDING_REVIEW";

/**
 * The result of {@link evaluate}. This is the engine's verdict + all the
 * references and reasoning. The API layer (Task 5) persists this as a
 * `Determination` row (firm-scoped, with a rule-version snapshot).
 */
export interface EngineResult {
  verdict: Verdict;
  /** Confidence score in [0, 1] from the spec match. */
  confidence: number;
  /** IS number(s) cited (null when no match). */
  isNumber: string | null;
  /** QCO Gazette reference cited (null when no match). */
  gazetteReference: string | null;
  /** CBIC circular reference cited (null when no match). */
  circularReference: string | null;
  /** Human-readable transitional status (null when no transitional arrangement). */
  transitionalStatus: string | null;
  qcoItemId: string | null;
  qcoId: string | null;
  enforcementCircularId: string | null;
  status: EngineStatus;
  /** Step-by-step reasoning trace. */
  reasoningTrace: ReasoningStep[];
}

/**
 * Shared test fixtures and demo data for the rules engine.
 *
 * `buildSeedContext` mirrors the curated seed dataset from `prisma/seed.ts`
 * (Task 3) as plain objects — no Prisma client dependency. Dates that the seed
 * marks "VERIFY" are resolved to concrete values here so the engine and its
 * tests can exercise every path (active, transitional, exemption, etc.).
 *
 * Variant builders (`buildDraftContext`, `buildSupersededContext`,
 * `buildAbeyanceContext`, `buildMultiCandidateContext`) produce edge-case
 * contexts for the unit and property-based tests.
 *
 * @module lib/engine/fixtures
 */

import type {
  EngineInput,
  Exemption,
  EnforcementCircular,
  ISStandard,
  QCO,
  QCOItem,
  RuleContext,
  TransitionalArrangement,
} from "./types";

// ---------------------------------------------------------------------------
// Base dates (UTC midnight — deterministic across runs and time zones)
// ---------------------------------------------------------------------------

export const STEEL_EFFECTIVE = new Date("2020-12-22T00:00:00.000Z");
export const STEEL_GRACE_END = new Date("2021-03-22T00:00:00.000Z"); // +90 days
export const FASTENERS_EFFECTIVE = new Date("2022-01-01T00:00:00.000Z");
export const FASTENERS_GRACE_END = new Date("2022-03-02T00:00:00.000Z"); // +60 days

// ---------------------------------------------------------------------------
// IS Standards
// ---------------------------------------------------------------------------

const IS_2062: ISStandard = {
  id: "is-2062",
  isNumber: "IS 2062",
  title: "Hot Rolled Medium and High Tensile Structural Steel",
  versionYear: 2011,
};

const IS_1079: ISStandard = {
  id: "is-1079",
  isNumber: "IS 1079",
  title: "Hot Rolled Carbon Steel Sheet and Strip",
  versionYear: 2017,
};

const IS_1666: ISStandard = {
  id: "is-1666",
  isNumber: "IS 1666",
  title: "Cold Rolled Grain Oriented (CRGO) Electrical Steel Sheets and Strips",
};

const IS_1367: ISStandard = {
  id: "is-1367",
  isNumber: "IS 1367",
  title: "Technical Supply Conditions for Threaded Steel Fasteners",
};

const IS_277: ISStandard = {
  id: "is-277",
  isNumber: "IS 277",
  title: "Galvanised Steel Sheets (Plain and Corrugated)",
  versionYear: 2018,
};

const IS_7887: ISStandard = {
  id: "is-7887",
  isNumber: "IS 7887",
  title: "Specification for Carbon Steel Wire Rods",
  versionYear: 2016,
};

const ALL_IS_STANDARDS = [IS_2062, IS_1079, IS_1666, IS_1367, IS_277, IS_7887];

// ---------------------------------------------------------------------------
// QCOs
// ---------------------------------------------------------------------------

const STEEL_QCO: QCO = {
  id: "qco-steel-2020",
  title: "Steel and Steel Products (Quality Control) Order, 2020",
  gazetteReference:
    "VERIFY: S.O. 4182(E) dated 22 Dec 2020 — confirm exact S.O. number during curation",
  notificationDate: STEEL_EFFECTIVE,
  status: "PUBLISHED",
  supersededById: null,
  supersededAt: null,
  version: 1,
  effectiveFrom: STEEL_EFFECTIVE,
};

const FASTENERS_QCO: QCO = {
  id: "qco-fasteners",
  title: "Bolts, Nuts and Washers (Quality Control) Order",
  gazetteReference:
    "VERIFY: S.O. XXXX(E) — exact Gazette reference to confirm during curation",
  notificationDate: FASTENERS_EFFECTIVE,
  status: "PUBLISHED",
  supersededById: null,
  supersededAt: null,
  version: 1,
  effectiveFrom: FASTENERS_EFFECTIVE,
};

// ---------------------------------------------------------------------------
// QCO Items
// ---------------------------------------------------------------------------

const E250_ITEM: QCOItem = {
  id: "qcoitem-steel-e250",
  qcoId: "qco-steel-2020",
  productName: "Hot Rolled Structural Steel (E250 grade)",
  productDescription: "Plates, sections, and profiles conforming to IS 2062",
  gradeSpec: {
    grade: "E250",
    dimensions: "plates/sections/profiles",
    material: "carbon structural steel",
  },
  hsCodes: ["7208.52", "7228.30"],
  isStandards: [IS_2062],
};

const HR_SHEET_ITEM: QCOItem = {
  id: "qcoitem-steel-hr-sheet",
  qcoId: "qco-steel-2020",
  productName: "Hot Rolled Carbon Steel Sheet and Strip",
  productDescription: "HR carbon steel sheets and strips conforming to IS 1079",
  gradeSpec: {
    grade: "HR1/HR2/HR3",
    dimensions: "sheet/strip",
    material: "carbon steel",
  },
  hsCodes: ["7208.90", "7211.13"],
  isStandards: [IS_1079],
};

const CRGO_ITEM: QCOItem = {
  id: "qcoitem-steel-crgo",
  qcoId: "qco-steel-2020",
  productName: "Cold Rolled Grain Oriented (CRGO) Electrical Steel",
  productDescription:
    "CRGO electrical steel sheets/strips — a hotly litigated import category",
  gradeSpec: {
    grade: "27CG120 / 30G130",
    dimensions: "sheet/strip",
    material: "CRGO electrical steel",
  },
  hsCodes: ["7225.11", "7225.19"],
  isStandards: [IS_1666],
};

const FASTENERS_ITEM: QCOItem = {
  id: "qcoitem-fasteners",
  qcoId: "qco-fasteners",
  productName: "Hexagon Head Bolts, Screws, Nuts and Washers",
  productDescription:
    "Industrial fasteners conforming to IS 1367 technical supply conditions",
  gradeSpec: {
    grade: "Property Class 8.8",
    dimensions: "M6-M48",
    material: "carbon/alloy steel",
  },
  hsCodes: ["7318.15", "7318.16", "7318.24"],
  isStandards: [IS_1367],
};

// QCOItems added in Task 10 (expanded seed dataset). Distinct 4-digit HS
// prefixes (7212 / 7213) keep them independent of the existing E250/HR/CRGO
// items so existing engine behaviour is unchanged.
const GALVANIZED_ITEM: QCOItem = {
  id: "qcoitem-steel-galvanized",
  qcoId: "qco-steel-2020",
  productName: "Galvanised Carbon Steel Sheets and Strips",
  productDescription: "Plain/corrugated galvanised sheets conforming to IS 277",
  gradeSpec: {
    grade: "Zn275",
    dimensions: "sheet/strip",
    material: "galvanised carbon steel",
  },
  hsCodes: ["7212.20", "7212.30"],
  isStandards: [IS_277],
};

const WIRE_ROD_ITEM: QCOItem = {
  id: "qcoitem-steel-wire-rod",
  qcoId: "qco-steel-2020",
  productName: "Carbon Steel Wire Rods",
  productDescription: "Wire rods conforming to IS 7887",
  gradeSpec: {
    grade: "SWR1",
    dimensions: "rods 5.5-20mm",
    material: "carbon steel wire rod",
  },
  hsCodes: ["7213.10"],
  isStandards: [IS_7887],
};

// ---------------------------------------------------------------------------
// Enforcement Circulars
// ---------------------------------------------------------------------------

const STEEL_EC: EnforcementCircular = {
  id: "ec-steel-2020",
  qcoId: "qco-steel-2020",
  circularReference:
    "VERIFY: CBIC Circular No. XX/2020-Customs — confirm exact number during curation",
  circularDate: STEEL_EFFECTIVE,
  effectiveDate: STEEL_EFFECTIVE,
};

const FASTENERS_EC: EnforcementCircular = {
  id: "ec-fasteners",
  qcoId: "qco-fasteners",
  circularReference:
    "VERIFY: CBIC Circular No. XX/20XX-Customs — confirm exact number during curation",
  circularDate: FASTENERS_EFFECTIVE,
  effectiveDate: FASTENERS_EFFECTIVE,
};

// ---------------------------------------------------------------------------
// Transitional Arrangements
// ---------------------------------------------------------------------------

const STEEL_TA: TransitionalArrangement = {
  id: "ta-steel-2020",
  enforcementCircularId: "ec-steel-2020",
  triggerDateType: "BILL_OF_LADING",
  gracePeriodDays: 90,
  effectiveFrom: STEEL_EFFECTIVE,
};

const FASTENERS_TA: TransitionalArrangement = {
  id: "ta-fasteners",
  enforcementCircularId: "ec-fasteners",
  triggerDateType: "CLEARANCE_DATE",
  gracePeriodDays: 60,
  effectiveFrom: FASTENERS_EFFECTIVE,
};

// ---------------------------------------------------------------------------
// Exemptions
// ---------------------------------------------------------------------------

const STEEL_MSME_EXEMPTION: Exemption = {
  id: "ex-steel-msme",
  qcoId: "qco-steel-2020",
  type: "MSME_PHASED",
  description:
    "MSME-phased compliance timeline for small-scale manufacturers (VERIFY: exact phasing dates).",
  conditions: {
    appliesTo: "MSME-registered manufacturers",
    phaseEnd: "VERIFY",
  },
  effectiveFrom: STEEL_EFFECTIVE,
};

// END_USE exemption (Task 10 expanded seed) — linked to the fasteners QCO so
// the steel QCO's exemption ordering is unchanged.
const FASTENERS_ENDUSE_EXEMPTION: Exemption = {
  id: "ex-fasteners-enduse",
  qcoId: "qco-fasteners",
  type: "END_USE",
  description:
    "End-use exemption for fasteners imported as capital-goods project supplies (VERIFY: exact wording).",
  conditions: { endUse: "capital goods" },
  effectiveFrom: null,
  effectiveTo: null,
};

// ---------------------------------------------------------------------------
// buildSeedContext — mirrors the seed dataset
// ---------------------------------------------------------------------------

/**
 * Build a {@link RuleContext} that mirrors the curated seed dataset from
 * `prisma/seed.ts` as plain objects. Dates marked "VERIFY" in the seed are
 * resolved to concrete values here so every engine path is exercisable.
 */
export function buildSeedContext(): RuleContext {
  return {
    isStandards: ALL_IS_STANDARDS,
    qcos: [STEEL_QCO, FASTENERS_QCO],
    qcoItems: [
      E250_ITEM,
      HR_SHEET_ITEM,
      CRGO_ITEM,
      FASTENERS_ITEM,
      GALVANIZED_ITEM,
      WIRE_ROD_ITEM,
    ],
    enforcementCirculars: [STEEL_EC, FASTENERS_EC],
    transitionalArrangements: [STEEL_TA, FASTENERS_TA],
    exemptions: [STEEL_MSME_EXEMPTION, FASTENERS_ENDUSE_EXEMPTION],
  };
}

// ---------------------------------------------------------------------------
// Variant context builders (for edge-case tests)
// ---------------------------------------------------------------------------

/** A context where the steel QCO is in DRAFT (not yet published). */
export function buildDraftContext(): RuleContext {
  const ctx = buildSeedContext();
  return {
    ...ctx,
    qcos: [
      {
        ...STEEL_QCO,
        status: "DRAFT" as const,
        effectiveFrom: null,
      },
    ],
  };
}

/**
 * A context with an old (superseded) steel QCO and a new (superseding) steel
 * QCO. The old QCO is active before `supersededAt`; the new one after.
 * Each has its own QCOItem sharing the same HS code and IS standard.
 */
export function buildSupersededContext(): RuleContext {
  const supersededAt = new Date("2023-01-01T00:00:00.000Z");
  const oldQco: QCO = {
    ...STEEL_QCO,
    id: "qco-steel-v1",
    status: "SUPERSEDED",
    supersededById: "qco-steel-v2",
    supersededAt,
    effectiveFrom: STEEL_EFFECTIVE,
  };
  const newQco: QCO = {
    ...STEEL_QCO,
    id: "qco-steel-v2",
    status: "PUBLISHED",
    supersededById: null,
    supersededAt: null,
    effectiveFrom: supersededAt,
    version: 2,
  };
  const oldItem: QCOItem = { ...E250_ITEM, qcoId: "qco-steel-v1" };
  const newItem: QCOItem = {
    ...E250_ITEM,
    id: "qcoitem-steel-e250-v2",
    qcoId: "qco-steel-v2",
  };
  const oldEc: EnforcementCircular = {
    ...STEEL_EC,
    id: "ec-steel-v1",
    qcoId: "qco-steel-v1",
  };
  const newEc: EnforcementCircular = {
    ...STEEL_EC,
    id: "ec-steel-v2",
    qcoId: "qco-steel-v2",
    effectiveDate: supersededAt,
  };
  const oldTa: TransitionalArrangement = {
    ...STEEL_TA,
    id: "ta-steel-v1",
    enforcementCircularId: "ec-steel-v1",
  };
  const newTa: TransitionalArrangement = {
    ...STEEL_TA,
    id: "ta-steel-v2",
    enforcementCircularId: "ec-steel-v2",
    effectiveFrom: supersededAt,
  };
  return {
    isStandards: ALL_IS_STANDARDS,
    qcos: [oldQco, newQco],
    qcoItems: [oldItem, newItem],
    enforcementCirculars: [oldEc, newEc],
    transitionalArrangements: [oldTa, newTa],
    exemptions: [],
  };
}

/** A context where the steel QCO is in IN_ABEYANCE (enforcement stayed). */
export function buildAbeyanceContext(): RuleContext {
  const ctx = buildSeedContext();
  return {
    ...ctx,
    qcos: [{ ...STEEL_QCO, status: "IN_ABEYANCE" as const }],
    // Add an ABEYANCE exemption as well (the design models abeyance at both levels).
    exemptions: [
      ...ctx.exemptions,
      {
        id: "ex-steel-abeyance",
        qcoId: "qco-steel-2020",
        type: "ABEYANCE",
        description: "QCO enforcement stayed by judicial order.",
        conditions: null,
        effectiveFrom: STEEL_EFFECTIVE,
        effectiveTo: null,
      },
    ],
  };
}

/**
 * A context with two QCOItems sharing the same HS code and grade (so both match
 * with high confidence) but linked to different IS standards — exercises the
 * "multiple candidate IS standards → AMBER" path.
 */
export function buildMultiCandidateContext(): RuleContext {
  const secondIs: ISStandard = {
    id: "is-5137",
    isNumber: "IS 5137",
    title: "Structural steel (alternative standard)",
  };
  const secondItem: QCOItem = {
    ...E250_ITEM,
    id: "qcoitem-steel-alt",
    productName: "Alternative structural steel",
    isStandards: [secondIs],
  };
  const ctx = buildSeedContext();
  return {
    ...ctx,
    isStandards: [...ctx.isStandards, secondIs],
    qcoItems: [...ctx.qcoItems, secondItem],
  };
}

// ---------------------------------------------------------------------------
// Sample inputs (for unit tests and the CLI demo)
// ---------------------------------------------------------------------------

/** Dates used across sample inputs. */
export const DATES = {
  beforeSteel: new Date("2020-06-01T00:00:00.000Z"),
  steelEffective: STEEL_EFFECTIVE,
  withinSteelGrace: new Date("2021-01-15T00:00:00.000Z"),
  steelGraceEnd: STEEL_GRACE_END,
  afterSteelGrace: new Date("2021-06-01T00:00:00.000Z"),
  beforeFasteners: new Date("2021-06-01T00:00:00.000Z"),
  fastenersEffective: FASTENERS_EFFECTIVE,
  withinFastenersGrace: new Date("2022-02-01T00:00:00.000Z"),
  fastenersGraceEnd: FASTENERS_GRACE_END,
  afterFastenersGrace: new Date("2022-06-01T00:00:00.000Z"),
  beforeSupersession: new Date("2021-06-01T00:00:00.000Z"),
  supersededAt: new Date("2023-01-01T00:00:00.000Z"),
  afterSupersession: new Date("2024-06-01T00:00:00.000Z"),
};

/** An input matching the E250 structural steel item with high confidence. */
export function e250Input(
  billOfLadingDate: Date,
  clearanceDate: Date = billOfLadingDate,
  overrides: Partial<EngineInput> = {},
): EngineInput {
  return {
    productType: "structural steel",
    grade: "E250",
    dimensions: "plates/sections/profiles",
    material: "carbon structural steel",
    hsCode: "7208.52",
    clearanceDate,
    billOfLadingDate,
    ...overrides,
  };
}

/** An input matching the fasteners item with high confidence. */
export function fastenerInput(
  clearanceDate: Date,
  overrides: Partial<EngineInput> = {},
): EngineInput {
  return {
    productType: "fasteners",
    grade: "Property Class 8.8",
    dimensions: "M6-M48",
    material: "carbon/alloy steel",
    hsCode: "7318.15",
    clearanceDate,
    ...overrides,
  };
}

/** An input with an HS code not covered by any QCO item (→ GREEN, no candidates). */
export function uncoveredInput(
  clearanceDate: Date = DATES.afterSteelGrace,
): EngineInput {
  return {
    hsCode: "9999.99",
    grade: "unknown",
    clearanceDate,
  };
}

/** An input whose HS matches E250 but whose grade is unknown (→ AMBER, low confidence). */
export function ambiguousSpecInput(
  billOfLadingDate: Date = DATES.afterSteelGrace,
  clearanceDate: Date = billOfLadingDate,
): EngineInput {
  return {
    grade: "UNKNOWN-GRADE",
    material: "unknown",
    hsCode: "7208.52",
    clearanceDate,
    billOfLadingDate,
  };
}

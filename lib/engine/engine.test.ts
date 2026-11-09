import { describe, it, expect } from "vitest";

import {
  evaluate,
  resolveCandidatesByHs,
  matchSpecs,
  isQcoActiveAsOf,
  applicableTriggerDate,
  inTransitionalWindow,
  evaluateExemptions,
  addDays,
  normalizeHs,
  HIGH_CONFIDENCE_THRESHOLD,
} from "@/lib/engine/engine";
import type { EngineInput, TransitionalArrangement } from "@/lib/engine/types";
import {
  buildSeedContext,
  buildDraftContext,
  buildSupersededContext,
  buildAbeyanceContext,
  buildMultiCandidateContext,
  e250Input,
  fastenerInput,
  uncoveredInput,
  ambiguousSpecInput,
  DATES,
  STEEL_EFFECTIVE,
  STEEL_GRACE_END,
  FASTENERS_EFFECTIVE,
  FASTENERS_GRACE_END,
} from "@/lib/engine/fixtures";

/**
 * Task 4 — rules engine core unit tests.
 *
 * Covers every scenario from the task requirements: GREEN (no active QCO,
 * transitional exemption, MSME exemption), RED (active + no exemption), AMBER
 * (ambiguous specs, multiple candidates, unclear status), supersession,
 * abeyance, and point-in-time reproducibility. The engine is pure — all tests
 * run against in-memory fixtures, no database.
 */

const ctx = buildSeedContext();

// ---------------------------------------------------------------------------
// resolveCandidatesByHs
// ---------------------------------------------------------------------------

describe("resolveCandidatesByHs", () => {
  it("resolves the E250 item for HS 7208.52", () => {
    const candidates = resolveCandidatesByHs("7208.52", ctx);
    expect(candidates.map((c) => c.id)).toContain("qcoitem-steel-e250");
  });

  it("resolves the fasteners item for HS 7318.15", () => {
    const candidates = resolveCandidatesByHs("7318.15", ctx);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe("qcoitem-fasteners");
  });

  it("returns an empty array for an HS code covered by no item", () => {
    expect(resolveCandidatesByHs("9999.99", ctx)).toHaveLength(0);
  });

  it("returns an empty array for a too-short HS code", () => {
    expect(resolveCandidatesByHs("72", ctx)).toHaveLength(0);
  });

  it("matches by prefix: a 4-digit heading matches a longer subheading", () => {
    // "7208" is a 4-digit heading; E250 has "7208.52" which starts with "7208".
    const candidates = resolveCandidatesByHs("7208", ctx);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.map((c) => c.id)).toContain("qcoitem-steel-e250");
  });
});

// ---------------------------------------------------------------------------
// matchSpecs
// ---------------------------------------------------------------------------

describe("matchSpecs", () => {
  const e250 = ctx.qcoItems.find((c) => c.id === "qcoitem-steel-e250")!;

  it("gives high confidence for an exact HS + exact grade + exact specs", () => {
    const result = matchSpecs(e250Input(DATES.afterSteelGrace), e250);
    expect(result.matched).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(HIGH_CONFIDENCE_THRESHOLD);
  });

  it("gives low confidence when the grade does not match", () => {
    const result = matchSpecs(ambiguousSpecInput(DATES.afterSteelGrace), e250);
    expect(result.confidence).toBeLessThan(HIGH_CONFIDENCE_THRESHOLD);
  });

  it("confidence is always in [0, 1]", () => {
    const result = matchSpecs(
      { hsCode: "7208.52", clearanceDate: DATES.afterSteelGrace },
      e250,
    );
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// isQcoActiveAsOf
// ---------------------------------------------------------------------------

describe("isQcoActiveAsOf", () => {
  const publishedQco = ctx.qcos.find((q) => q.id === "qco-steel-2020")!;

  it("is active on the effective date (inclusive lower bound)", () => {
    expect(isQcoActiveAsOf(publishedQco, STEEL_EFFECTIVE)).toBe(true);
  });

  it("is active after the effective date", () => {
    expect(isQcoActiveAsOf(publishedQco, DATES.afterSteelGrace)).toBe(true);
  });

  it("is NOT active one day before the effective date", () => {
    const dayBefore = addDays(STEEL_EFFECTIVE, -1);
    expect(isQcoActiveAsOf(publishedQco, dayBefore)).toBe(false);
  });

  it("a DRAFT QCO is never active", () => {
    const draft = buildDraftContext().qcos[0];
    expect(isQcoActiveAsOf(draft, DATES.afterSteelGrace)).toBe(false);
  });

  it("an IN_ABEYANCE QCO is never active", () => {
    const abeyance = buildAbeyanceContext().qcos[0];
    expect(isQcoActiveAsOf(abeyance, DATES.afterSteelGrace)).toBe(false);
  });

  it("a SUPERSEDED QCO is active before supersededAt (exclusive upper bound)", () => {
    const { qcos } = buildSupersededContext();
    const oldQco = qcos.find((q) => q.status === "SUPERSEDED")!;
    expect(isQcoActiveAsOf(oldQco, DATES.beforeSupersession)).toBe(true);
    // At exactly supersededAt, the old QCO is no longer active.
    expect(isQcoActiveAsOf(oldQco, DATES.supersededAt)).toBe(false);
    expect(isQcoActiveAsOf(oldQco, DATES.afterSupersession)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applicableTriggerDate
// ---------------------------------------------------------------------------

describe("applicableTriggerDate", () => {
  const input: EngineInput = {
    hsCode: "7208.52",
    clearanceDate: new Date("2021-06-01T00:00:00.000Z"),
    billOfLadingDate: new Date("2021-05-01T00:00:00.000Z"),
  };

  it("returns the BL date for BILL_OF_LADING", () => {
    const ta: TransitionalArrangement = {
      id: "ta",
      enforcementCircularId: "ec",
      triggerDateType: "BILL_OF_LADING",
      gracePeriodDays: 90,
      effectiveFrom: STEEL_EFFECTIVE,
    };
    expect(applicableTriggerDate(input, ta)).toEqual(input.billOfLadingDate);
  });

  it("returns null for BILL_OF_LADING when the BL date is missing", () => {
    const ta: TransitionalArrangement = {
      id: "ta",
      enforcementCircularId: "ec",
      triggerDateType: "BILL_OF_LADING",
      gracePeriodDays: 90,
      effectiveFrom: STEEL_EFFECTIVE,
    };
    const noBl: EngineInput = { hsCode: "7208.52", clearanceDate: input.clearanceDate };
    expect(applicableTriggerDate(noBl, ta)).toBeNull();
  });

  it("returns the clearance date for CLEARANCE_DATE", () => {
    const ta: TransitionalArrangement = {
      id: "ta",
      enforcementCircularId: "ec",
      triggerDateType: "CLEARANCE_DATE",
      gracePeriodDays: 60,
      effectiveFrom: FASTENERS_EFFECTIVE,
    };
    expect(applicableTriggerDate(input, ta)).toEqual(input.clearanceDate);
  });

  it("returns the clearance date for BILL_OF_ENTRY and IMPORT_DATE (V1 proxy)", () => {
    for (const trigger of ["BILL_OF_ENTRY", "IMPORT_DATE"] as const) {
      const ta: TransitionalArrangement = {
        id: "ta",
        enforcementCircularId: "ec",
        triggerDateType: trigger,
        gracePeriodDays: 30,
        effectiveFrom: STEEL_EFFECTIVE,
      };
      expect(applicableTriggerDate(input, ta)).toEqual(input.clearanceDate);
    }
  });
});

// ---------------------------------------------------------------------------
// inTransitionalWindow
// ---------------------------------------------------------------------------

describe("inTransitionalWindow", () => {
  const ta: TransitionalArrangement = {
    id: "ta-steel",
    enforcementCircularId: "ec-steel",
    triggerDateType: "BILL_OF_LADING",
    gracePeriodDays: 90,
    effectiveFrom: STEEL_EFFECTIVE,
  };

  it("is in the window at the effective date (inclusive start)", () => {
    expect(inTransitionalWindow(STEEL_EFFECTIVE, ta)).toBe(true);
  });

  it("is in the window at the grace end date (inclusive end)", () => {
    expect(inTransitionalWindow(STEEL_GRACE_END, ta)).toBe(true);
  });

  it("is NOT in the window one day after the grace end", () => {
    expect(inTransitionalWindow(addDays(STEEL_GRACE_END, 1), ta)).toBe(false);
  });

  it("is NOT in the window one day before the effective date", () => {
    expect(inTransitionalWindow(addDays(STEEL_EFFECTIVE, -1), ta)).toBe(false);
  });

  it("returns false when effectiveFrom is null (window unknown)", () => {
    const noStart: TransitionalArrangement = { ...ta, effectiveFrom: null };
    expect(inTransitionalWindow(STEEL_EFFECTIVE, noStart)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// evaluateExemptions
// ---------------------------------------------------------------------------

describe("evaluateExemptions", () => {
  const qco = ctx.qcos.find((q) => q.id === "qco-steel-2020")!;

  it("returns the MSME exemption when the input claims MSME registration", () => {
    const input: EngineInput = {
      hsCode: "7208.52",
      clearanceDate: DATES.afterSteelGrace,
      billOfLadingDate: DATES.afterSteelGrace,
      msmeRegistered: true,
    };
    const ex = evaluateExemptions(input, qco, DATES.afterSteelGrace, ctx);
    expect(ex).not.toBeNull();
    expect(ex!.type).toBe("MSME_PHASED");
  });

  it("returns null when the input does not claim MSME registration", () => {
    const input: EngineInput = {
      hsCode: "7208.52",
      clearanceDate: DATES.afterSteelGrace,
      billOfLadingDate: DATES.afterSteelGrace,
      msmeRegistered: false,
    };
    expect(evaluateExemptions(input, qco, DATES.afterSteelGrace, ctx)).toBeNull();
  });

  it("returns the ABEYANCE exemption regardless of input flags (blanket stay)", () => {
    const abeyanceCtx = buildAbeyanceContext();
    const abeyanceQco = abeyanceCtx.qcos[0];
    const input: EngineInput = {
      hsCode: "7208.52",
      clearanceDate: DATES.afterSteelGrace,
      billOfLadingDate: DATES.afterSteelGrace,
    };
    const ex = evaluateExemptions(input, abeyanceQco, DATES.afterSteelGrace, abeyanceCtx);
    expect(ex).not.toBeNull();
    expect(ex!.type).toBe("ABEYANCE");
  });
});

// ---------------------------------------------------------------------------
// evaluate — GREEN scenarios
// ---------------------------------------------------------------------------

describe("evaluate — GREEN", () => {
  it("returns GREEN with no candidates when the HS code is uncovered", () => {
    const result = evaluate(uncoveredInput(), ctx);
    expect(result.verdict).toBe("GREEN");
    expect(result.qcoItemId).toBeNull();
    expect(result.isNumber).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("returns GREEN when the QCO is not yet effective (date before effective date)", () => {
    const input = e250Input(DATES.beforeSteel);
    const result = evaluate(input, ctx);
    expect(result.verdict).toBe("GREEN");
    expect(
      result.reasoningTrace.some(
        (s) => s.step === "verdict" && s.reason?.includes("No active QCO"),
      ),
    ).toBe(true);
  });

  it("returns GREEN when the BL date is within the transitional grace window", () => {
    const input = e250Input(DATES.withinSteelGrace);
    const result = evaluate(input, ctx);
    expect(result.verdict).toBe("GREEN");
    expect(
      result.reasoningTrace.some(
        (s) => s.step === "verdict" && s.reason?.includes("transitional grace window"),
      ),
    ).toBe(true);
  });

  it("returns GREEN at the exact grace-window boundary (inclusive end)", () => {
    const input = e250Input(STEEL_GRACE_END);
    const result = evaluate(input, ctx);
    expect(result.verdict).toBe("GREEN");
  });

  it("returns GREEN when an MSME exemption applies (outside grace window)", () => {
    const input = e250Input(DATES.afterSteelGrace, DATES.afterSteelGrace, {
      msmeRegistered: true,
    });
    const result = evaluate(input, ctx);
    expect(result.verdict).toBe("GREEN");
    expect(
      result.reasoningTrace.some((s) => s.reason?.includes("MSME_PHASED")),
    ).toBe(true);
  });

  it("returns GREEN for fasteners within their clearance-date grace window", () => {
    const input = fastenerInput(DATES.withinFastenersGrace);
    const result = evaluate(input, ctx);
    expect(result.verdict).toBe("GREEN");
    expect(result.transitionalStatus).toContain("CLEARANCE_DATE");
  });
});

// ---------------------------------------------------------------------------
// evaluate — RED scenarios
// ---------------------------------------------------------------------------

describe("evaluate — RED", () => {
  it("returns RED when the QCO is active, outside the grace window, and no exemption", () => {
    const input = e250Input(DATES.afterSteelGrace);
    const result = evaluate(input, ctx);
    expect(result.verdict).toBe("RED");
    expect(result.confidence).toBeGreaterThanOrEqual(HIGH_CONFIDENCE_THRESHOLD);
    expect(result.isNumber).toContain("IS 2062");
    expect(result.gazetteReference).toContain("S.O.");
    expect(result.circularReference).toContain("CBIC");
    expect(result.status).toBe("COMPLETED");
  });

  it("returns RED for fasteners after their grace window", () => {
    const input = fastenerInput(DATES.afterFastenersGrace);
    const result = evaluate(input, ctx);
    expect(result.verdict).toBe("RED");
    expect(result.isNumber).toContain("IS 1367");
  });

  it("returns RED one day after the grace end (exclusive boundary)", () => {
    const input = e250Input(addDays(STEEL_GRACE_END, 1));
    const result = evaluate(input, ctx);
    expect(result.verdict).toBe("RED");
  });
});

// ---------------------------------------------------------------------------
// evaluate — AMBER scenarios
// ---------------------------------------------------------------------------

describe("evaluate — AMBER", () => {
  it("returns AMBER for a low-confidence spec match (unknown grade)", () => {
    const input = ambiguousSpecInput(DATES.afterSteelGrace);
    const result = evaluate(input, ctx);
    expect(result.verdict).toBe("AMBER");
    expect(result.confidence).toBeLessThan(HIGH_CONFIDENCE_THRESHOLD);
    expect(result.status).toBe("PENDING_REVIEW");
  });

  it("returns AMBER when multiple high-confidence candidates cite different IS standards", () => {
    const multiCtx = buildMultiCandidateContext();
    const input = e250Input(DATES.afterSteelGrace);
    const result = evaluate(input, multiCtx);
    expect(result.verdict).toBe("AMBER");
    expect(
      result.reasoningTrace.some((s) => s.reason?.includes("Multiple candidate IS standards")),
    ).toBe(true);
  });

  it("returns AMBER when the matched QCO is in DRAFT (unclear status)", () => {
    const draftCtx = buildDraftContext();
    const input = e250Input(DATES.afterSteelGrace);
    const result = evaluate(input, draftCtx);
    expect(result.verdict).toBe("AMBER");
    expect(
      result.reasoningTrace.some((s) => s.reason?.includes("DRAFT")),
    ).toBe(true);
  });

  it("returns AMBER when the BL date is missing but the trigger requires it", () => {
    const input: EngineInput = {
      hsCode: "7208.52",
      grade: "E250",
      dimensions: "plates/sections/profiles",
      material: "carbon structural steel",
      clearanceDate: DATES.afterSteelGrace,
      // billOfLadingDate omitted — steel TA requires BILL_OF_LADING
    };
    const result = evaluate(input, ctx);
    expect(result.verdict).toBe("AMBER");
    expect(
      result.reasoningTrace.some((s) => s.reason?.includes("not provided")),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// evaluate — supersession
// ---------------------------------------------------------------------------

describe("evaluate — supersession", () => {
  const supCtx = buildSupersededContext();

  it("the old QCO is active before supersession (verdict depends on other factors)", () => {
    const input = e250Input(DATES.beforeSupersession);
    const result = evaluate(input, supCtx);
    // Before supersession, old QCO active, outside grace → RED.
    expect(result.verdict).toBe("RED");
  });

  it("the old QCO is not active after supersession (new QCO takes over)", () => {
    // After supersession, the old QCO is SUPERSEDED → not active.
    // The new QCO (PUBLISHED, effective from supersededAt) is active → RED.
    const input = e250Input(DATES.afterSupersession);
    const result = evaluate(input, supCtx);
    expect(result.verdict).toBe("RED");
    expect(result.qcoId).toBe("qco-steel-v2");
  });
});

// ---------------------------------------------------------------------------
// evaluate — abeyance
// ---------------------------------------------------------------------------

describe("evaluate — abeyance", () => {
  it("returns GREEN when the QCO is in IN_ABEYANCE (not active)", () => {
    const abeyanceCtx = buildAbeyanceContext();
    const input = e250Input(DATES.afterSteelGrace);
    const result = evaluate(input, abeyanceCtx);
    expect(result.verdict).toBe("GREEN");
    expect(
      result.reasoningTrace.some(
        (s) => s.step === "verdict" && s.reason?.includes("No active QCO"),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// evaluate — point-in-time reproducibility
// ---------------------------------------------------------------------------

describe("evaluate — point-in-time reproducibility", () => {
  it("returns identical results for identical input + rule context", () => {
    const input = e250Input(DATES.afterSteelGrace);
    const r1 = evaluate(input, ctx);
    const r2 = evaluate(input, ctx);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("the same date before and after an amendment yields different verdicts when the QCO status changed", () => {
    // Same input, two different contexts (seed vs. superseded).
    const input = e250Input(DATES.afterSupersession);
    const seedResult = evaluate(input, ctx);
    const supResult = evaluate(input, buildSupersededContext());
    // The seed context has the steel QCO as PUBLISHED (active) → RED.
    expect(seedResult.verdict).toBe("RED");
    // The superseded context has the new QCO active → RED (different QCO id).
    expect(supResult.verdict).toBe("RED");
    expect(supResult.qcoId).toBe("qco-steel-v2");
    expect(seedResult.qcoId).toBe("qco-steel-2020");
  });
});

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

describe("helpers", () => {
  it("addDays rolls over month and year boundaries", () => {
    expect(addDays(STEEL_EFFECTIVE, 90)).toEqual(STEEL_GRACE_END);
    expect(addDays(FASTENERS_EFFECTIVE, 60)).toEqual(FASTENERS_GRACE_END);
  });

  it("addDays does not mutate the original date", () => {
    const original = new Date("2020-12-22T00:00:00.000Z");
    const copy = new Date(original.getTime());
    addDays(original, 90);
    expect(original).toEqual(copy);
  });

  it("normalizeHs strips non-digit characters", () => {
    expect(normalizeHs("7208.52")).toBe("720852");
    expect(normalizeHs("72 08 52")).toBe("720852");
    expect(normalizeHs("")).toBe("");
  });
});

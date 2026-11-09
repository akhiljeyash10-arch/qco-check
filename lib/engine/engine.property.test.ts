import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { evaluate, addDays, HIGH_CONFIDENCE_THRESHOLD } from "@/lib/engine/engine";
import type { EngineInput, QcoStatus, RuleContext } from "@/lib/engine/types";
import {
  buildSeedContext,
  e250Input,
  STEEL_EFFECTIVE,
} from "@/lib/engine/fixtures";

/**
 * Task 4 — rules engine property-based tests (Vitest + fast-check).
 *
 * Each `it` block validates one of the required engine invariants from the
 * task spec and design.md. Generators are constrained to the input space
 * (valid HS codes, realistic dates, optional spec fields) so the properties
 * exercise meaningful inputs rather than degenerate noise.
 */

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const BASE_DATE = new Date("2019-01-01T00:00:00.000Z");

/** A date as a day offset from the base date (UTC midnight — no timezone noise). */
const arbDate = fc
  .integer({ min: 0, max: 2500 })
  .map((n) => new Date(BASE_DATE.getTime() + n * DAY_MS));

/** A 6-digit numeric HS code string (e.g. "720852"). */
const arbRandomHs = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 6, maxLength: 6 })
  .map((digits) => digits.join(""));

/** HS codes: seed-item codes (matching), non-matching codes, and random codes. */
const arbHsCode = fc.oneof(
  fc.constantFrom(
    "7208.52", "7228.30", "7208.90", "7211.13",
    "7225.11", "7225.19", "7318.15", "7318.16", "7318.24",
  ),
  fc.constantFrom("9999.99", "1234.56", "5555.55", "0000.00"),
  arbRandomHs,
);

/** A fully-formed engine input with optional spec fields. */
const arbInput: fc.Arbitrary<EngineInput> = fc.record({
  hsCode: arbHsCode,
  grade: fc.oneof(fc.constant(undefined), fc.string({ minLength: 1, maxLength: 20 })),
  dimensions: fc.oneof(fc.constant(undefined), fc.string({ minLength: 1, maxLength: 20 })),
  material: fc.oneof(fc.constant(undefined), fc.string({ minLength: 1, maxLength: 20 })),
  clearanceDate: arbDate,
  billOfLadingDate: fc.oneof(fc.constant(undefined), arbDate),
  msmeRegistered: fc.oneof(fc.constant(undefined), fc.boolean()),
});

/** A context where every QCO is inactive (no active QCO as of any input date). */
const arbInactiveContext: fc.Arbitrary<RuleContext> = fc
  .constantFrom<QcoStatus | "FUTURE">("DRAFT", "IN_ABEYANCE", "FUTURE")
  .map((mode) => {
    const c = buildSeedContext();
    return {
      ...c,
      qcos: c.qcos.map((q) => {
        if (mode === "DRAFT") return { ...q, status: "DRAFT" as const, effectiveFrom: null };
        if (mode === "IN_ABEYANCE") return { ...q, status: "IN_ABEYANCE" as const };
        return {
          ...q,
          status: "PUBLISHED" as const,
          effectiveFrom: new Date("2030-01-01T00:00:00.000Z"),
        };
      }),
    };
  });

// ---------------------------------------------------------------------------
// Property 1: Determinism
// ---------------------------------------------------------------------------

describe("property — determinism", () => {
  // **Validates: Requirements §10** — the determination path is deterministic.
  it("evaluate(input, ctx) is identical across repeated calls with identical input + rule context", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const ctx = buildSeedContext();
        const r1 = evaluate(input, ctx);
        const r2 = evaluate(input, ctx);
        // Deep equality via JSON — the engine is pure so outputs must be bit-identical.
        expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: No-active-QCO implies never RED
// ---------------------------------------------------------------------------

describe("property — no active QCO", () => {
  // **Validates: Requirements §9** — engine invariants hold for arbitrary inputs.
  it("when no QCO is active as of the applicable date, the verdict is never RED", () => {
    fc.assert(
      fc.property(arbInactiveContext, arbInput, (ctx, input) => {
        const result = evaluate(input, ctx);
        expect(result.verdict).not.toBe("RED");
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Confidence ∈ [0, 1]
// ---------------------------------------------------------------------------

describe("property — confidence bounds", () => {
  // **Validates: Requirements §9** — confidence is always a valid score.
  it("confidence is always in [0, 1] for all inputs", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const result = evaluate(input, buildSeedContext());
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Transitional window monotonicity
// ---------------------------------------------------------------------------

describe("property — transitional window monotonicity", () => {
  // **Validates: Requirements §9** — BL date within the grace window → never RED.
  it("a BL date within the transitional grace window never yields RED", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 90 }), (n) => {
        const blDate = addDays(STEEL_EFFECTIVE, n);
        const input = e250Input(blDate); // high-confidence match, no MSME flag
        const result = evaluate(input, buildSeedContext());
        expect(result.verdict).not.toBe("RED");
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Amber safety
// ---------------------------------------------------------------------------

describe("property — amber safety", () => {
  // **Validates: Requirements §9** — low-confidence inputs never return RED.
  it("a RED verdict always requires high confidence (low-confidence → never RED)", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const result = evaluate(input, buildSeedContext());
        // If the verdict is RED, the confidence must be >= threshold.
        // Equivalently: low confidence implies verdict !== RED.
        expect(
          result.verdict !== "RED" ||
            result.confidence >= HIGH_CONFIDENCE_THRESHOLD,
        ).toBe(true);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Boundary correctness
// ---------------------------------------------------------------------------

describe("property — boundary correctness", () => {
  // **Validates: Requirements §9** — dates at effective-date / grace-window
  // edges behave per the defined inclusive/exclusive semantics.
  //
  // Semantics under test:
  //   - Effective date is an inclusive lower bound: BL date == effectiveFrom →
  //     QCO is active.
  //   - Grace window is inclusive both ends: [effectiveFrom, effectiveFrom + 90].
  //   - One day before effectiveFrom → QCO not active → GREEN.
  //   - One day after grace end → outside window → RED (active + no exemption).
  it("dates at the effective-date and grace-window edges produce the defined verdict", () => {
    fc.assert(
      fc.property(fc.integer({ min: -5, max: 95 }), (n) => {
        const blDate = addDays(STEEL_EFFECTIVE, n);
        const input = e250Input(blDate); // high-confidence, no exemption
        const result = evaluate(input, buildSeedContext());
        // n <= 90 → GREEN (not active for n<0, or in grace window for 0<=n<=90)
        // n > 90 → RED (active, outside window, no exemption)
        const expected = n <= 90 ? "GREEN" : "RED";
        expect(result.verdict).toBe(expected);
      }),
    );
  });

  it("the effective date is an inclusive lower bound (QCO active at exactly effectiveFrom)", () => {
    // At n=0 the QCO is active AND the BL date is in the grace window → GREEN.
    const result = evaluate(e250Input(STEEL_EFFECTIVE), buildSeedContext());
    expect(result.verdict).toBe("GREEN");
  });

  it("one day before the effective date means the QCO is not yet active", () => {
    const result = evaluate(
      e250Input(addDays(STEEL_EFFECTIVE, -1)),
      buildSeedContext(),
    );
    expect(result.verdict).toBe("GREEN");
  });

  it("the grace-window end is inclusive (in window at exactly effectiveFrom + grace)", () => {
    const graceEnd = addDays(STEEL_EFFECTIVE, 90);
    const result = evaluate(e250Input(graceEnd), buildSeedContext());
    expect(result.verdict).toBe("GREEN");
  });

  it("one day after the grace-window end is outside the window (RED)", () => {
    const afterGrace = addDays(STEEL_EFFECTIVE, 91);
    const result = evaluate(e250Input(afterGrace), buildSeedContext());
    expect(result.verdict).toBe("RED");
  });
});

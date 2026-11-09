import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { evaluate } from "@/lib/engine/engine";
import { serializeContext } from "@/lib/rule-loader";
import { deserializeContext } from "@/lib/check/reproducibility";
import type { EngineInput, RuleContext } from "@/lib/engine/types";
import {
  buildSeedContext,
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
} from "@/lib/engine/fixtures";

/**
 * Task 10 — Reproducibility property-based test (Vitest + fast-check).
 *
 * **Validates: Requirements §4 (point-in-time reproducible) and §9
 * (determinations reproducible against snapshotted rule versions).**
 *
 * The invariant: re-running `evaluate` against a determination's
 * `ruleVersionSnapshot` (the JSON-serialised rule context) yields the identical
 * verdict as running it against the original live context. This is the legal-
 * defensibility guarantee — a determination made today stays reproducible after
 * future amendments because it carries the exact rule versions it was decided
 * against.
 *
 * The snapshot is produced by `serializeContext` (Date → ISO string, the same
 * transform that stores `Determination.ruleVersionSnapshot`) and re-hydrated by
 * `deserializeContext` (ISO string → Date), so this property exercises the exact
 * round-trip a real determination undergoes.
 */

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const BASE_DATE = new Date("2019-01-01T00:00:00.000Z");

const arbDate = fc
  .integer({ min: 0, max: 2500 })
  .map((n) => new Date(BASE_DATE.getTime() + n * DAY_MS));

const arbRandomHs = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 6, maxLength: 6 })
  .map((digits) => digits.join(""));

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

/** The contexts the engine can be evaluated against (every engine branch). */
const contexts: { name: string; ctx: RuleContext }[] = [
  { name: "seed", ctx: buildSeedContext() },
  { name: "superseded", ctx: buildSupersededContext() },
  { name: "abeyance", ctx: buildAbeyanceContext() },
  { name: "multi-candidate", ctx: buildMultiCandidateContext() },
];

// ---------------------------------------------------------------------------
// Property: reproducibility
// ---------------------------------------------------------------------------

describe("property — reproducibility", () => {
  for (const { name, ctx } of contexts) {
    it(`re-running evaluate against the ${name} context's snapshot yields the identical verdict`, () => {
      fc.assert(
        fc.property(arbInput, (input) => {
          const original = evaluate(input, ctx);
          const snapshot = serializeContext(ctx);
          const restored = deserializeContext(snapshot);
          const reproduced = evaluate(input, restored);

          // **Validates: Requirements §9** — the verdict, confidence, and the
          // curated references (IS number, Gazette ref, QCO/circular ids) must
          // survive the snapshot round-trip unchanged.
          expect(reproduced.verdict).toBe(original.verdict);
          expect(reproduced.confidence).toBe(original.confidence);
          expect(reproduced.isNumber).toBe(original.isNumber);
          expect(reproduced.gazetteReference).toBe(original.gazetteReference);
          expect(reproduced.qcoItemId).toBe(original.qcoItemId);
          expect(reproduced.qcoId).toBe(original.qcoId);
          expect(reproduced.enforcementCircularId).toBe(
            original.enforcementCircularId,
          );
        }),
      );
    });
  }

  it("the snapshot round-trip is verdict-preserving for representative boundary inputs", () => {
    const ctx = buildSeedContext();
    const cases: EngineInput[] = [
      e250Input(STEEL_EFFECTIVE, DATES.afterSteelGrace), // in grace → GREEN
      e250Input(STEEL_GRACE_END, DATES.afterSteelGrace), // grace edge → GREEN
      e250Input(addDaysToDate(STEEL_GRACE_END, 1), DATES.afterSteelGrace), // outside → RED
      fastenerInput(FASTENERS_EFFECTIVE), // fastener in grace → GREEN
      fastenerInput(DATES.afterFastenersGrace), // fastener outside → RED
      uncoveredInput(), // no candidates → GREEN
      ambiguousSpecInput(DATES.afterSteelGrace, DATES.afterSteelGrace), // AMBER
    ];
    for (const input of cases) {
      const original = evaluate(input, ctx);
      const restored = deserializeContext(serializeContext(ctx));
      const reproduced = evaluate(input, restored);
      expect(reproduced.verdict).toBe(original.verdict);
    }
  });
});

/** Small local helper to avoid pulling addDays into a second import site. */
function addDaysToDate(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

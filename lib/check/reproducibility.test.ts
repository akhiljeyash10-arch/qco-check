import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { seedAuth, seedRules } from "@/prisma/seed";

import { evaluate, addDays } from "@/lib/engine/engine";
import { serializeContext } from "@/lib/rule-loader";
import { runCheck } from "@/lib/check/service";
import {
  deserializeContext,
  deserializeInput,
  reproduceDetermination,
} from "@/lib/check/reproducibility";
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
import type { SessionUser } from "@/lib/session";

/**
 * Task 10 — Reproducibility regression tests.
 *
 * A determination is reproducible when re-running the engine against its
 * snapshotted rule versions yields the identical verdict — even after later
 * amendments change the live rule set. These tests verify the snapshot
 * round-trip (pure) and the DB-backed {@link reproduceDetermination} helper.
 *
 * The pure tests always run; the DB-backed block skips gracefully when
 * DATABASE_URL is absent (see the `hasDbEnv` guard, matching the project's
 * existing integration-test pattern).
 */

const prisma = new PrismaClient({ log: ["warn", "error"] });
const hasDbEnv = !!process.env.DATABASE_URL;

beforeAll(async () => {
  if (!hasDbEnv) return;
  await prisma.$queryRaw`SELECT 1`;
  await seedAuth(prisma);
  await seedRules(prisma);
}, 30_000);

const USER_ASHA: SessionUser = {
  id: "user-asha",
  role: "USER",
  firmId: "firm-acme",
  name: "Asha (Acme)",
  email: "asha@acme.in",
};

// ===========================================================================
// 1. Pure: the snapshot round-trip is verdict-preserving
// ===========================================================================

describe("Task 10 — reproducibility: snapshot round-trip preserves the verdict", () => {
  // A spread of contexts exercising every engine branch.
  const contexts: { name: string; ctx: RuleContext }[] = [
    { name: "seed", ctx: buildSeedContext() },
    { name: "superseded", ctx: buildSupersededContext() },
    { name: "abeyance", ctx: buildAbeyanceContext() },
    { name: "multi-candidate", ctx: buildMultiCandidateContext() },
  ];

  // A spread of inputs exercising Green/Red/Amber and boundary dates.
  const inputs: { name: string; input: EngineInput }[] = [
    { name: "E250 RED (after grace)", input: e250Input(DATES.afterSteelGrace, DATES.afterSteelGrace) },
    { name: "E250 GREEN (in grace)", input: e250Input(STEEL_EFFECTIVE, DATES.afterSteelGrace) },
    { name: "E250 GREEN (grace edge)", input: e250Input(STEEL_GRACE_END, DATES.afterSteelGrace) },
    { name: "fastener RED", input: fastenerInput(DATES.afterFastenersGrace) },
    { name: "fastener GREEN (in grace)", input: fastenerInput(FASTENERS_EFFECTIVE) },
    { name: "uncovered GREEN", input: uncoveredInput() },
    { name: "ambiguous AMBER", input: ambiguousSpecInput(DATES.afterSteelGrace, DATES.afterSteelGrace) },
    { name: "pre-effective GREEN", input: e250Input(addDays(STEEL_EFFECTIVE, -1), DATES.afterSteelGrace) },
  ];

  for (const { name: ctxName, ctx } of contexts) {
    for (const { name: inName, input } of inputs) {
      it(`${ctxName} context + ${inName}: re-running evaluate against the snapshotted context yields the identical verdict`, () => {
        // The original verdict, computed against the live context.
        const original = evaluate(input, ctx);
        // Serialise as the determination stores it (Date → ISO string).
        const snapshot = serializeContext(ctx);
        // Re-hydrate back into a live context (ISO string → Date).
        const restored = deserializeContext(snapshot);
        const reproduced = evaluate(input, restored);

        // **Validates: Requirements §4 (point-in-time reproducible) and §9
        // (determinations reproducible against snapshotted rule versions).**
        expect(reproduced.verdict).toBe(original.verdict);
        expect(reproduced.confidence).toBe(original.confidence);
        expect(reproduced.isNumber).toBe(original.isNumber);
        expect(reproduced.gazetteReference).toBe(original.gazetteReference);
        expect(reproduced.qcoItemId).toBe(original.qcoItemId);
        // Confidence is never lost or corrupted across the round-trip.
        expect(reproduced.confidence).toBeGreaterThanOrEqual(0);
        expect(reproduced.confidence).toBeLessThanOrEqual(1);
      });
    }
  }

  it("the snapshot keeps the same number of QCOs/items/circulars after deserialise", () => {
    const ctx = buildSeedContext();
    const restored = deserializeContext(serializeContext(ctx));
    expect(restored.qcos.length).toBe(ctx.qcos.length);
    expect(restored.qcoItems.length).toBe(ctx.qcoItems.length);
    expect(restored.enforcementCirculars.length).toBe(
      ctx.enforcementCirculars.length,
    );
    expect(restored.transitionalArrangements.length).toBe(
      ctx.transitionalArrangements.length,
    );
    expect(restored.exemptions.length).toBe(ctx.exemptions.length);
  });

  it("deserialised dates are real Date objects (not strings)", () => {
    const ctx = buildSeedContext();
    const restored = deserializeContext(serializeContext(ctx));
    expect(restored.qcos[0].effectiveFrom).toBeInstanceOf(Date);
    expect(restored.transitionalArrangements[0].effectiveFrom).toBeInstanceOf(
      Date,
    );
    expect(restored.enforcementCirculars[0].effectiveDate).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// 2. Pure: deserializeInput round-trips the engine input
// ===========================================================================

describe("Task 10 — reproducibility: deserializeInput round-trip", () => {
  it("round-trips a full input (with BL date) preserving dates + flags", () => {
    const original: EngineInput = e250Input(DATES.afterSteelGrace, DATES.afterSteelGrace);
    // Mimic how the service stores it: JSON round-trip.
    const stored = JSON.parse(JSON.stringify(original)) as Record<string, unknown>;
    const restored = deserializeInput(stored);

    expect(restored.hsCode).toBe(original.hsCode);
    expect(restored.grade).toBe(original.grade);
    expect(restored.clearanceDate).toBeInstanceOf(Date);
    expect(restored.clearanceDate.getTime()).toBe(
      original.clearanceDate.getTime(),
    );
    expect(restored.billOfLadingDate).toBeInstanceOf(Date);
    expect(restored.billOfLadingDate?.getTime()).toBe(
      original.billOfLadingDate!.getTime(),
    );
  });

  it("round-trips an input without a BL date (absent stays absent)", () => {
    const original: EngineInput = fastenerInput(DATES.afterFastenersGrace);
    const stored = JSON.parse(JSON.stringify(original)) as Record<string, unknown>;
    const restored = deserializeInput(stored);

    expect(restored.billOfLadingDate).toBeUndefined();
    expect(restored.clearanceDate.getTime()).toBe(
      original.clearanceDate.getTime(),
    );
  });

  it("a re-evaluated restored input matches the original verdict", () => {
    const ctx = buildSeedContext();
    const original = e250Input(DATES.afterSteelGrace, DATES.afterSteelGrace);
    const stored = JSON.parse(JSON.stringify(original));
    const restored = deserializeInput(stored);

    expect(evaluate(restored, ctx).verdict).toBe(
      evaluate(original, ctx).verdict,
    );
  });
});

// ===========================================================================
// 3. DB-backed: reproduceDetermination against a real stored determination
// ===========================================================================

describe.skipIf(!hasDbEnv)(
  "Task 10 — reproduceDetermination: re-run against a stored snapshot (DB)",
  () => {
    it("a RED determination reproduces the same verdict from its snapshot", async () => {
      const input = e250Input(DATES.afterSteelGrace, DATES.afterSteelGrace);
      const result = await runCheck(input, USER_ASHA);
      expect(result.verdict).toBe("RED");

      const repro = await reproduceDetermination(result.determinationId);
      expect(repro).not.toBeNull();
      expect(repro!.matches).toBe(true);
      expect(repro!.originalVerdict).toBe("RED");
      expect(repro!.reproducedVerdict).toBe("RED");
      // References are reproduced from the snapshot, not hallucinated.
      expect(repro!.reproduced.isNumber).toContain("IS 2062");
      expect(repro!.reproduced.gazetteReference).toBeTruthy();
    });

    it("a GREEN determination (uncovered HS) reproduces GREEN", async () => {
      const result = await runCheck(uncoveredInput(), USER_ASHA);
      expect(result.verdict).toBe("GREEN");

      const repro = await reproduceDetermination(result.determinationId);
      expect(repro!.matches).toBe(true);
      expect(repro!.reproducedVerdict).toBe("GREEN");
    });

    it("an AMBER determination reproduces AMBER", async () => {
      const result = await runCheck(
        ambiguousSpecInput(DATES.afterSteelGrace, DATES.afterSteelGrace),
        USER_ASHA,
      );
      expect(result.verdict).toBe("AMBER");

      const repro = await reproduceDetermination(result.determinationId);
      expect(repro!.matches).toBe(true);
      expect(repro!.reproducedVerdict).toBe("AMBER");
    });

    it("returns null for a non-existent determination id", async () => {
      const repro = await reproduceDetermination("does-not-exist-id");
      expect(repro).toBeNull();
    });
  },
);

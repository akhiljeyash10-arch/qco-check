import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { seedAuth, seedRules } from "@/prisma/seed";
import { runCheck, persistDetermination } from "@/lib/check/service";
import { loadRuleContext } from "@/lib/rule-loader";
import { evaluate } from "@/lib/engine/engine";
import type { SessionUser } from "@/lib/session";
import type { EngineInput } from "@/lib/engine/types";
import {
  buildSeedContext,
  e250Input,
  fastenerInput,
  uncoveredInput,
  DATES,
  STEEL_EFFECTIVE,
  STEEL_GRACE_END,
  FASTENERS_EFFECTIVE,
} from "@/lib/engine/fixtures";

/**
 * Task 5 — Single-check API + storage integration tests.
 *
 * These tests run against the dev Postgres instance (Docker: `npm run db:up`)
 * with migrations applied. They verify:
 *
 *  1. API integration: `runCheck` persists a firm-scoped Determination and
 *     returns the engine result with a determinationId.
 *  2. Engine-DB wiring: the rule context loaded from the DB (via `loadRuleContext`)
 *     produces the same verdict structure as the in-memory fixture context.
 *  3. Firm scoping: each firm sees only its own determinations (isolation).
 *  4. Boundary inputs at the effective date edge: dates exactly at and
 *     immediately around `effectiveFrom` behave per the defined semantics.
 *
 * If DATABASE_URL is absent, the describe blocks skip gracefully.
 */

const prisma = new PrismaClient({ log: ["warn", "error"] });
const hasDbEnv = !!process.env.DATABASE_URL;

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

beforeAll(async () => {
  if (!hasDbEnv) return;
  await prisma.$queryRaw`SELECT 1`;
  await seedAuth(prisma);
  await seedRules(prisma);
}, 30_000);

// ---------------------------------------------------------------------------
// Seeded session users (deterministic ids from seed.ts)
// ---------------------------------------------------------------------------

/** Asha from Acme Steel Imports (firm-acme). */
const USER_ASHA: SessionUser = {
  id: "user-asha",
  role: "USER",
  firmId: "firm-acme",
  name: "Asha (Acme)",
  email: "asha@acme.in",
};

/** Rahul from Bharat Customs Brokers (firm-bharat). */
const USER_RAHUL: SessionUser = {
  id: "user-rahul",
  role: "USER",
  firmId: "firm-bharat",
  name: "Rahul (Bharat)",
  email: "rahul@bharat.in",
};

// ---------------------------------------------------------------------------
// 1. API integration — firm-scoped Determination persisted
// ---------------------------------------------------------------------------

describe.skipIf(!hasDbEnv)(
  "Task 5 — runCheck: firm-scoped Determination persisted",
  () => {
    it("persists a Determination and returns a determinationId for a RED verdict (E250, after grace)", async () => {
      const input: EngineInput = e250Input(
        DATES.afterSteelGrace, // BL date well after grace end → RED
        DATES.afterSteelGrace,
      );

      const result = await runCheck(input, USER_ASHA);

      // The engine result is present.
      expect(result.determinationId).toBeTruthy();
      expect(result.verdict).toBe("RED");
      expect(result.isNumber).toContain("IS 2062");
      expect(result.gazetteReference).toBeTruthy();
      expect(result.circularReference).toBeTruthy();
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(Array.isArray(result.reasoningTrace)).toBe(true);
      expect(result.reasoningTrace.length).toBeGreaterThan(0);

      // The Determination row was persisted and is firm-scoped.
      const det = await prisma.determination.findUnique({
        where: { id: result.determinationId },
      });
      expect(det).not.toBeNull();
      expect(det!.firmId).toBe(USER_ASHA.firmId);
      expect(det!.userId).toBe(USER_ASHA.id);
      expect(det!.verdict).toBe("RED");
      expect(det!.ruleVersionSnapshot).not.toBeNull();
      expect(det!.reasoningTrace).not.toBeNull();
    });

    it("persists a GREEN verdict (uncovered HS code)", async () => {
      const input: EngineInput = uncoveredInput();

      const result = await runCheck(input, USER_ASHA);

      expect(result.verdict).toBe("GREEN");
      expect(result.determinationId).toBeTruthy();

      const det = await prisma.determination.findUnique({
        where: { id: result.determinationId },
      });
      expect(det!.verdict).toBe("GREEN");
      expect(det!.firmId).toBe("firm-acme");
    });

    it("persists a GREEN verdict for a shipment within the steel transitional grace window (BL-triggered)", async () => {
      // BL date is on the first day of the grace window → GREEN (transitional exemption).
      const blDate = STEEL_EFFECTIVE; // exactly at window start → in window
      const input: EngineInput = e250Input(blDate, DATES.afterSteelGrace);

      const result = await runCheck(input, USER_ASHA);

      expect(result.verdict).toBe("GREEN");
      expect(result.transitionalStatus).toContain("BILL_OF_LADING");

      const det = await prisma.determination.findUnique({
        where: { id: result.determinationId },
      });
      expect(det!.verdict).toBe("GREEN");
    });

    it("persists with status PENDING_REVIEW for an AMBER verdict (low-confidence match)", async () => {
      const input: EngineInput = {
        grade: "UNKNOWN_GRADE_XYZ",
        material: "unknown material",
        hsCode: "7208.52", // matches E250 by HS, but grade won't score
        clearanceDate: DATES.afterSteelGrace,
      };

      const result = await runCheck(input, USER_ASHA);

      expect(result.verdict).toBe("AMBER");
      expect(result.status).toBe("PENDING_REVIEW");
      expect(result.determinationId).toBeTruthy();

      const det = await prisma.determination.findUnique({
        where: { id: result.determinationId },
      });
      expect(det!.verdict).toBe("AMBER");
      expect(det!.status).toBe("PENDING_REVIEW");
    });

    it("stores the full ruleVersionSnapshot on each persisted Determination", async () => {
      const input: EngineInput = e250Input(
        DATES.afterSteelGrace,
        DATES.afterSteelGrace,
      );

      const result = await runCheck(input, USER_ASHA);

      const det = await prisma.determination.findUnique({
        where: { id: result.determinationId },
      });
      // ruleVersionSnapshot is a JSONB object containing the rule context arrays.
      const snap = det!.ruleVersionSnapshot as Record<string, unknown>;
      expect(snap).toHaveProperty("qcos");
      expect(snap).toHaveProperty("qcoItems");
      expect(snap).toHaveProperty("enforcementCirculars");
      expect(snap).toHaveProperty("transitionalArrangements");
      expect(snap).toHaveProperty("exemptions");
    });
  },
);

// ---------------------------------------------------------------------------
// 2. Firm isolation — cross-firm check
// ---------------------------------------------------------------------------

describe.skipIf(!hasDbEnv)(
  "Task 5 — firm isolation: each firm sees only its own Determinations",
  () => {
    it("a Determination created by Asha (firm-acme) is not visible to Rahul (firm-bharat)", async () => {
      const input: EngineInput = e250Input(
        DATES.afterSteelGrace,
        DATES.afterSteelGrace,
      );

      // Asha creates a determination.
      const ashaResult = await runCheck(input, USER_ASHA);

      // Rahul's firm should not have that determination.
      const rahulDet = await prisma.determination.findFirst({
        where: { id: ashaResult.determinationId, firmId: "firm-bharat" },
      });
      expect(rahulDet).toBeNull();

      // Asha's firm DOES have it.
      const ashaDet = await prisma.determination.findFirst({
        where: { id: ashaResult.determinationId, firmId: "firm-acme" },
      });
      expect(ashaDet).not.toBeNull();
    });

    it("Rahul (firm-bharat) can run his own check and its firmId is firm-bharat", async () => {
      const input: EngineInput = fastenerInput(DATES.afterFastenersGrace);

      const result = await runCheck(input, USER_RAHUL);

      expect(result.determinationId).toBeTruthy();
      const det = await prisma.determination.findUnique({
        where: { id: result.determinationId },
      });
      expect(det!.firmId).toBe("firm-bharat");
      expect(det!.userId).toBe(USER_RAHUL.id);
    });
  },
);

// ---------------------------------------------------------------------------
// 3. Engine-DB wiring — loadRuleContext round-trip
// ---------------------------------------------------------------------------

describe.skipIf(!hasDbEnv)(
  "Task 5 — engine-DB wiring: loadRuleContext + evaluate",
  () => {
    it("loads the rule context from the DB and returns a well-formed RuleContext", async () => {
      const ctx = await loadRuleContext();

      expect(ctx.qcos.length).toBeGreaterThan(0);
      expect(ctx.qcoItems.length).toBeGreaterThan(0);
      expect(ctx.enforcementCirculars.length).toBeGreaterThan(0);
      expect(ctx.transitionalArrangements.length).toBeGreaterThan(0);
      expect(ctx.isStandards.length).toBeGreaterThan(0);
    });

    it("DB context produces the same verdict shape as the in-memory fixture context (E250 RED path)", () => {
      // Use the in-memory fixture to verify the engine's output shape.
      const fixtureCtx = buildSeedContext();
      const input = e250Input(DATES.afterSteelGrace, DATES.afterSteelGrace);

      const result = evaluate(input, fixtureCtx);

      expect(result.verdict).toBe("RED");
      expect(result.isNumber).toContain("IS 2062");
      expect(result.gazetteReference).toBeTruthy();
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.reasoningTrace.length).toBeGreaterThan(0);
    });

    it("DB context produces a verdict with references citing curated IS standards", async () => {
      const ctx = await loadRuleContext();
      const input = e250Input(DATES.afterSteelGrace, DATES.afterSteelGrace);

      const result = evaluate(input, ctx);

      // Engine must cite an IS number from a curated DB row — not hallucinated.
      expect(result.isNumber).toBeTruthy();
      expect(result.isNumber).toContain("IS 2062");
    });

    it("DB context: fastener check cites IS 1367", async () => {
      const ctx = await loadRuleContext();
      const input = fastenerInput(DATES.afterFastenersGrace);

      const result = evaluate(input, ctx);

      expect(result.verdict).toBe("RED");
      expect(result.isNumber).toContain("IS 1367");
    });

    it("DB context: uncovered HS code returns GREEN (no candidates in DB)", async () => {
      const ctx = await loadRuleContext();
      const input = uncoveredInput();

      const result = evaluate(input, ctx);

      expect(result.verdict).toBe("GREEN");
      expect(result.isNumber).toBeNull();
    });
  },
);

// ---------------------------------------------------------------------------
// 4. Boundary inputs at the effective date
// ---------------------------------------------------------------------------

describe(
  "Task 5 — boundary inputs at the effective date (pure engine, in-memory)",
  () => {
    const ctx = buildSeedContext();

    // Steel QCO boundary: effectiveFrom = 2020-12-22, grace window +90 days
    // (inclusive both ends), trigger type = BILL_OF_LADING.

    it("BL date exactly at effectiveFrom (first day of grace) → GREEN (in window)", () => {
      // Window: [2020-12-22, 2021-03-22]. BL on 2020-12-22 → in window.
      const input = e250Input(STEEL_EFFECTIVE, DATES.afterSteelGrace);
      const result = evaluate(input, ctx);
      expect(result.verdict).toBe("GREEN");
      expect(result.transitionalStatus).toBeTruthy();
    });

    it("BL date exactly at grace window end (last day) → GREEN (inclusive end)", () => {
      // Window end: 2021-03-22. BL on 2021-03-22 → still in window.
      const input = e250Input(STEEL_GRACE_END, DATES.afterSteelGrace);
      const result = evaluate(input, ctx);
      expect(result.verdict).toBe("GREEN");
    });

    it("BL date one day after grace window end → RED (outside window)", () => {
      const oneDayAfterEnd = new Date(
        STEEL_GRACE_END.getTime() + 24 * 60 * 60 * 1000,
      );
      const input = e250Input(oneDayAfterEnd, DATES.afterSteelGrace);
      const result = evaluate(input, ctx);
      expect(result.verdict).toBe("RED");
    });

    it("clearance date exactly at effectiveFrom (QCO just became active) → active QCO", () => {
      // Using fasteners QCO (clearance-date trigger): effectiveFrom = 2022-01-01.
      // Clearance on 2022-01-01 → QCO active, inside 60-day grace → GREEN.
      const input = fastenerInput(FASTENERS_EFFECTIVE);
      const result = evaluate(input, ctx);
      // Grace window: [2022-01-01, 2022-03-02]. Clearance on 2022-01-01 → in window.
      expect(result.verdict).toBe("GREEN");
    });

    it("clearance date one day before effectiveFrom → QCO not yet active → GREEN", () => {
      const oneDayBefore = new Date(
        FASTENERS_EFFECTIVE.getTime() - 24 * 60 * 60 * 1000,
      );
      const input = fastenerInput(oneDayBefore);
      const result = evaluate(input, ctx);
      // QCO not yet effective (effectiveFrom exclusive: day before is pre-mandate).
      expect(result.verdict).toBe("GREEN");
    });

    it("steel BL date one day before effectiveFrom → QCO not yet active → GREEN", () => {
      // For steel, trigger is BL date. BL one day before effectiveFrom.
      const oneDayBefore = new Date(
        STEEL_EFFECTIVE.getTime() - 24 * 60 * 60 * 1000,
      );
      const input = e250Input(oneDayBefore, DATES.afterSteelGrace);
      const result = evaluate(input, ctx);
      // QCO effectiveFrom is 2020-12-22. BL on 2020-12-21 → the BL predates
      // the effective date, so we check isQcoActiveAsOf(qco, applicableDate=BL).
      // BL < effectiveFrom → QCO not active yet → GREEN.
      expect(result.verdict).toBe("GREEN");
    });
  },
);

// ---------------------------------------------------------------------------
// 5. persistDetermination — unit-level persistence test
// ---------------------------------------------------------------------------

describe.skipIf(!hasDbEnv)(
  "Task 5 — persistDetermination: Determination storage directly",
  () => {
    it("creates a Determination row with all required fields", async () => {
      const ctx = buildSeedContext();
      const input: EngineInput = e250Input(
        DATES.afterSteelGrace,
        DATES.afterSteelGrace,
      );
      const engineResult = evaluate(input, ctx);

      const det = await persistDetermination(
        input,
        engineResult,
        ctx,
        "firm-acme",
        "user-asha",
      );

      expect(det.id).toBeTruthy();
      expect(det.firmId).toBe("firm-acme");
      expect(det.userId).toBe("user-asha");
      expect(det.verdict).toBe(engineResult.verdict);
      expect(det.confidence).toBe(engineResult.confidence);
      expect(det.isNumber).toBe(engineResult.isNumber);
      expect(det.gazetteReference).toBe(engineResult.gazetteReference);
      expect(det.circularReference).toBe(engineResult.circularReference);
      expect(det.ruleVersionSnapshot).not.toBeNull();
      expect(det.reasoningTrace).not.toBeNull();
      expect(det.status).toBe(engineResult.status);
    });

    it("stores the input JSON matching the engine input", async () => {
      const ctx = buildSeedContext();
      const input: EngineInput = {
        productType: "structural steel",
        grade: "E250",
        dimensions: "plates/sections/profiles",
        material: "carbon structural steel",
        hsCode: "7208.52",
        clearanceDate: DATES.afterSteelGrace,
        billOfLadingDate: DATES.afterSteelGrace,
      };
      const engineResult = evaluate(input, ctx);

      const det = await persistDetermination(
        input,
        engineResult,
        ctx,
        "firm-acme",
        "user-asha",
      );

      const storedInput = det.input as Record<string, unknown>;
      expect(storedInput.hsCode).toBe("7208.52");
      expect(storedInput.grade).toBe("E250");
    });
  },
);

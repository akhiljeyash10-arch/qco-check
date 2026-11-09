import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient, type Determination } from "@prisma/client";
import { seedAuth, seedRules } from "@/prisma/seed";
import { runBatch } from "@/lib/batch/service";
import { buildResultsCsv } from "@/lib/batch/results-csv";
import type { SessionUser } from "@/lib/session";

/**
 * Task 8 — CSV batch upload integration tests.
 *
 * These tests run against the dev Postgres instance (Docker: `npm run db:up`)
 * with migrations applied. They verify:
 *
 *  1. The batch API processes N rows and stores N firm-scoped Determinations,
 *     reporting per-row errors.
 *  2. Firm scoping: Firm A's batch/determinations are not visible to Firm B.
 *  3. Malformed-row handling: a malformed row produces a per-row error without
 *     altering other rows' verdicts (row independence).
 *
 * Additionally (no DB needed): results CSV generation from stored determinations.
 *
 * If DATABASE_URL is absent, the DB-backed describe blocks skip gracefully.
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
// CSV helpers
// ---------------------------------------------------------------------------

const HEADER =
  "productType,grade,dimensions,material,hsCode,clearanceDate,billOfLadingDate";

/** A steel row that yields RED (E250, BL date after the grace window). */
const RED_STEEL =
  "structural steel,E250,plates/sections/profiles,carbon structural steel,7208.52,2021-06-01,2021-06-01";

/** A fastener row that yields RED (after the fastener grace window). */
const RED_FASTENER =
  "fasteners,Property Class 8.8,M6-M48,carbon/alloy steel,7318.15,2022-06-01,2022-06-01";

/** An uncovered HS code that yields GREEN (no candidates). */
const GREEN_ROW =
  "unknown product,unknown grade,unknown,unknown material,9999.99,2021-06-01,2021-06-01";

/** A row missing the hsCode (malformed → per-row error). */
const NO_HSCODE =
  "structural steel,E250,plates/sections/profiles,carbon structural steel,,2021-06-01,2021-06-01";

/** A row with an invalid clearance date (malformed → per-row error). */
const BAD_DATE =
  "structural steel,E250,plates/sections/profiles,carbon structural steel,7208.52,not-a-date,2021-06-01";

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

// ===========================================================================
// 1. Batch processes N rows, stores N determinations, reports per-row errors
// ===========================================================================

describe.skipIf(!hasDbEnv)(
  "Task 8 — runBatch: processes N rows and stores N determinations",
  () => {
    it("stores one Determination per valid row and reports zero errors", async () => {
      const csvText = csv(RED_STEEL, RED_FASTENER, GREEN_ROW);

      const result = await runBatch(csvText, "test-all-valid.csv", USER_ASHA);

      expect(result.batchId).toBeTruthy();
      expect(result.totalRows).toBe(3);
      expect(result.successRows).toBe(3);
      expect(result.errorRows).toBe(0);
      expect(result.rowResults).toHaveLength(3);
      expect(result.structuralErrors).toEqual([]);

      // All three Determinations were persisted, firm-scoped, linked to the Batch.
      const determinations = await prisma.determination.findMany({
        where: { batchId: result.batchId },
        orderBy: { createdAt: "asc" },
      });
      expect(determinations).toHaveLength(3);
      for (const det of determinations) {
        expect(det.firmId).toBe("firm-acme");
        expect(det.userId).toBe("user-asha");
        expect(det.batchId).toBe(result.batchId);
      }

      // The first two rows are RED; the uncovered one is GREEN.
      expect(result.rowResults[0].verdict).toBe("RED");
      expect(result.rowResults[0].isNumber).toContain("IS 2062");
      expect(result.rowResults[1].verdict).toBe("RED");
      expect(result.rowResults[1].isNumber).toContain("IS 1367");
      expect(result.rowResults[2].verdict).toBe("GREEN");
    });

    it("stores a ruleVersionSnapshot on every Determination in the batch", async () => {
      const result = await runBatch(csv(RED_STEEL), "test-snapshot.csv", USER_ASHA);

      const det = await prisma.determination.findFirst({
        where: { batchId: result.batchId },
      });
      expect(det).not.toBeNull();
      const snap = det!.ruleVersionSnapshot as Record<string, unknown>;
      expect(snap).toHaveProperty("qcos");
      expect(snap).toHaveProperty("qcoItems");
      expect(snap).toHaveProperty("enforcementCirculars");
      expect(snap).toHaveProperty("transitionalArrangements");
      expect(snap).toHaveProperty("exemptions");
    });

    it("creates a Batch record with COMPLETED status when rows succeed", async () => {
      const result = await runBatch(csv(RED_STEEL), "test-batch-status.csv", USER_ASHA);

      const batch = await prisma.batch.findUnique({
        where: { id: result.batchId },
      });
      expect(batch).not.toBeNull();
      expect(batch!.firmId).toBe("firm-acme");
      expect(batch!.userId).toBe("user-asha");
      expect(batch!.fileName).toBe("test-batch-status.csv");
      expect(batch!.totalRows).toBe(1);
      expect(batch!.status).toBe("COMPLETED");
    });
  },
);

// ===========================================================================
// 2. Firm scoping
// ===========================================================================

describe.skipIf(!hasDbEnv)(
  "Task 8 — firm scoping: Firm A cannot see Firm B's batches",
  () => {
    it("Asha's batch is scoped to firm-acme and invisible to firm-bharat", async () => {
      const result = await runBatch(csv(RED_STEEL), "test-firm-scope.csv", USER_ASHA);

      // The Batch belongs to firm-acme.
      const ashaBatch = await prisma.batch.findUnique({
        where: { id: result.batchId },
      });
      expect(ashaBatch!.firmId).toBe("firm-acme");

      // Firm-bharat has no batch with that id.
      const bharatBatch = await prisma.batch.findFirst({
        where: { id: result.batchId, firmId: "firm-bharat" },
      });
      expect(bharatBatch).toBeNull();

      // Determinations are firm-scoped too.
      const bharatDets = await prisma.determination.findMany({
        where: { batchId: result.batchId, firmId: "firm-bharat" },
      });
      expect(bharatDets).toEqual([]);

      const ashaDets = await prisma.determination.findMany({
        where: { batchId: result.batchId, firmId: "firm-acme" },
      });
      expect(ashaDets.length).toBeGreaterThan(0);
    });

    it("Rahul (firm-bharat) running his own batch produces firm-bharat records", async () => {
      const result = await runBatch(
        csv(RED_FASTENER),
        "test-rahul-batch.csv",
        USER_RAHUL,
      );

      const batch = await prisma.batch.findUnique({
        where: { id: result.batchId },
      });
      expect(batch!.firmId).toBe("firm-bharat");
      expect(batch!.userId).toBe("user-rahul");

      const det = await prisma.determination.findFirst({
        where: { batchId: result.batchId },
      });
      expect(det!.firmId).toBe("firm-bharat");
    });
  },
);

// ===========================================================================
// 3. Malformed-row handling (row independence)
// ===========================================================================

describe.skipIf(!hasDbEnv)(
  "Task 8 — malformed-row handling: per-row errors without breaking other rows",
  () => {
    it("a malformed row produces a per-row error and valid rows still get verdicts", async () => {
      // Row 1: valid RED. Row 2: missing hsCode (malformed). Row 3: valid GREEN.
      const csvText = csv(RED_STEEL, NO_HSCODE, GREEN_ROW);

      const result = await runBatch(csvText, "test-mixed.csv", USER_ASHA);

      expect(result.totalRows).toBe(3);
      expect(result.successRows).toBe(2);
      expect(result.errorRows).toBe(1);
      expect(result.rowResults).toHaveLength(3);

      // Sort by row index for deterministic assertions.
      const byIndex = new Map(result.rowResults.map((r) => [r.rowIndex, r]));

      // Row 1: valid RED.
      expect(byIndex.get(1)!.verdict).toBe("RED");
      expect(byIndex.get(1)!.error).toBeUndefined();

      // Row 2: error, no verdict.
      const row2 = byIndex.get(2)!;
      expect(row2.verdict).toBeUndefined();
      expect(row2.error).toBeTruthy();
      expect(row2.error).toContain("hsCode");

      // Row 3: valid GREEN.
      expect(byIndex.get(3)!.verdict).toBe("GREEN");
      expect(byIndex.get(3)!.error).toBeUndefined();

      // Only 2 Determinations persisted (the valid rows).
      const determinations = await prisma.determination.findMany({
        where: { batchId: result.batchId },
      });
      expect(determinations).toHaveLength(2);
      // The errored row did not create a determination.
      expect(
        determinations.every((d) => d.verdict !== undefined),
      ).toBe(true);
    });

    it("multiple malformed rows do not alter other rows' verdicts", async () => {
      // Row 1: valid RED. Row 2: bad date. Row 3: valid GREEN. Row 4: missing hsCode.
      const csvText = csv(RED_STEEL, BAD_DATE, GREEN_ROW, NO_HSCODE);

      const result = await runBatch(csvText, "test-multi-malformed.csv", USER_ASHA);

      expect(result.successRows).toBe(2);
      expect(result.errorRows).toBe(2);

      const byIndex = new Map(result.rowResults.map((r) => [r.rowIndex, r]));
      expect(byIndex.get(1)!.verdict).toBe("RED");
      expect(byIndex.get(2)!.error).toBeTruthy();
      expect(byIndex.get(3)!.verdict).toBe("GREEN");
      expect(byIndex.get(4)!.error).toBeTruthy();

      // Determinations count matches valid rows only.
      const determinations = await prisma.determination.findMany({
        where: { batchId: result.batchId },
      });
      expect(determinations).toHaveLength(2);
    });

    it("a batch with only malformed rows has FAILED status and zero determinations", async () => {
      const csvText = csv(NO_HSCODE, BAD_DATE);

      const result = await runBatch(csvText, "test-all-malformed.csv", USER_ASHA);

      expect(result.successRows).toBe(0);
      expect(result.errorRows).toBe(2);

      const batch = await prisma.batch.findUnique({
        where: { id: result.batchId },
      });
      expect(batch!.status).toBe("FAILED");

      const determinations = await prisma.determination.findMany({
        where: { batchId: result.batchId },
      });
      expect(determinations).toHaveLength(0);
    });
  },
);

// ===========================================================================
// 4. Results CSV generation (pure — no DB needed)
// ===========================================================================

describe("Task 8 — buildResultsCsv: results CSV from determinations", () => {
  it("produces a CSV with a header row and one data row per determination", () => {
    const mockDetermination = {
      id: "det-123",
      input: {
        productType: "structural steel",
        grade: "E250",
        dimensions: "plates",
        material: "carbon steel",
        hsCode: "7208.52",
        clearanceDate: "2021-06-01",
        billOfLadingDate: "2021-06-01",
      },
      verdict: "RED",
      confidence: 0.95,
      isNumber: "IS 2062",
      gazetteReference: "S.O. 4182(E)",
      circularReference: "Circular No. 12/2020",
      transitionalStatus: null,
      status: "COMPLETED",
    } as unknown as Determination;

    const csvText = buildResultsCsv([mockDetermination]);

    // Header row present.
    expect(csvText).toContain("determinationId");
    expect(csvText).toContain("verdict");
    expect(csvText).toContain("hsCode");

    // Data row present.
    expect(csvText).toContain("det-123");
    expect(csvText).toContain("RED");
    expect(csvText).toContain("IS 2062");
    expect(csvText).toContain("7208.52");
  });

  it("handles an empty determination list (header only)", () => {
    const csvText = buildResultsCsv([]);

    const lines = csvText.trim().split(/\r?\n/);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0]).toContain("verdict");
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { seedAuth, seedRules } from "@/prisma/seed";
import { runCheck } from "@/lib/check/service";
import {
  resolveAmberCase,
  promoteToRule,
  assertAdmin,
  listPendingReviewQueue,
  type ActionResult,
} from "@/lib/queue/service";
import type { SessionUser } from "@/lib/session";
import type { EngineInput } from "@/lib/engine/types";
import { DATES } from "@/lib/engine/fixtures";

/**
 * Task 9 — Admin review queue + promote-to-rule integration tests.
 *
 * These tests run against the dev Postgres instance (Docker: `npm run db:up`)
 * with migrations applied. They verify the full human-in-the-loop loop:
 *
 *  1. An Amber determination is routed to the review queue (ReviewQueueItem
 *     created, status PENDING).
 *  2. Admin resolves the case (verdict + notes) → Determination PENDING_REVIEW
 *     → RESOLVED; ReviewQueueItem → RESOLVED; AuditLog with before/after.
 *  3. Admin promotes the case to a rule (new QCOItem) → ReviewQueueItem
 *     .promotedQcoItemId set, status → PROMOTED; AuditLog entries.
 *  4. A subsequent identical query auto-resolves (no longer Amber) — the
 *     engine now finds the promoted QCOItem and returns a direct RED.
 *  5. Authorization: non-admins cannot resolve or promote.
 *
 * If DATABASE_URL is absent, the DB-backed describe blocks skip gracefully.
 *
 * A unique grade per run prevents interference from QCOItems promoted by prior
 * test runs (the engine's spec match would otherwise find the old item).
 */

const prisma = new PrismaClient({ log: ["warn", "error"] });
const hasDbEnv = !!process.env.DATABASE_URL;

// ---------------------------------------------------------------------------
// Seed + session users
// ---------------------------------------------------------------------------

beforeAll(async () => {
  if (!hasDbEnv) return;
  await prisma.$queryRaw`SELECT 1`;
  await seedAuth(prisma);
  await seedRules(prisma);
}, 30_000);

/** The seeded platform admin (firmId null). */
const ADMIN: SessionUser = {
  id: "user-admin",
  role: "ADMIN",
  firmId: null,
  name: "Platform Admin",
  email: "admin@qcocheck.local",
};

/** Asha from Acme Steel Imports (firm-acme). */
const USER_ASHA: SessionUser = {
  id: "user-asha",
  role: "USER",
  firmId: "firm-acme",
  name: "Asha (Acme)",
  email: "asha@acme.in",
};

/**
 * Unique grade per run so promoted QCOItems from prior runs do not interfere.
 * The input HS code (7208.52) still resolves the E250 candidate (→ AMBER, low
 * confidence) because the unique grade does not match E250's "E250".
 */
const UNIQUE_GRADE = "TEST-E350-" + Math.floor(Math.random() * 1e12);

/** An input that yields AMBER: HS matches E250 but the grade is unique. */
function amberInput(): EngineInput {
  return {
    productType: "structural steel",
    grade: UNIQUE_GRADE,
    dimensions: "plates/sections/profiles",
    material: "carbon structural steel",
    hsCode: "7208.52",
    clearanceDate: DATES.afterSteelGrace,
    billOfLadingDate: DATES.afterSteelGrace,
  };
}

/** Unwrap a successful ActionResult (throws if it errored, for easy chaining). */
function unwrap<T>(r: ActionResult<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

// ===========================================================================
// Authorization guard (pure — no DB needed)
// ===========================================================================

describe("Task 9 — assertAdmin guard (pure)", () => {
  it("passes for an ADMIN user", () => {
    expect(() => assertAdmin(ADMIN)).not.toThrow();
  });

  it("throws Forbidden for a USER", () => {
    expect(() => assertAdmin(USER_ASHA)).toThrow(/Forbidden/);
  });

  it("throws Forbidden for a user with an arbitrary non-admin role", () => {
    const reviewer: SessionUser = { ...USER_ASHA, role: "USER" };
    expect(() => assertAdmin(reviewer)).toThrow(/Forbidden/);
  });
});

// ===========================================================================
// Resolve-then-promote flow + auto-resolution (DB-backed)
// ===========================================================================

describe.skipIf(!hasDbEnv)(
  "Task 9 — resolve-then-promote flow + auto-resolution",
  () => {
    let determinationId: string;
    let queueItemId: string;
    let promotedQcoItemId: string;

    // --- 1. Amber determination routed to the review queue -------------------

    it("creates an Amber determination and routes it to the review queue", async () => {
      const result = await runCheck(amberInput(), USER_ASHA);

      expect(result.verdict).toBe("AMBER");
      expect(result.status).toBe("PENDING_REVIEW");
      expect(result.determinationId).toBeTruthy();
      determinationId = result.determinationId;

      // A ReviewQueueItem was created (status PENDING), linked one-to-one.
      const det = await prisma.determination.findUnique({
        where: { id: determinationId },
        include: { reviewQueueItem: true },
      });
      expect(det).not.toBeNull();
      expect(det!.verdict).toBe("AMBER");
      expect(det!.status).toBe("PENDING_REVIEW");
      expect(det!.reviewQueueItem).not.toBeNull();
      expect(det!.reviewQueueItem!.status).toBe("PENDING");
      expect(det!.reviewQueueItem!.resolutionVerdict).toBeNull();
      queueItemId = det!.reviewQueueItem!.id;
    });

    it("the pending case appears in the admin queue across all firms", async () => {
      const queue = await listPendingReviewQueue();
      const found = queue.find((e) => e.determinationId === determinationId);
      expect(found).toBeDefined();
      expect(found!.verdict).toBe("AMBER");
      expect(found!.firmName).toBe("Acme Steel Imports Pvt Ltd");
      expect(found!.hsCode).toBe("7208.52");
    });

    // --- 2. Admin resolves the Amber case ----------------------------------

    it("admin resolves the case (verdict + notes) → RESOLVED with audit log", async () => {
      const result = await resolveAmberCase(
        determinationId,
        ADMIN,
        "RED",
        "Confirmed grade per mill test certificate.",
      );
      expect(result.ok).toBe(true);

      const det = await prisma.determination.findUnique({
        where: { id: determinationId },
        include: { reviewQueueItem: true },
      });
      // Determination → RESOLVED.
      expect(det!.status).toBe("RESOLVED");
      expect(det!.resolvedAt).not.toBeNull();
      expect(det!.resolvedByAdminId).toBe(ADMIN.id);
      // ReviewQueueItem → RESOLVED with verdict + notes.
      expect(det!.reviewQueueItem!.status).toBe("RESOLVED");
      expect(det!.reviewQueueItem!.resolutionVerdict).toBe("RED");
      expect(det!.reviewQueueItem!.adminNotes).toContain("mill test");

      // AuditLog: RESOLVE action with before/after.
      const logs = await prisma.auditLog.findMany({
        where: { entity: "Determination", entityId: determinationId },
      });
      const resolveLog = logs.find((l) => l.action === "RESOLVE");
      expect(resolveLog).toBeDefined();
      expect(resolveLog!.actorUserId).toBe(ADMIN.id);
      const before = resolveLog!.before as Record<string, unknown>;
      const after = resolveLog!.after as Record<string, unknown>;
      expect(before.determinationStatus).toBe("PENDING_REVIEW");
      expect(before.queueStatus).toBe("PENDING");
      expect(after.determinationStatus).toBe("RESOLVED");
      expect(after.queueStatus).toBe("RESOLVED");
      expect(after.resolutionVerdict).toBe("RED");
    });

    it("rejects resolving a non-pending determination (already resolved)", async () => {
      const result = await resolveAmberCase(
        determinationId,
        ADMIN,
        "GREEN",
        "duplicate",
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected a failure result");
      expect(result.error).toMatch(/not pending review/i);
    });

    // --- 3. Admin promotes the case to a rule ------------------------------

    it("admin promotes the case to a QCOItem → linked + PROMOTED with audit log", async () => {
      const result = await promoteToRule(determinationId, ADMIN, {
        qcoId: "qco-steel-2020",
        productName: `Promoted rule: ${UNIQUE_GRADE}`,
        gradeSpec: {
          grade: UNIQUE_GRADE,
          dimensions: "plates/sections/profiles",
          material: "carbon structural steel",
        },
        hsCodes: ["7208.52"],
        isStandardIds: ["is-2062"],
        notes: "Promoted from review case.",
      });
      expect(result.ok).toBe(true);
      promotedQcoItemId = unwrap(result).qcoItemId;

      // ReviewQueueItem linked + PROMOTED.
      const det = await prisma.determination.findUnique({
        where: { id: determinationId },
        include: { reviewQueueItem: true },
      });
      expect(det!.reviewQueueItem!.status).toBe("PROMOTED");
      expect(det!.reviewQueueItem!.promotedQcoItemId).toBe(promotedQcoItemId);
      // Determination.promotionQcoItemId also set.
      expect(det!.promotionQcoItemId).toBe(promotedQcoItemId);

      // The QCOItem was created with the prefilled values.
      const item = await prisma.qCOItem.findUnique({
        where: { id: promotedQcoItemId },
        include: { isStandards: true },
      });
      expect(item).not.toBeNull();
      expect(item!.productName).toContain(UNIQUE_GRADE);
      const gs = item!.gradeSpec as Record<string, string>;
      expect(gs.grade).toBe(UNIQUE_GRADE);
      expect(gs.dimensions).toBe("plates/sections/profiles");
      expect(item!.isStandards.map((s) => s.isNumber)).toContain("IS 2062");

      // AuditLog: PROMOTE (QCOItem creation).
      const promoteLogs = await prisma.auditLog.findMany({
        where: { entity: "QCOItem", entityId: promotedQcoItemId },
      });
      expect(promoteLogs.length).toBe(1);
      expect(promoteLogs[0].action).toBe("PROMOTE");
      expect(promoteLogs[0].actorUserId).toBe(ADMIN.id);
      expect(promoteLogs[0].before).toBeNull();

      // AuditLog: PROMOTE_LINK (ReviewQueueItem linking with before/after).
      const linkLogs = await prisma.auditLog.findMany({
        where: { entity: "ReviewQueueItem", action: "PROMOTE_LINK" },
      });
      const ourLink = linkLogs.find((l) => l.entityId === queueItemId);
      expect(ourLink).toBeDefined();
      const lBefore = ourLink!.before as Record<string, unknown>;
      const lAfter = ourLink!.after as Record<string, unknown>;
      expect(lBefore.queueStatus).toBe("RESOLVED");
      expect(lAfter.queueStatus).toBe("PROMOTED");
      expect(lAfter.promotedQcoItemId).toBe(promotedQcoItemId);
      expect(lAfter.sourceDeterminationId).toBe(determinationId);
    });

    // --- 4. Auto-resolution: identical query now returns a direct verdict ---

    it("a subsequent identical query auto-resolves to RED (no longer Amber)", async () => {
      const result = await runCheck(amberInput(), USER_ASHA);

      // The engine now finds the promoted QCOItem → high-confidence RED.
      expect(result.verdict).toBe("RED");
      expect(result.status).toBe("COMPLETED");
      expect(result.qcoItemId).toBe(promotedQcoItemId);
      expect(result.isNumber).toContain("IS 2062");
      expect(result.gazetteReference).toBeTruthy();

      // The new determination is COMPLETED (not PENDING_REVIEW) and has no
      // review-queue item (only Amber cases route to the queue).
      const det = await prisma.determination.findUnique({
        where: { id: result.determinationId },
        include: { reviewQueueItem: true },
      });
      expect(det!.status).toBe("COMPLETED");
      expect(det!.verdict).toBe("RED");
      expect(det!.reviewQueueItem).toBeNull();
    });

    // --- 5. Authorization: non-admins denied --------------------------------

    it("a non-admin cannot resolve a case", async () => {
      await expect(
        resolveAmberCase("any-determination-id", USER_ASHA, "RED", "notes"),
      ).rejects.toThrow(/Forbidden/);
    });

    it("a non-admin cannot promote a case", async () => {
      await expect(
        promoteToRule("any-determination-id", USER_ASHA, {
          qcoId: "qco-steel-2020",
          productName: "x",
          gradeSpec: {},
        }),
      ).rejects.toThrow(/Forbidden/);
    });
  },
);

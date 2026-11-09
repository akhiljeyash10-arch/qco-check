import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { seedAuth, seedRules } from "@/prisma/seed";

/**
 * Task 3 — rule data model + seed tests (integration).
 *
 * These tests run against the dev Postgres instance (Docker: `npm run db:up`)
 * with migrations applied (`npm run db:migrate`). They verify:
 *   - the migration runs clean (all tables exist, migration history healthy),
 *   - the seed is idempotent (re-running yields identical row counts),
 *   - Prisma relations resolve across the data model, and
 *   - relation integrity (FK constraints, cascade/SetNull semantics, 1:1).
 *
 * If DATABASE_URL is absent (DB-less environment), the suite skips gracefully
 * via `describe.skipIf` so `npm run test` still exits 0; the pure unit tests
 * keep passing. When DATABASE_URL is set but the DB is down, beforeAll throws
 * (the developer should start the DB rather than silently skipping).
 */

const prisma = new PrismaClient({
  log: ["warn", "error"],
});

// Determined synchronously after the setup file loads .env — used to decide
// whether to skip the DB-backed describes at registration time.
const hasDbEnv = !!process.env.DATABASE_URL;

beforeAll(async () => {
  // Connectivity + seed: runs before every describe's tests. If the DB is
  // configured but unreachable, this throws (surfacing a clear failure rather
  // than a silent skip).
  await prisma.$queryRaw`SELECT 1`;
  await seedAuth(prisma);
  await seedRules(prisma);
}, 30_000);

/** Count the seed-owned tables to compare across idempotency re-runs. */
async function countRuleTables() {
  return {
    isStandards: await prisma.iSStandard.count(),
    qcos: await prisma.qCO.count(),
    qcoItems: await prisma.qCOItem.count(),
    enforcementCirculars: await prisma.enforcementCircular.count(),
    transitionalArrangements: await prisma.transitionalArrangement.count(),
    exemptions: await prisma.exemption.count(),
  };
}

describe.skipIf(!hasDbEnv)("Task 3 — migration runs clean", () => {
  it("all rule-domain tables exist and are queryable", async () => {
    // Querying each model's count verifies the table + enum types exist.
    const counts = await countRuleTables();
    expect(Object.keys(counts).length).toBe(6);
    // After seeding, every table has at least one row.
    for (const [table, n] of Object.entries(counts)) {
      expect(n, `${table} should have seeded rows`).toBeGreaterThan(0);
    }
  });

  it("migration history shows all migrations applied successfully", async () => {
    const rows = (await prisma.$queryRaw<
      Array<{
        migration_name: string;
        finished_at: Date | null;
        rolled_back_at: Date | null;
      }>
    >`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at`) as Array<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>;

    // The Task 3 migration is present and finished.
    const ruleMigration = rows.find((r) =>
      r.migration_name.includes("rule_data_model"),
    );
    expect(ruleMigration).toBeDefined();
    expect(ruleMigration!.finished_at).not.toBeNull();
    expect(ruleMigration!.rolled_back_at).toBeNull();
    // No migration was rolled back.
    for (const r of rows) {
      expect(
        r.rolled_back_at,
        `${r.migration_name} must not be rolled back`,
      ).toBeNull();
    }
  });
});

describe.skipIf(!hasDbEnv)("Task 3 — seed is idempotent", () => {
  it("re-running seedRules yields identical row counts", async () => {
    const before = await countRuleTables();
    await seedRules(prisma);
    const after = await countRuleTables();
    expect(after).toEqual(before);
  });

  it("re-running seedAuth yields identical firm/user counts", async () => {
    const before = {
      firms: await prisma.firm.count(),
      users: await prisma.user.count(),
    };
    await seedAuth(prisma);
    const after = {
      firms: await prisma.firm.count(),
      users: await prisma.user.count(),
    };
    expect(after).toEqual(before);
  });

  it("the M-N join (QCOItem↔ISStandard) is not duplicated by re-seeding", async () => {
    // Count the implicit join-table rows before and after a re-seed.
    const before = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "_ISStandardToQCOItem"
    `;
    await seedRules(prisma);
    const after = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "_ISStandardToQCOItem"
    `;
    expect(Number(after[0].count)).toBe(Number(before[0].count));
  });
});

describe.skipIf(!hasDbEnv)("Task 3 — Prisma relations resolve", () => {
  it("resolves QCO -> QCOItem -> ISStandard (M-N)", async () => {
    const steelQco = await prisma.qCO.findUnique({
      where: { id: "qco-steel-2020" },
      include: { qcoItems: { include: { isStandards: true } } },
    });

    expect(steelQco).not.toBeNull();
    expect(steelQco!.qcoItems.length).toBeGreaterThanOrEqual(3);

    // CRGO item is linked to exactly one IS standard (IS 1666).
    const crgo = steelQco!.qcoItems.find((i) => i.id === "qcoitem-steel-crgo");
    expect(crgo).toBeDefined();
    expect(crgo!.isStandards).toHaveLength(1);
    expect(crgo!.isStandards[0].isNumber).toBe("IS 1666");
    // gradeSpec JSONB round-trips as an object.
    expect(crgo!.gradeSpec).toHaveProperty("grade");
    expect((crgo!.gradeSpec as { material: string }).material).toContain(
      "CRGO",
    );
  });

  it("resolves EnforcementCircular -> TransitionalArrangement (1:1)", async () => {
    const ec = await prisma.enforcementCircular.findUnique({
      where: { id: "ec-steel-2020" },
      include: { transitionalArrangement: true, qco: true },
    });

    expect(ec).not.toBeNull();
    expect(ec!.qco.id).toBe("qco-steel-2020");
    expect(ec!.transitionalArrangement).not.toBeNull();
    expect(ec!.transitionalArrangement!.triggerDateType).toBe("BILL_OF_LADING");
    expect(ec!.transitionalArrangement!.gracePeriodDays).toBe(90);
  });

  it("resolves QCO -> EnforcementCircular and QCO -> Exemption", async () => {
    const steelQco = await prisma.qCO.findUnique({
      where: { id: "qco-steel-2020" },
      include: { enforcementCirculars: true, exemptions: true },
    });

    expect(steelQco).not.toBeNull();
    expect(steelQco!.enforcementCirculars.length).toBeGreaterThanOrEqual(1);
    expect(steelQco!.exemptions.length).toBeGreaterThanOrEqual(1);
    expect(steelQco!.exemptions[0].type).toBe("MSME_PHASED");
  });

  it("resolves the fastener QCO item back to its IS standard", async () => {
    const item = await prisma.qCOItem.findUnique({
      where: { id: "qcoitem-fasteners" },
      include: { qco: true, isStandards: true },
    });

    expect(item).not.toBeNull();
    expect(item!.qco.id).toBe("qco-fasteners");
    expect(item!.isStandards).toHaveLength(1);
    expect(item!.isStandards[0].isNumber).toBe("IS 1367");
  });

  it("resolves QCO supersession self-relation (both directions)", async () => {
    // Create a superseding QCO pointing at the steel QCO, then resolve both
    // directions, and clean up so the seed stays intact.
    const superseding = await prisma.qCO.create({
      data: {
        id: "qco-steel-superseding-test",
        title: "Steel QCO (superseding test)",
        issuingAuthority: "BIS / DPIIT",
        gazetteReference: "VERIFY: test supersession",
        status: "PUBLISHED",
        version: 2,
        supersededById: "qco-steel-2020",
      },
    });

    try {
      const steel = await prisma.qCO.findUnique({
        where: { id: "qco-steel-2020" },
        include: { supersedees: true, supersededBy: true },
      });
      const newer = await prisma.qCO.findUnique({
        where: { id: superseding.id },
        include: { supersededBy: true },
      });

      // The newer QCO is superseded-by the steel QCO (forward).
      expect(newer!.supersededBy?.id).toBe("qco-steel-2020");
      // The steel QCO lists the newer one among its supersedees (reverse).
      expect(steel!.supersedees.map((q) => q.id)).toContain(superseding.id);
    } finally {
      await prisma.qCO
        .delete({ where: { id: superseding.id } })
        .catch(() => {});
    }
  });
});

describe.skipIf(!hasDbEnv)("Task 3 — relation integrity", () => {
  it("rejects a QCOItem referencing a non-existent QCO (FK constraint)", async () => {
    await expect(
      prisma.qCOItem.create({
        data: {
          qcoId: "does-not-exist",
          productName: "orphan",
          gradeSpec: { grade: "x" },
          hsCodes: ["0000"],
        },
      }),
    ).rejects.toThrow(/foreign key|ForeignKey/i);
  });

  it("rejects a TransitionalArrangement for a non-existent circular (FK constraint)", async () => {
    await expect(
      prisma.transitionalArrangement.create({
        data: {
          enforcementCircularId: "does-not-exist",
          triggerDateType: "BILL_OF_LADING",
          gracePeriodDays: 30,
        },
      }),
    ).rejects.toThrow(/foreign key|ForeignKey/i);
  });

  it("enforces 1:1: a circular can have at most one transitional arrangement", async () => {
    // The steel circular already has one; a second insert must fail on the
    // unique(enforcementCircularId) constraint.
    await expect(
      prisma.transitionalArrangement.create({
        data: {
          enforcementCircularId: "ec-steel-2020",
          triggerDateType: "CLEARANCE_DATE",
          gracePeriodDays: 10,
        },
      }),
    ).rejects.toThrow(/unique|Unique/i);
  });

  it("cascades: deleting a QCO deletes its QCOItems (onDelete: Cascade)", async () => {
    const qco = await prisma.qCO.create({
      data: {
        id: "qco-cascade-test",
        title: "Cascade Test QCO",
        issuingAuthority: "test",
        gazetteReference: "test",
        status: "DRAFT",
        qcoItems: {
          create: [
            {
              id: "qcoitem-cascade-test",
              productName: "cascade item",
              gradeSpec: { grade: "x" },
              hsCodes: ["0000"],
            },
          ],
        },
      },
      include: { qcoItems: true },
    });

    try {
      const item = await prisma.qCOItem.findUnique({
        where: { id: "qcoitem-cascade-test" },
      });
      expect(item).not.toBeNull();

      // Deleting the QCO cascades to the QCOItem.
      await prisma.qCO.delete({ where: { id: qco.id } });
      const orphaned = await prisma.qCOItem.findUnique({
        where: { id: "qcoitem-cascade-test" },
      });
      expect(orphaned).toBeNull();
    } finally {
      await prisma.qCOItem
        .deleteMany({ where: { id: "qcoitem-cascade-test" } })
        .catch(() => {});
      await prisma.qCO
        .deleteMany({ where: { id: "qco-cascade-test" } })
        .catch(() => {});
    }
  });

  it("cascades: deleting an EnforcementCircular deletes its TransitionalArrangement", async () => {
    await prisma.qCO.create({
      data: {
        id: "qco-ec-cascade-test",
        title: "EC Cascade Test",
        issuingAuthority: "test",
        gazetteReference: "test",
        status: "DRAFT",
        enforcementCirculars: {
          create: [
            {
              id: "ec-cascade-test",
              circularReference: "test circular",
              transitionalArrangement: {
                create: {
                  id: "ta-cascade-test",
                  triggerDateType: "BILL_OF_LADING",
                  gracePeriodDays: 30,
                },
              },
            },
          ],
        },
      },
      include: {
        enforcementCirculars: { include: { transitionalArrangement: true } },
      },
    });

    try {
      const taBefore = await prisma.transitionalArrangement.findUnique({
        where: { id: "ta-cascade-test" },
      });
      expect(taBefore).not.toBeNull();

      // Deleting the circular cascades to the transitional arrangement.
      await prisma.enforcementCircular.delete({
        where: { id: "ec-cascade-test" },
      });
      const taAfter = await prisma.transitionalArrangement.findUnique({
        where: { id: "ta-cascade-test" },
      });
      expect(taAfter).toBeNull();
    } finally {
      await prisma.transitionalArrangement
        .deleteMany({ where: { id: "ta-cascade-test" } })
        .catch(() => {});
      await prisma.enforcementCircular
        .deleteMany({ where: { id: "ec-cascade-test" } })
        .catch(() => {});
      await prisma.qCO
        .deleteMany({ where: { id: "qco-ec-cascade-test" } })
        .catch(() => {});
    }
  });

  it("SetNull: deleting a referenced User nulls Determination.resolvedByAdminId", async () => {
    // Create a temporary admin, firm, user, and a RESOLVED determination
    // resolved by the admin, then delete the admin and confirm the FK nulls.
    const stamp = Date.now();
    const admin = await prisma.user.create({
      data: {
        email: `cascade-admin-${stamp}@test.local`,
        role: "ADMIN",
        passwordHash: "x",
        name: "Cascade Admin",
      },
    });
    const firm = await prisma.firm.create({
      data: { id: `firm-cascade-${stamp}`, name: "Cascade Firm" },
    });
    const user = await prisma.user.create({
      data: {
        email: `cascade-user-${stamp}@test.local`,
        role: "USER",
        firmId: firm.id,
        passwordHash: "x",
      },
    });
    const det = await prisma.determination.create({
      data: {
        id: `det-cascade-${stamp}`,
        firmId: firm.id,
        userId: user.id,
        input: { grade: "E250" },
        verdict: "AMBER",
        status: "RESOLVED",
        resolvedByAdminId: admin.id,
      },
    });

    try {
      expect(det.resolvedByAdminId).toBe(admin.id);
      await prisma.user.delete({ where: { id: admin.id } });
      const refreshed = await prisma.determination.findUnique({
        where: { id: det.id },
      });
      expect(refreshed!.resolvedByAdminId).toBeNull();
    } finally {
      await prisma.determination
        .deleteMany({ where: { id: det.id } })
        .catch(() => {});
      await prisma.user.deleteMany({ where: { id: user.id } }).catch(() => {});
      await prisma.firm.deleteMany({ where: { id: firm.id } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: admin.id } }).catch(() => {});
    }
  });
});

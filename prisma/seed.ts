import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Task 2 + Task 3 seed — auth/tenancy + the rule knowledge base.
 *
 * Idempotent (upserts by deterministic id / unique key). `seedAuth` and
 * `seedRules` are exported and take a PrismaClient so they can be invoked from
 * tests to verify idempotency (call twice → identical row counts).
 *
 * Auth seed (Task 2):
 *   - one ADMIN platform operator (no firm),
 *   - two firms (Acme Steel Imports, Bharat Customs Brokers),
 *   - one USER per firm.
 *
 * Rule seed (Task 3): a curated subset of the Steel QCO 2020 (a few real
 * QCOItems incl. a CRGO item) and one fastener QCO item. Exact Gazette refs /
 * enforcement dates are marked "VERIFY" — to be confirmed during curation
 * (see requirements.md §11–12).
 */

// ---------------------------------------------------------------------------
// Auth / tenancy constants (Task 2)
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = "admin@qcocheck.local";
const USER_A_EMAIL = "asha@acme.in";
const USER_B_EMAIL = "rahul@bharat.in";

const ADMIN_PASSWORD = "Admin@123";
const USER_PASSWORD = "User@123";

const FIRM_A_ID = "firm-acme";
const FIRM_B_ID = "firm-bharat";

// ---------------------------------------------------------------------------
// Rule knowledge base constants (Task 3)
//
// Deterministic ids make the seed idempotent across re-runs. Dates and exact
// Gazette/circular references carry "VERIFY" placeholders where curation has
// not yet confirmed the primary-source value.
// ---------------------------------------------------------------------------

const IS_2062_ID = "is-2062";
const IS_1079_ID = "is-1079";
const IS_1666_ID = "is-1666";
const IS_1367_ID = "is-1367";
const IS_277_ID = "is-277";
const IS_7887_ID = "is-7887";

const QCO_STEEL_ID = "qco-steel-2020";
const QCO_FASTENERS_ID = "qco-fasteners";

const QCOITEM_STEEL_E250_ID = "qcoitem-steel-e250";
const QCOITEM_STEEL_HR_SHEET_ID = "qcoitem-steel-hr-sheet";
const QCOITEM_STEEL_CRGO_ID = "qcoitem-steel-crgo";
const QCOITEM_FASTENERS_ID = "qcoitem-fasteners";
const QCOITEM_STEEL_GALV_ID = "qcoitem-steel-galvanized";
const QCOITEM_STEEL_WIRE_ID = "qcoitem-steel-wire-rod";

const EC_STEEL_ID = "ec-steel-2020";
const EC_FASTENERS_ID = "ec-fasteners";

const TA_STEEL_ID = "ta-steel-2020";
const TA_FASTENERS_ID = "ta-fasteners";

const EX_STEEL_MSME_ID = "ex-steel-msme";
const EX_FASTENERS_ENDUSE_ID = "ex-fasteners-enduse";

// Dates used across the rule seed (UTC midnight keeps the seed deterministic).
const STEEL_QCO_DATE = new Date("2020-12-22T00:00:00.000Z");

/**
 * Seed auth + tenancy (Task 2). Idempotent via upserts on deterministic ids /
 * unique email. Exposed so tests can verify idempotency by calling it twice.
 */
export async function seedAuth(prisma: PrismaClient): Promise<void> {
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const userHash = await bcrypt.hash(USER_PASSWORD, 10);

  const firmA = await prisma.firm.upsert({
    where: { id: FIRM_A_ID },
    update: { name: "Acme Steel Imports Pvt Ltd" },
    create: { id: FIRM_A_ID, name: "Acme Steel Imports Pvt Ltd" },
  });

  const firmB = await prisma.firm.upsert({
    where: { id: FIRM_B_ID },
    update: { name: "Bharat Customs Brokers" },
    create: { id: FIRM_B_ID, name: "Bharat Customs Brokers" },
  });

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      name: "Platform Admin",
      passwordHash: adminHash,
      role: "ADMIN",
      firmId: null,
    },
    create: {
      id: "user-admin",
      email: ADMIN_EMAIL,
      name: "Platform Admin",
      passwordHash: adminHash,
      role: "ADMIN",
      firmId: null,
    },
  });

  await prisma.user.upsert({
    where: { email: USER_A_EMAIL },
    update: {
      name: "Asha (Acme)",
      passwordHash: userHash,
      role: "USER",
      firmId: firmA.id,
    },
    create: {
      id: "user-asha",
      email: USER_A_EMAIL,
      name: "Asha (Acme)",
      passwordHash: userHash,
      role: "USER",
      firmId: firmA.id,
    },
  });

  await prisma.user.upsert({
    where: { email: USER_B_EMAIL },
    update: {
      name: "Rahul (Bharat)",
      passwordHash: userHash,
      role: "USER",
      firmId: firmB.id,
    },
    create: {
      id: "user-rahul",
      email: USER_B_EMAIL,
      name: "Rahul (Bharat)",
      passwordHash: userHash,
      role: "USER",
      firmId: firmB.id,
    },
  });
}

/**
 * Seed the rule knowledge base (Task 3). Idempotent via upserts on deterministic
 * ids; many-to-many (QCOItem↔ISStandard) is reconciled with `set` on update.
 * Exposed so tests can verify idempotency by calling it twice.
 */
export async function seedRules(prisma: PrismaClient): Promise<void> {
  // --- IS Standards --------------------------------------------------------
  await prisma.iSStandard.upsert({
    where: { id: IS_2062_ID },
    update: {
      isNumber: "IS 2062",
      title: "Hot Rolled Medium and High Tensile Structural Steel",
      versionYear: 2011,
    },
    create: {
      id: IS_2062_ID,
      isNumber: "IS 2062",
      title: "Hot Rolled Medium and High Tensile Structural Steel",
      versionYear: 2011,
    },
  });

  await prisma.iSStandard.upsert({
    where: { id: IS_1079_ID },
    update: {
      isNumber: "IS 1079",
      title: "Hot Rolled Carbon Steel Sheet and Strip",
      versionYear: 2017,
    },
    create: {
      id: IS_1079_ID,
      isNumber: "IS 1079",
      title: "Hot Rolled Carbon Steel Sheet and Strip",
      versionYear: 2017,
    },
  });

  await prisma.iSStandard.upsert({
    where: { id: IS_1666_ID },
    update: {
      isNumber: "IS 1666",
      title:
        "Cold Rolled Grain Oriented (CRGO) Electrical Steel Sheets and Strips",
      notes: "VERIFY: confirm exact IS number/title for CRGO during curation.",
    },
    create: {
      id: IS_1666_ID,
      isNumber: "IS 1666",
      title:
        "Cold Rolled Grain Oriented (CRGO) Electrical Steel Sheets and Strips",
      notes: "VERIFY: confirm exact IS number/title for CRGO during curation.",
    },
  });

  await prisma.iSStandard.upsert({
    where: { id: IS_1367_ID },
    update: {
      isNumber: "IS 1367",
      title: "Technical Supply Conditions for Threaded Steel Fasteners",
    },
    create: {
      id: IS_1367_ID,
      isNumber: "IS 1367",
      title: "Technical Supply Conditions for Threaded Steel Fasteners",
    },
  });

  // --- IS standards added in Task 10 (expanded seed dataset) ---------------
  // Distinct product classes with distinct HS-code prefixes so they exercise
  // additional engine paths without colliding with the E250/HR/CRGO items.
  await prisma.iSStandard.upsert({
    where: { id: IS_277_ID },
    update: {
      isNumber: "IS 277",
      title: "Galvanised Steel Sheets (Plain and Corrugated)",
      versionYear: 2018,
    },
    create: {
      id: IS_277_ID,
      isNumber: "IS 277",
      title: "Galvanised Steel Sheets (Plain and Corrugated)",
      versionYear: 2018,
    },
  });

  await prisma.iSStandard.upsert({
    where: { id: IS_7887_ID },
    update: {
      isNumber: "IS 7887",
      title: "Specification for Carbon Steel Wire Rods",
      versionYear: 2016,
    },
    create: {
      id: IS_7887_ID,
      isNumber: "IS 7887",
      title: "Specification for Carbon Steel Wire Rods",
      versionYear: 2016,
    },
  });

  // --- QCOs ----------------------------------------------------------------
  await prisma.qCO.upsert({
    where: { id: QCO_STEEL_ID },
    update: {
      title: "Steel and Steel Products (Quality Control) Order, 2020",
      issuingAuthority:
        "Bureau of Indian Standards (BIS) / DPIIT, Ministry of Steel",
      gazetteReference:
        "VERIFY: S.O. 4182(E) dated 22 Dec 2020 — confirm exact S.O. number during curation",
      notificationDate: STEEL_QCO_DATE,
      status: "PUBLISHED",
      version: 1,
      effectiveFrom: STEEL_QCO_DATE,
      notes:
        "Steel QCO 2020. Multiple instruments (17 Jul 2020, 22 Jul 2020, 22 Dec 2020 made effective by circular5). Covers structural steel, HR sheet/strip, CRGO.",
    },
    create: {
      id: QCO_STEEL_ID,
      title: "Steel and Steel Products (Quality Control) Order, 2020",
      issuingAuthority:
        "Bureau of Indian Standards (BIS) / DPIIT, Ministry of Steel",
      gazetteReference:
        "VERIFY: S.O. 4182(E) dated 22 Dec 2020 — confirm exact S.O. number during curation",
      notificationDate: STEEL_QCO_DATE,
      status: "PUBLISHED",
      version: 1,
      effectiveFrom: STEEL_QCO_DATE,
      notes:
        "Steel QCO 2020. Multiple instruments (17 Jul 2020, 22 Jul 2020, 22 Dec 2020 made effective by circular5). Covers structural steel, HR sheet/strip, CRGO.",
    },
  });

  await prisma.qCO.upsert({
    where: { id: QCO_FASTENERS_ID },
    update: {
      title: "Bolts, Nuts and Washers (Quality Control) Order",
      issuingAuthority: "Bureau of Indian Standards (BIS) / DPIIT",
      gazetteReference:
        "VERIFY: S.O. XXXX(E) — exact Gazette reference to confirm during curation",
      status: "PUBLISHED",
      version: 1,
      notes:
        "Industrial fasteners QCO covering hex bolts, nuts, washers. VERIFY: exact notification date during curation.",
    },
    create: {
      id: QCO_FASTENERS_ID,
      title: "Bolts, Nuts and Washers (Quality Control) Order",
      issuingAuthority: "Bureau of Indian Standards (BIS) / DPIIT",
      gazetteReference:
        "VERIFY: S.O. XXXX(E) — exact Gazette reference to confirm during curation",
      status: "PUBLISHED",
      version: 1,
      notes:
        "Industrial fasteners QCO covering hex bolts, nuts, washers. VERIFY: exact notification date during curation.",
    },
  });

  // --- QCOItems (the atomic rules) -----------------------------------------
  // Each links to its QCO and to one or more IS standards (M-N). The spec match
  // (grade/dimensions/material) carries the decision; hsCodes is a hint only.
  await prisma.qCOItem.upsert({
    where: { id: QCOITEM_STEEL_E250_ID },
    update: {
      qcoId: QCO_STEEL_ID,
      productName: "Hot Rolled Structural Steel (E250 grade)",
      productDescription:
        "Plates, sections, and profiles conforming to IS 2062",
      gradeSpec: {
        grade: "E250",
        dimensions: "plates/sections/profiles",
        material: "carbon structural steel",
      },
      hsCodes: ["7208.52", "7228.30"],
      isStandards: { set: [{ id: IS_2062_ID }] },
    },
    create: {
      id: QCOITEM_STEEL_E250_ID,
      qcoId: QCO_STEEL_ID,
      productName: "Hot Rolled Structural Steel (E250 grade)",
      productDescription:
        "Plates, sections, and profiles conforming to IS 2062",
      gradeSpec: {
        grade: "E250",
        dimensions: "plates/sections/profiles",
        material: "carbon structural steel",
      },
      hsCodes: ["7208.52", "7228.30"],
      isStandards: { connect: [{ id: IS_2062_ID }] },
    },
  });

  await prisma.qCOItem.upsert({
    where: { id: QCOITEM_STEEL_HR_SHEET_ID },
    update: {
      qcoId: QCO_STEEL_ID,
      productName: "Hot Rolled Carbon Steel Sheet and Strip",
      productDescription:
        "HR carbon steel sheets and strips conforming to IS 1079",
      gradeSpec: {
        grade: "HR1/HR2/HR3",
        dimensions: "sheet/strip",
        material: "carbon steel",
      },
      hsCodes: ["7208.90", "7211.13"],
      isStandards: { set: [{ id: IS_1079_ID }] },
    },
    create: {
      id: QCOITEM_STEEL_HR_SHEET_ID,
      qcoId: QCO_STEEL_ID,
      productName: "Hot Rolled Carbon Steel Sheet and Strip",
      productDescription:
        "HR carbon steel sheets and strips conforming to IS 1079",
      gradeSpec: {
        grade: "HR1/HR2/HR3",
        dimensions: "sheet/strip",
        material: "carbon steel",
      },
      hsCodes: ["7208.90", "7211.13"],
      isStandards: { connect: [{ id: IS_1079_ID }] },
    },
  });

  // CRGO — the flagged, hotly-litigated edge case.
  await prisma.qCOItem.upsert({
    where: { id: QCOITEM_STEEL_CRGO_ID },
    update: {
      qcoId: QCO_STEEL_ID,
      productName: "Cold Rolled Grain Oriented (CRGO) Electrical Steel",
      productDescription:
        "CRGO electrical steel sheets/strips — a hotly litigated import category (Indian Kanoon)",
      gradeSpec: {
        grade: "27CG120 / 30G130",
        dimensions: "sheet/strip",
        material: "CRGO electrical steel",
      },
      hsCodes: ["7225.11", "7225.19"],
      notes: "Flagged edge case: CRGO is a hotly litigated import category.",
      isStandards: { set: [{ id: IS_1666_ID }] },
    },
    create: {
      id: QCOITEM_STEEL_CRGO_ID,
      qcoId: QCO_STEEL_ID,
      productName: "Cold Rolled Grain Oriented (CRGO) Electrical Steel",
      productDescription:
        "CRGO electrical steel sheets/strips — a hotly litigated import category (Indian Kanoon)",
      gradeSpec: {
        grade: "27CG120 / 30G130",
        dimensions: "sheet/strip",
        material: "CRGO electrical steel",
      },
      hsCodes: ["7225.11", "7225.19"],
      notes: "Flagged edge case: CRGO is a hotly litigated import category.",
      isStandards: { connect: [{ id: IS_1666_ID }] },
    },
  });

  // Fastener QCO item.
  await prisma.qCOItem.upsert({
    where: { id: QCOITEM_FASTENERS_ID },
    update: {
      qcoId: QCO_FASTENERS_ID,
      productName: "Hexagon Head Bolts, Screws, Nuts and Washers",
      productDescription:
        "Industrial fasteners conforming to IS 1367 technical supply conditions",
      gradeSpec: {
        grade: "Property Class 8.8",
        dimensions: "M6-M48",
        material: "carbon/alloy steel",
      },
      hsCodes: ["7318.15", "7318.16", "7318.24"],
      isStandards: { set: [{ id: IS_1367_ID }] },
    },
    create: {
      id: QCOITEM_FASTENERS_ID,
      qcoId: QCO_FASTENERS_ID,
      productName: "Hexagon Head Bolts, Screws, Nuts and Washers",
      productDescription:
        "Industrial fasteners conforming to IS 1367 technical supply conditions",
      gradeSpec: {
        grade: "Property Class 8.8",
        dimensions: "M6-M48",
        material: "carbon/alloy steel",
      },
      hsCodes: ["7318.15", "7318.16", "7318.24"],
      isStandards: { connect: [{ id: IS_1367_ID }] },
    },
  });

  // --- QCOItems added in Task 10 (expanded seed dataset) -------------------
  // Galvanised steel sheets (HS 7212.xx) — distinct 4-digit prefix from the
  // existing structural/HR/CRGO items so there is no cross-matching ambiguity.
  await prisma.qCOItem.upsert({
    where: { id: QCOITEM_STEEL_GALV_ID },
    update: {
      qcoId: QCO_STEEL_ID,
      productName: "Galvanised Carbon Steel Sheets and Strips",
      productDescription:
        "Plain/corrugated galvanised sheets conforming to IS 277",
      gradeSpec: {
        grade: "Zn275",
        dimensions: "sheet/strip",
        material: "galvanised carbon steel",
      },
      hsCodes: ["7212.20", "7212.30"],
      isStandards: { set: [{ id: IS_277_ID }] },
    },
    create: {
      id: QCOITEM_STEEL_GALV_ID,
      qcoId: QCO_STEEL_ID,
      productName: "Galvanised Carbon Steel Sheets and Strips",
      productDescription:
        "Plain/corrugated galvanised sheets conforming to IS 277",
      gradeSpec: {
        grade: "Zn275",
        dimensions: "sheet/strip",
        material: "galvanised carbon steel",
      },
      hsCodes: ["7212.20", "7212.30"],
      isStandards: { connect: [{ id: IS_277_ID }] },
    },
  });

  // Carbon steel wire rods (HS 7213.10) — another distinct product class.
  await prisma.qCOItem.upsert({
    where: { id: QCOITEM_STEEL_WIRE_ID },
    update: {
      qcoId: QCO_STEEL_ID,
      productName: "Carbon Steel Wire Rods",
      productDescription: "Wire rods conforming to IS 7887",
      gradeSpec: {
        grade: "SWR1",
        dimensions: "rods 5.5-20mm",
        material: "carbon steel wire rod",
      },
      hsCodes: ["7213.10"],
      isStandards: { set: [{ id: IS_7887_ID }] },
    },
    create: {
      id: QCOITEM_STEEL_WIRE_ID,
      qcoId: QCO_STEEL_ID,
      productName: "Carbon Steel Wire Rods",
      productDescription: "Wire rods conforming to IS 7887",
      gradeSpec: {
        grade: "SWR1",
        dimensions: "rods 5.5-20mm",
        material: "carbon steel wire rod",
      },
      hsCodes: ["7213.10"],
      isStandards: { connect: [{ id: IS_7887_ID }] },
    },
  });

  // --- Enforcement Circulars (the customs effective-date instrument) -------
  await prisma.enforcementCircular.upsert({
    where: { id: EC_STEEL_ID },
    update: {
      qcoId: QCO_STEEL_ID,
      circularReference:
        "VERIFY: CBIC Circular No. XX/2020-Customs — confirm exact number during curation",
      circularDate: STEEL_QCO_DATE,
      effectiveDate: STEEL_QCO_DATE,
      notes:
        "CBIC circular operationalizing the Steel QCO 2020 effective date at customs.",
    },
    create: {
      id: EC_STEEL_ID,
      qcoId: QCO_STEEL_ID,
      circularReference:
        "VERIFY: CBIC Circular No. XX/2020-Customs — confirm exact number during curation",
      circularDate: STEEL_QCO_DATE,
      effectiveDate: STEEL_QCO_DATE,
      notes:
        "CBIC circular operationalizing the Steel QCO 2020 effective date at customs.",
    },
  });

  await prisma.enforcementCircular.upsert({
    where: { id: EC_FASTENERS_ID },
    update: {
      qcoId: QCO_FASTENERS_ID,
      circularReference:
        "VERIFY: CBIC Circular No. XX/20XX-Customs — confirm exact number during curation",
      notes:
        "CBIC circular operationalizing the fasteners QCO effective date at customs.",
    },
    create: {
      id: EC_FASTENERS_ID,
      qcoId: QCO_FASTENERS_ID,
      circularReference:
        "VERIFY: CBIC Circular No. XX/20XX-Customs — confirm exact number during curation",
      notes:
        "CBIC circular operationalizing the fasteners QCO effective date at customs.",
    },
  });

  // --- Transitional Arrangements (one-to-one with circulars) --------------
  await prisma.transitionalArrangement.upsert({
    where: { enforcementCircularId: EC_STEEL_ID },
    update: {
      enforcementCircularId: EC_STEEL_ID,
      triggerDateType: "BILL_OF_LADING",
      gracePeriodDays: 90,
      conditionText:
        "VERIFY: Shipments with Bill of Lading dated on or before effective date + 90 days are exempt from BIS certification (confirm exact grace wording).",
      effectiveFrom: STEEL_QCO_DATE,
    },
    create: {
      id: TA_STEEL_ID,
      enforcementCircularId: EC_STEEL_ID,
      triggerDateType: "BILL_OF_LADING",
      gracePeriodDays: 90,
      conditionText:
        "VERIFY: Shipments with Bill of Lading dated on or before effective date + 90 days are exempt from BIS certification (confirm exact grace wording).",
      effectiveFrom: STEEL_QCO_DATE,
    },
  });

  await prisma.transitionalArrangement.upsert({
    where: { enforcementCircularId: EC_FASTENERS_ID },
    update: {
      enforcementCircularId: EC_FASTENERS_ID,
      triggerDateType: "CLEARANCE_DATE",
      gracePeriodDays: 60,
      conditionText:
        "VERIFY: grace window keyed off clearance date (confirm exact wording).",
    },
    create: {
      id: TA_FASTENERS_ID,
      enforcementCircularId: EC_FASTENERS_ID,
      triggerDateType: "CLEARANCE_DATE",
      gracePeriodDays: 60,
      conditionText:
        "VERIFY: grace window keyed off clearance date (confirm exact wording).",
    },
  });

  // --- Exemptions ----------------------------------------------------------
  await prisma.exemption.upsert({
    where: { id: EX_STEEL_MSME_ID },
    update: {
      qcoId: QCO_STEEL_ID,
      type: "MSME_PHASED",
      description:
        "MSME-phased compliance timeline for small-scale manufacturers (VERIFY: exact phasing dates).",
      conditions: {
        appliesTo: "MSME-registered manufacturers",
        phaseEnd: "VERIFY",
      },
      effectiveFrom: STEEL_QCO_DATE,
    },
    create: {
      id: EX_STEEL_MSME_ID,
      qcoId: QCO_STEEL_ID,
      type: "MSME_PHASED",
      description:
        "MSME-phased compliance timeline for small-scale manufacturers (VERIFY: exact phasing dates).",
      conditions: {
        appliesTo: "MSME-registered manufacturers",
        phaseEnd: "VERIFY",
      },
      effectiveFrom: STEEL_QCO_DATE,
    },
  });

  // END_USE exemption (Task 10 expanded seed) — an edge-case carve-out for
  // fasteners imported for a specific end use. Linked to the fasteners QCO so
  // the steel QCO's exemption ordering (seed test asserts [0] is MSME_PHASED)
  // is unchanged.
  await prisma.exemption.upsert({
    where: { id: EX_FASTENERS_ENDUSE_ID },
    update: {
      qcoId: QCO_FASTENERS_ID,
      type: "END_USE",
      description:
        "End-use exemption for fasteners imported as capital-goods project supplies (VERIFY: exact wording).",
      conditions: { endUse: "capital goods" },
    },
    create: {
      id: EX_FASTENERS_ENDUSE_ID,
      qcoId: QCO_FASTENERS_ID,
      type: "END_USE",
      description:
        "End-use exemption for fasteners imported as capital-goods project supplies (VERIFY: exact wording).",
      conditions: { endUse: "capital goods" },
    },
  });
}

const prisma = new PrismaClient();

async function main() {
  await seedAuth(prisma);
  await seedRules(prisma);

  console.log("Seeded auth + tenancy + rule knowledge base:");
  console.log("  ADMIN  admin@qcocheck.local / Admin@123  (no firm)");
  console.log(
    "  USER   asha@acme.in / User@123           -> Acme Steel Imports Pvt Ltd",
  );
  console.log(
    "  USER   rahul@bharat.in / User@123        -> Bharat Customs Brokers",
  );
  console.log("  Rules: Steel QCO 2020 (E250, HR sheet, CRGO) + Fasteners QCO");
  console.log(
    "  Circulars + transitional arrangements + MSME exemption seeded",
  );
  console.log("  (Gazette refs / exact dates marked VERIFY pending curation)");
}

// Only run as a script, not when imported by tests. tsx runs this file as
// CommonJS (package.json has no "type": "module"), so `require.main === module`
// reliably distinguishes direct execution from an import.
if (require.main === module) {
  main()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}

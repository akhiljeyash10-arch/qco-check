"use server";

/**
 * Admin rule-editor server actions.
 *
 * All actions:
 *  - Require an ADMIN session (401/403 guards).
 *  - Write an AuditLog entry (actorUserId, action, entity, before/after).
 *  - Enforce QCO immutability: a PUBLISHED QCO cannot be mutated — edits
 *    create a new version row (incremented `version`, same logical identity via
 *    supersession). The DRAFT → PUBLISHED → SUPERSEDED/IN_ABEYANCE lifecycle
 *    is enforced server-side.
 *  - `firmId` is derived from the session; never accepted from the client.
 *
 * Validation is intentionally minimal (required fields checked) and will be
 * reinforced by the UI forms; server-side validation adds the defensive layer.
 */

import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { Prisma, type QcoStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Auth guard helper
// ---------------------------------------------------------------------------

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) throw new Error("Unauthenticated");
  if (user.role !== "ADMIN") throw new Error("Forbidden: ADMIN role required");
  return user;
}

// ---------------------------------------------------------------------------
// Audit log helper
// ---------------------------------------------------------------------------

async function writeAuditLog(
  actorUserId: string,
  action: string,
  entity: string,
  entityId: string,
  before: unknown,
  after: unknown,
) {
  await prisma.auditLog.create({
    data: {
      actorUserId,
      action,
      entity,
      entityId,
      before: before ? (before as Prisma.InputJsonValue) : undefined,
      after: after ? (after as Prisma.InputJsonValue) : undefined,
    },
  });
}

// ---------------------------------------------------------------------------
// Action result type
// ---------------------------------------------------------------------------

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// QCO actions
// ---------------------------------------------------------------------------

export interface CreateQcoInput {
  title: string;
  issuingAuthority: string;
  gazetteReference: string;
  notificationDate?: string; // ISO string or ""
  effectiveFrom?: string;
  sourceUrl?: string;
  notes?: string;
}

export async function createQco(
  input: CreateQcoInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAdmin();
    if (!input.title.trim()) return { ok: false, error: "Title is required." };
    if (!input.issuingAuthority.trim()) return { ok: false, error: "Issuing authority is required." };
    if (!input.gazetteReference.trim()) return { ok: false, error: "Gazette reference is required." };

    const qco = await prisma.qCO.create({
      data: {
        title: input.title.trim(),
        issuingAuthority: input.issuingAuthority.trim(),
        gazetteReference: input.gazetteReference.trim(),
        notificationDate: input.notificationDate ? new Date(input.notificationDate) : null,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
        sourceUrl: input.sourceUrl?.trim() || null,
        notes: input.notes?.trim() || null,
        curatedBy: user.id,
        status: "DRAFT",
        version: 1,
      },
    });

    await writeAuditLog(user.id, "CREATE", "QCO", qco.id, null, qco);
    return { ok: true, data: { id: qco.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export interface UpdateQcoInput {
  id: string;
  title?: string;
  issuingAuthority?: string;
  gazetteReference?: string;
  notificationDate?: string;
  effectiveFrom?: string;
  sourceUrl?: string;
  notes?: string;
}

/**
 * Update a DRAFT QCO. If the QCO is PUBLISHED, this action is rejected —
 * edits must go through `createQcoVersion` which creates a new version row.
 */
export async function updateQco(
  input: UpdateQcoInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAdmin();
    const existing = await prisma.qCO.findUnique({ where: { id: input.id } });
    if (!existing) return { ok: false, error: "QCO not found." };
    if (existing.status !== "DRAFT") {
      return {
        ok: false,
        error: `Cannot edit a ${existing.status} QCO. Create a new version instead.`,
      };
    }

    const updated = await prisma.qCO.update({
      where: { id: input.id },
      data: {
        title: input.title?.trim() ?? existing.title,
        issuingAuthority: input.issuingAuthority?.trim() ?? existing.issuingAuthority,
        gazetteReference: input.gazetteReference?.trim() ?? existing.gazetteReference,
        notificationDate: input.notificationDate
          ? new Date(input.notificationDate)
          : existing.notificationDate,
        effectiveFrom: input.effectiveFrom
          ? new Date(input.effectiveFrom)
          : existing.effectiveFrom,
        sourceUrl: input.sourceUrl?.trim() ?? existing.sourceUrl,
        notes: input.notes?.trim() ?? existing.notes,
        curatedBy: user.id,
      },
    });

    await writeAuditLog(user.id, "UPDATE", "QCO", input.id, existing, updated);
    return { ok: true, data: { id: updated.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

/**
 * Create a new version of a QCO (immutability: PUBLISHED QCOs cannot be
 * mutated). The existing QCO is NOT changed; a new row is created with
 * `version = existing.version + 1` and `status = DRAFT`. The caller must
 * separately change the old QCO's status to SUPERSEDED once the new version
 * is published.
 */
export async function createQcoVersion(
  existingId: string,
  overrides: Partial<CreateQcoInput>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAdmin();
    const existing = await prisma.qCO.findUnique({ where: { id: existingId } });
    if (!existing) return { ok: false, error: "QCO not found." };

    const newQco = await prisma.qCO.create({
      data: {
        title: overrides.title?.trim() ?? existing.title,
        issuingAuthority: overrides.issuingAuthority?.trim() ?? existing.issuingAuthority,
        gazetteReference: overrides.gazetteReference?.trim() ?? existing.gazetteReference,
        notificationDate: overrides.notificationDate
          ? new Date(overrides.notificationDate)
          : existing.notificationDate,
        effectiveFrom: overrides.effectiveFrom
          ? new Date(overrides.effectiveFrom)
          : existing.effectiveFrom,
        sourceUrl: overrides.sourceUrl?.trim() ?? existing.sourceUrl,
        notes: overrides.notes?.trim() ?? existing.notes,
        curatedBy: user.id,
        status: "DRAFT",
        version: existing.version + 1,
      },
    });

    await writeAuditLog(
      user.id,
      "CREATE_VERSION",
      "QCO",
      newQco.id,
      { sourceId: existingId },
      newQco,
    );
    return { ok: true, data: { id: newQco.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

/** Change a QCO's status. PUBLISHED → SUPERSEDED requires the superseding QCO id. */
export async function changeQcoStatus(
  id: string,
  newStatus: QcoStatus,
  supersededById?: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAdmin();
    const existing = await prisma.qCO.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "QCO not found." };

    // Guard illegal transitions.
    const allowed: Record<QcoStatus, QcoStatus[]> = {
      DRAFT: ["PUBLISHED"],
      PUBLISHED: ["SUPERSEDED", "IN_ABEYANCE"],
      IN_ABEYANCE: ["PUBLISHED", "SUPERSEDED"],
      SUPERSEDED: [],
    };
    if (!allowed[existing.status].includes(newStatus)) {
      return {
        ok: false,
        error: `Transition ${existing.status} → ${newStatus} is not allowed.`,
      };
    }
    if (newStatus === "SUPERSEDED" && !supersededById) {
      return {
        ok: false,
        error: "supersededById is required when marking a QCO as SUPERSEDED.",
      };
    }

    const updated = await prisma.qCO.update({
      where: { id },
      data: {
        status: newStatus,
        supersededById: supersededById ?? existing.supersededById,
      },
    });

    await writeAuditLog(
      user.id,
      `STATUS_CHANGE:${existing.status}->${newStatus}`,
      "QCO",
      id,
      { status: existing.status },
      { status: newStatus },
    );
    return { ok: true, data: { id: updated.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// ISStandard actions
// ---------------------------------------------------------------------------

export interface CreateISStandardInput {
  isNumber: string;
  title: string;
  versionYear?: number | null;
  notes?: string;
}

export async function createISStandard(
  input: CreateISStandardInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAdmin();
    if (!input.isNumber.trim()) return { ok: false, error: "IS number is required." };
    if (!input.title.trim()) return { ok: false, error: "Title is required." };

    const is = await prisma.iSStandard.create({
      data: {
        isNumber: input.isNumber.trim(),
        title: input.title.trim(),
        versionYear: input.versionYear ?? null,
        notes: input.notes?.trim() || null,
      },
    });

    await writeAuditLog(user.id, "CREATE", "ISStandard", is.id, null, is);
    return { ok: true, data: { id: is.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("Unique constraint")) {
      return { ok: false, error: "An IS standard with this number already exists." };
    }
    return { ok: false, error: msg };
  }
}

export async function updateISStandard(
  id: string,
  input: Partial<CreateISStandardInput>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAdmin();
    const existing = await prisma.iSStandard.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "IS standard not found." };

    const updated = await prisma.iSStandard.update({
      where: { id },
      data: {
        isNumber: input.isNumber?.trim() ?? existing.isNumber,
        title: input.title?.trim() ?? existing.title,
        versionYear: input.versionYear !== undefined ? input.versionYear : existing.versionYear,
        notes: input.notes?.trim() ?? existing.notes,
      },
    });

    await writeAuditLog(user.id, "UPDATE", "ISStandard", id, existing, updated);
    return { ok: true, data: { id: updated.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// QCOItem actions
// ---------------------------------------------------------------------------

export interface GradeSpec {
  grade?: string;
  dimensions?: string;
  material?: string;
}

export interface CreateQcoItemInput {
  qcoId: string;
  productName: string;
  productDescription?: string;
  gradeSpec: GradeSpec;
  hsCodes?: string[];
  isStandardIds?: string[];
  notes?: string;
}

export async function createQcoItem(
  input: CreateQcoItemInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAdmin();
    if (!input.qcoId) return { ok: false, error: "QCO is required." };
    if (!input.productName.trim()) return { ok: false, error: "Product name is required." };

    // Verify QCO is not SUPERSEDED (can't add items to a superseded QCO).
    const qco = await prisma.qCO.findUnique({ where: { id: input.qcoId } });
    if (!qco) return { ok: false, error: "QCO not found." };
    if (qco.status === "SUPERSEDED") {
      return { ok: false, error: "Cannot add items to a SUPERSEDED QCO." };
    }

    const item = await prisma.qCOItem.create({
      data: {
        qcoId: input.qcoId,
        productName: input.productName.trim(),
        productDescription: input.productDescription?.trim() || null,
        gradeSpec: input.gradeSpec as Prisma.InputJsonValue,
        hsCodes: (input.hsCodes ?? []) as Prisma.InputJsonValue,
        notes: input.notes?.trim() || null,
        isStandards: input.isStandardIds?.length
          ? { connect: input.isStandardIds.map((sid) => ({ id: sid })) }
          : undefined,
      },
    });

    await writeAuditLog(user.id, "CREATE", "QCOItem", item.id, null, item);
    return { ok: true, data: { id: item.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function updateQcoItem(
  id: string,
  input: Partial<CreateQcoItemInput>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAdmin();
    const existing = await prisma.qCOItem.findUnique({
      where: { id },
      include: { isStandards: true },
    });
    if (!existing) return { ok: false, error: "QCO item not found." };

    const updated = await prisma.qCOItem.update({
      where: { id },
      data: {
        productName: input.productName?.trim() ?? existing.productName,
        productDescription: input.productDescription?.trim() ?? existing.productDescription,
        gradeSpec: input.gradeSpec
          ? (input.gradeSpec as Prisma.InputJsonValue)
          : (existing.gradeSpec as Prisma.InputJsonValue ?? {}),
        hsCodes: input.hsCodes
          ? (input.hsCodes as Prisma.InputJsonValue)
          : (existing.hsCodes as Prisma.InputJsonValue ?? []),
        notes: input.notes?.trim() ?? existing.notes,
        isStandards: input.isStandardIds
          ? { set: input.isStandardIds.map((sid) => ({ id: sid })) }
          : undefined,
      },
    });

    await writeAuditLog(user.id, "UPDATE", "QCOItem", id, existing, updated);
    return { ok: true, data: { id: updated.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// EnforcementCircular actions
// ---------------------------------------------------------------------------

export interface CreateEnforcementCircularInput {
  qcoId: string;
  circularReference: string;
  circularDate?: string;
  effectiveDate?: string;
  notes?: string;
}

export async function createEnforcementCircular(
  input: CreateEnforcementCircularInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAdmin();
    if (!input.qcoId) return { ok: false, error: "QCO is required." };
    if (!input.circularReference.trim()) {
      return { ok: false, error: "Circular reference is required." };
    }

    const ec = await prisma.enforcementCircular.create({
      data: {
        qcoId: input.qcoId,
        circularReference: input.circularReference.trim(),
        circularDate: input.circularDate ? new Date(input.circularDate) : null,
        effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : null,
        notes: input.notes?.trim() || null,
      },
    });

    await writeAuditLog(user.id, "CREATE", "EnforcementCircular", ec.id, null, ec);
    return { ok: true, data: { id: ec.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function updateEnforcementCircular(
  id: string,
  input: Partial<CreateEnforcementCircularInput>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAdmin();
    const existing = await prisma.enforcementCircular.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Enforcement circular not found." };

    const updated = await prisma.enforcementCircular.update({
      where: { id },
      data: {
        circularReference: input.circularReference?.trim() ?? existing.circularReference,
        circularDate: input.circularDate ? new Date(input.circularDate) : existing.circularDate,
        effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : existing.effectiveDate,
        notes: input.notes?.trim() ?? existing.notes,
      },
    });

    await writeAuditLog(user.id, "UPDATE", "EnforcementCircular", id, existing, updated);
    return { ok: true, data: { id: updated.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// TransitionalArrangement actions
// ---------------------------------------------------------------------------

export interface CreateTransitionalArrangementInput {
  enforcementCircularId: string;
  triggerDateType: "BILL_OF_LADING" | "CLEARANCE_DATE" | "BILL_OF_ENTRY" | "IMPORT_DATE";
  gracePeriodDays: number;
  conditionText?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export async function createTransitionalArrangement(
  input: CreateTransitionalArrangementInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAdmin();
    if (!input.enforcementCircularId) {
      return { ok: false, error: "Enforcement circular is required." };
    }
    if (input.gracePeriodDays < 0) {
      return { ok: false, error: "Grace period must be 0 or more days." };
    }

    // Check one-to-one: a circular can only have one transitional arrangement.
    const existing = await prisma.transitionalArrangement.findUnique({
      where: { enforcementCircularId: input.enforcementCircularId },
    });
    if (existing) {
      return {
        ok: false,
        error: "This enforcement circular already has a transitional arrangement.",
      };
    }

    const ta = await prisma.transitionalArrangement.create({
      data: {
        enforcementCircularId: input.enforcementCircularId,
        triggerDateType: input.triggerDateType,
        gracePeriodDays: input.gracePeriodDays,
        conditionText: input.conditionText?.trim() || null,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      },
    });

    await writeAuditLog(user.id, "CREATE", "TransitionalArrangement", ta.id, null, ta);
    return { ok: true, data: { id: ta.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function updateTransitionalArrangement(
  id: string,
  input: Partial<CreateTransitionalArrangementInput>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAdmin();
    const existing = await prisma.transitionalArrangement.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Transitional arrangement not found." };

    const updated = await prisma.transitionalArrangement.update({
      where: { id },
      data: {
        triggerDateType: input.triggerDateType ?? existing.triggerDateType,
        gracePeriodDays: input.gracePeriodDays ?? existing.gracePeriodDays,
        conditionText: input.conditionText?.trim() ?? existing.conditionText,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : existing.effectiveFrom,
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : existing.effectiveTo,
      },
    });

    await writeAuditLog(
      user.id,
      "UPDATE",
      "TransitionalArrangement",
      id,
      existing,
      updated,
    );
    return { ok: true, data: { id: updated.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Exemption actions
// ---------------------------------------------------------------------------

export interface CreateExemptionInput {
  qcoId: string;
  type: "MSME_PHASED" | "END_USE" | "NOT_DOMESTICALLY_AVAILABLE" | "ABEYANCE" | "DEFERRED";
  description: string;
  conditions?: Record<string, unknown>;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export async function createExemption(
  input: CreateExemptionInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAdmin();
    if (!input.qcoId) return { ok: false, error: "QCO is required." };
    if (!input.description.trim()) return { ok: false, error: "Description is required." };

    const ex = await prisma.exemption.create({
      data: {
        qcoId: input.qcoId,
        type: input.type,
        description: input.description.trim(),
        conditions: input.conditions
          ? (input.conditions as Prisma.InputJsonValue)
          : undefined,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      },
    });

    await writeAuditLog(user.id, "CREATE", "Exemption", ex.id, null, ex);
    return { ok: true, data: { id: ex.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function updateExemption(
  id: string,
  input: Partial<CreateExemptionInput>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAdmin();
    const existing = await prisma.exemption.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Exemption not found." };

    const updated = await prisma.exemption.update({
      where: { id },
      data: {
        type: input.type ?? existing.type,
        description: input.description?.trim() ?? existing.description,
        conditions: input.conditions
          ? (input.conditions as Prisma.InputJsonValue)
          : existing.conditions ?? Prisma.JsonNull,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : existing.effectiveFrom,
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : existing.effectiveTo,
      },
    });

    await writeAuditLog(user.id, "UPDATE", "Exemption", id, existing, updated);
    return { ok: true, data: { id: updated.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Audit log read (admin-only)
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  at: Date;
}

export async function getAuditLog(
  entity?: string,
  entityId?: string,
  limit = 50,
): Promise<ActionResult<AuditLogEntry[]>> {
  try {
    await requireAdmin();
    const logs = await prisma.auditLog.findMany({
      where: {
        entity: entity ?? undefined,
        entityId: entityId ?? undefined,
      },
      include: { actorUser: { select: { email: true } } },
      orderBy: { at: "desc" },
      take: limit,
    });

    return {
      ok: true,
      data: logs.map((l) => ({
        id: l.id,
        actorUserId: l.actorUserId,
        actorEmail: l.actorUser?.email ?? null,
        action: l.action,
        entity: l.entity,
        entityId: l.entityId,
        before: l.before,
        after: l.after,
        at: l.at,
      })),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Read helpers used by server components
// ---------------------------------------------------------------------------

export async function getQcos() {
  await requireAdmin();
  return prisma.qCO.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { qcoItems: true, enforcementCirculars: true, exemptions: true } },
    },
  });
}

export async function getQco(id: string) {
  await requireAdmin();
  return prisma.qCO.findUnique({
    where: { id },
    include: {
      qcoItems: { include: { isStandards: true } },
      enforcementCirculars: { include: { transitionalArrangement: true } },
      exemptions: true,
    },
  });
}

export async function getISStandards() {
  await requireAdmin();
  return prisma.iSStandard.findMany({ orderBy: { isNumber: "asc" } });
}

export async function getISStandard(id: string) {
  await requireAdmin();
  return prisma.iSStandard.findUnique({
    where: { id },
    include: { qcoItems: { include: { qco: true } } },
  });
}


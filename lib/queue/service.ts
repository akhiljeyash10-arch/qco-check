import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

/**
 * Admin review-queue service — the human-in-the-loop layer (Task 9).
 *
 * The review queue closes the loop on Amber (low-confidence) determinations:
 *
 *  1. When an Amber determination is created (single-check or batch), it is
 *     routed to the review queue via {@link routeAmberDeterminationToQueue},
 *     which creates a `ReviewQueueItem` (status PENDING) linked one-to-one to
 *     the determination.
 *  2. An admin lists pending cases across ALL firms (admin bypasses firm
 *     scoping) via {@link listPendingReviewQueue}.
 *  3. The admin resolves a case — sets a final verdict + notes — which moves
 *     the determination PENDING_REVIEW → RESOLVED and the queue item → RESOLVED
 *     ({@link resolveAmberCase}).
 *  4. The admin may promote the case into a rule: a new QCOItem is created
 *     prefilled from the case input and linked back via
 *     `ReviewQueueItem.promotedQcoItemId`; the queue item → PROMOTED
 *     ({@link promoteToRule}). Future identical queries now match the new
 *     QCOItem and return a confident GREEN/RED (no longer Amber).
 *
 * All write operations write an AuditLog entry (actorUserId, action, entity,
 * before/after). The service functions take an explicit `admin: SessionUser`
 * (derived from the session in the server-action layer) so they are testable
 * directly against the seeded DB, and `assertAdmin` provides defense-in-depth
 * authorization (non-admins are rejected).
 *
 * @module lib/queue/service
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The final verdict an admin assigns when resolving an Amber case. */
export type ResolutionVerdict = "GREEN" | "RED";

/** Result of an admin action (mirrors the rule-editor ActionResult shape). */
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Input for promoting an Amber case into a new QCOItem. */
export interface PromoteQcoItemInput {
  qcoId: string;
  productName: string;
  productDescription?: string;
  gradeSpec: { grade?: string; dimensions?: string; material?: string };
  hsCodes?: string[];
  isStandardIds?: string[];
  notes?: string;
}

/** A pending review-queue entry (the admin queue list row). */
export interface ReviewQueueEntry {
  id: string;
  determinationId: string;
  status: string;
  firmId: string;
  firmName: string;
  userEmail: string;
  verdict: string;
  isNumber: string | null;
  hsCode: string;
  grade: string | null;
  productType: string | null;
  confidence: number;
  createdAt: Date;
}

/** A full review-case detail (the case detail page). */
export interface ReviewCaseDetail {
  determinationId: string;
  status: string;
  verdict: string;
  confidence: number;
  isNumber: string | null;
  gazetteReference: string | null;
  circularReference: string | null;
  transitionalStatus: string | null;
  input: Record<string, unknown>;
  reasoningTrace: unknown;
  createdAt: Date;
  resolvedAt: Date | null;
  firmName: string;
  userEmail: string;
  queueItem: {
    id: string;
    status: string;
    resolutionVerdict: string | null;
    adminNotes: string | null;
    promotedQcoItemId: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep-clone a value into a JSON-safe form for Prisma JSONB columns. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Defense-in-depth authorization guard. The server-action layer enforces the
 * ADMIN role via the session; this re-checks it so the service is safe to call
 * directly (and so authorization is unit-testable without the HTTP layer).
 *
 * @throws when `admin` is not an ADMIN role user.
 */
export function assertAdmin(admin: SessionUser): void {
  if (admin.role !== "ADMIN") {
    throw new Error("Forbidden: ADMIN role required");
  }
}

/** Read the `hsCode` from a stored determination `input` JSONB payload. */
function inputHsCode(input: unknown): string {
  if (input && typeof input === "object") {
    const v = (input as Record<string, unknown>).hsCode;
    if (typeof v === "string") return v;
  }
  return "";
}

/** Read a nullable string field from a stored determination `input`. */
function inputString(input: unknown, key: string): string | null {
  if (input && typeof input === "object") {
    const v = (input as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Routing — Amber determination → review queue
// ---------------------------------------------------------------------------

/**
 * Route an Amber determination to the review queue by creating a `ReviewQueueItem`
 * (status PENDING) linked one-to-one to the determination. Idempotent: if a queue
 * item already exists for this determination, it is left untouched.
 *
 * Called by the single-check and batch services when the engine returns AMBER
 * (determination status PENDING_REVIEW).
 */
export async function routeAmberDeterminationToQueue(
  determinationId: string,
): Promise<void> {
  await prisma.reviewQueueItem.upsert({
    where: { determinationId },
    update: {},
    create: { determinationId, status: "PENDING" },
  });
}

// ---------------------------------------------------------------------------
// Read helpers (admin-only; authorization enforced by the action layer)
// ---------------------------------------------------------------------------

/**
 * List all PENDING review-queue items across ALL firms (admin bypasses firm
 * scoping). Ordered oldest-first so the oldest Amber cases surface first.
 */
export async function listPendingReviewQueue(): Promise<ReviewQueueEntry[]> {
  const items = await prisma.reviewQueueItem.findMany({
    where: { status: "PENDING" },
    include: {
      determination: {
        include: {
          firm: { select: { name: true } },
          user: { select: { email: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return items.map((item) => {
    const det = item.determination;
    return {
      id: item.id,
      determinationId: det.id,
      status: item.status,
      firmId: det.firmId,
      firmName: det.firm.name,
      userEmail: det.user.email,
      verdict: det.verdict,
      isNumber: det.isNumber,
      hsCode: inputHsCode(det.input),
      grade: inputString(det.input, "grade"),
      productType: inputString(det.input, "productType"),
      confidence: det.confidence,
      createdAt: item.createdAt,
    };
  });
}

/**
 * Load the full review-case detail (determination + review-queue item + firm +
 * user) for the case detail page.
 *
 * @returns `null` when the determination does not exist.
 */
export async function getReviewCase(
  determinationId: string,
): Promise<ReviewCaseDetail | null> {
  const det = await prisma.determination.findUnique({
    where: { id: determinationId },
    include: {
      firm: { select: { name: true } },
      user: { select: { email: true } },
      reviewQueueItem: true,
    },
  });
  if (!det) return null;

  return {
    determinationId: det.id,
    status: det.status,
    verdict: det.verdict,
    confidence: det.confidence,
    isNumber: det.isNumber,
    gazetteReference: det.gazetteReference,
    circularReference: det.circularReference,
    transitionalStatus: det.transitionalStatus,
    input: det.input as Record<string, unknown>,
    reasoningTrace: det.reasoningTrace,
    createdAt: det.createdAt,
    resolvedAt: det.resolvedAt,
    firmName: det.firm.name,
    userEmail: det.user.email,
    queueItem: det.reviewQueueItem
      ? {
          id: det.reviewQueueItem.id,
          status: det.reviewQueueItem.status,
          resolutionVerdict: det.reviewQueueItem.resolutionVerdict,
          adminNotes: det.reviewQueueItem.adminNotes,
          promotedQcoItemId: det.reviewQueueItem.promotedQcoItemId,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Resolve — admin finalizes an Amber case's verdict
// ---------------------------------------------------------------------------

/**
 * Resolve an Amber determination: the admin sets a final verdict + notes,
 * moving the determination PENDING_REVIEW → RESOLVED (with resolvedAt +
 * resolvedByAdminId) and the review-queue item → RESOLVED (with
 * resolutionVerdict + adminNotes + resolvedAt). An AuditLog entry is written
 * capturing the before/after state.
 *
 * The three writes are wrapped in a transaction so the determination and its
 * queue item never diverge.
 *
 * @param determinationId   The Amber determination to resolve.
 * @param admin             The session-derived admin user (must be ADMIN).
 * @param resolutionVerdict  The admin's final verdict (GREEN or RED).
 * @param adminNotes        Free-text notes explaining the resolution.
 */
export async function resolveAmberCase(
  determinationId: string,
  admin: SessionUser,
  resolutionVerdict: ResolutionVerdict,
  adminNotes: string,
): Promise<ActionResult<{ determinationId: string }>> {
  assertAdmin(admin);

  const determination = await prisma.determination.findUnique({
    where: { id: determinationId },
    include: { reviewQueueItem: true },
  });
  if (!determination) {
    return { ok: false, error: "Determination not found." };
  }
  if (determination.status !== "PENDING_REVIEW") {
    return {
      ok: false,
      error: `Determination is not pending review (current status: ${determination.status}).`,
    };
  }
  if (!determination.reviewQueueItem) {
    return { ok: false, error: "No review queue item for this determination." };
  }

  const before = {
    determinationStatus: determination.status,
    queueStatus: determination.reviewQueueItem.status,
    resolutionVerdict: determination.reviewQueueItem.resolutionVerdict,
  };
  const after = {
    determinationStatus: "RESOLVED",
    queueStatus: "RESOLVED",
    resolutionVerdict,
    adminNotes: adminNotes || null,
    resolvedByAdminId: admin.id,
  };

  await prisma.$transaction([
    prisma.determination.update({
      where: { id: determinationId },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolvedByAdminId: admin.id,
      },
    }),
    prisma.reviewQueueItem.update({
      where: { determinationId },
      data: {
        status: "RESOLVED",
        resolutionVerdict,
        adminNotes: adminNotes || null,
        resolvedAt: new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        actorUserId: admin.id,
        action: "RESOLVE",
        entity: "Determination",
        entityId: determinationId,
        before: toJson(before),
        after: toJson(after),
      },
    }),
  ]);

  return { ok: true, data: { determinationId } };
}

// ---------------------------------------------------------------------------
// Promote — admin turns a resolved Amber case into a rule
// ---------------------------------------------------------------------------

/**
 * Promote an Amber case into a new QCOItem, closing the human-in-the-loop loop.
 *
 * Creates a new QCOItem (prefilled from the case input by the admin), then links
 * it back: `ReviewQueueItem.promotedQcoItemId` is set and the queue item status
 * → PROMOTED; the determination's `promotionQcoItemId` is set too. AuditLog
 * entries are written for the QCOItem creation and the queue-item linking.
 *
 * After promotion, the same input re-evaluated by the engine finds the new
 * QCOItem and returns a confident GREEN/RED (no longer Amber).
 *
 * @param determinationId  The Amber determination being promoted.
 * @param admin            The session-derived admin user (must be ADMIN).
 * @param input            The new QCOItem payload (qcoId, productName, gradeSpec,
 *                        hsCodes, isStandardIds, notes).
 */
export async function promoteToRule(
  determinationId: string,
  admin: SessionUser,
  input: PromoteQcoItemInput,
): Promise<ActionResult<{ qcoItemId: string }>> {
  assertAdmin(admin);

  if (!input.qcoId) return { ok: false, error: "QCO is required." };
  if (!input.productName?.trim()) {
    return { ok: false, error: "Product name is required." };
  }

  const determination = await prisma.determination.findUnique({
    where: { id: determinationId },
    include: { reviewQueueItem: true },
  });
  if (!determination) {
    return { ok: false, error: "Determination not found." };
  }
  if (!determination.reviewQueueItem) {
    return { ok: false, error: "No review queue item for this determination." };
  }

  const qco = await prisma.qCO.findUnique({ where: { id: input.qcoId } });
  if (!qco) return { ok: false, error: "QCO not found." };
  if (qco.status === "SUPERSEDED") {
    return { ok: false, error: "Cannot add items to a SUPERSEDED QCO." };
  }

  const queueItem = determination.reviewQueueItem;
  const before = {
    queueStatus: queueItem.status,
    promotedQcoItemId: queueItem.promotedQcoItemId,
    promotionQcoItemId: determination.promotionQcoItemId,
  };

  // Use an interactive transaction: the created QCOItem id is needed to link the
  // queue item + determination and to record the audit entries atomically.
  const qcoItemId = await prisma.$transaction(async (tx) => {
    const created = await tx.qCOItem.create({
      data: {
        qcoId: input.qcoId,
        productName: input.productName.trim(),
        productDescription: input.productDescription?.trim() || null,
        gradeSpec: input.gradeSpec as Prisma.InputJsonValue,
        hsCodes: (input.hsCodes ?? []) as Prisma.InputJsonValue,
        notes: input.notes?.trim() || null,
        isStandards: input.isStandardIds?.length
          ? { connect: input.isStandardIds.map((id) => ({ id })) }
          : undefined,
      },
    });

    await tx.reviewQueueItem.update({
      where: { determinationId },
      data: {
        status: "PROMOTED",
        promotedQcoItemId: created.id,
        resolvedAt: new Date(),
      },
    });

    await tx.determination.update({
      where: { id: determinationId },
      data: { promotionQcoItemId: created.id },
    });

    const after = {
      queueStatus: "PROMOTED",
      promotedQcoItemId: created.id,
      promotionQcoItemId: created.id,
      sourceDeterminationId: determinationId,
    };

    // Audit: the QCOItem creation (the new rule born from this case).
    await tx.auditLog.create({
      data: {
        actorUserId: admin.id,
        action: "PROMOTE",
        entity: "QCOItem",
        entityId: created.id,
        // No prior state on a create — omit `before` (Prisma distinguishes
        // JSON null from an unset column via Prisma.JsonNull; a create has
        // no "before" state, so we leave it unset).
        after: toJson({
          ...created,
          sourceDeterminationId: determinationId,
        }),
      },
    });

    // Audit: the review-queue linking (the case → rule link).
    await tx.auditLog.create({
      data: {
        actorUserId: admin.id,
        action: "PROMOTE_LINK",
        entity: "ReviewQueueItem",
        entityId: queueItem.id,
        before: toJson(before),
        after: toJson(after),
      },
    });

    return created.id;
  });

  return { ok: true, data: { qcoItemId } };
}

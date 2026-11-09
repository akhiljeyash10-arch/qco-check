-- CreateEnum
CREATE TYPE "QcoStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'IN_ABEYANCE');

-- CreateEnum
CREATE TYPE "TriggerDateType" AS ENUM ('BILL_OF_LADING', 'CLEARANCE_DATE', 'BILL_OF_ENTRY', 'IMPORT_DATE');

-- CreateEnum
CREATE TYPE "ExemptionType" AS ENUM ('MSME_PHASED', 'END_USE', 'NOT_DOMESTICALLY_AVAILABLE', 'ABEYANCE', 'DEFERRED');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('GREEN', 'RED', 'AMBER');

-- CreateEnum
CREATE TYPE "DeterminationStatus" AS ENUM ('COMPLETED', 'PENDING_REVIEW', 'RESOLVED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReviewQueueStatus" AS ENUM ('PENDING', 'RESOLVED', 'PROMOTED');

-- CreateTable
CREATE TABLE "qcos" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issuingAuthority" TEXT NOT NULL,
    "gazetteReference" TEXT NOT NULL,
    "notificationDate" TIMESTAMP(3),
    "status" "QcoStatus" NOT NULL DEFAULT 'DRAFT',
    "supersededById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3),
    "sourceUrl" TEXT,
    "curatedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qcos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "is_standards" (
    "id" TEXT NOT NULL,
    "isNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "versionYear" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "is_standards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qco_items" (
    "id" TEXT NOT NULL,
    "qcoId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productDescription" TEXT,
    "gradeSpec" JSONB NOT NULL,
    "hsCodes" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qco_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enforcement_circulars" (
    "id" TEXT NOT NULL,
    "qcoId" TEXT NOT NULL,
    "circularReference" TEXT NOT NULL,
    "circularDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enforcement_circulars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transitional_arrangements" (
    "id" TEXT NOT NULL,
    "enforcementCircularId" TEXT NOT NULL,
    "triggerDateType" "TriggerDateType" NOT NULL,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 0,
    "conditionText" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transitional_arrangements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exemptions" (
    "id" TEXT NOT NULL,
    "qcoId" TEXT NOT NULL,
    "type" "ExemptionType" NOT NULL,
    "description" TEXT NOT NULL,
    "conditions" JSONB,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "determinations" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "batchId" TEXT,
    "input" JSONB NOT NULL,
    "qcoItemId" TEXT,
    "qcoId" TEXT,
    "enforcementCircularId" TEXT,
    "verdict" "Verdict" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isNumber" TEXT,
    "gazetteReference" TEXT,
    "circularReference" TEXT,
    "transitionalStatus" TEXT,
    "reasoningTrace" JSONB,
    "status" "DeterminationStatus" NOT NULL DEFAULT 'COMPLETED',
    "ruleVersionSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByAdminId" TEXT,
    "promotionQcoItemId" TEXT,

    CONSTRAINT "determinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "status" "BatchStatus" NOT NULL DEFAULT 'PROCESSING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_queue_items" (
    "id" TEXT NOT NULL,
    "determinationId" TEXT NOT NULL,
    "status" "ReviewQueueStatus" NOT NULL DEFAULT 'PENDING',
    "assignedAdminId" TEXT,
    "resolutionVerdict" "Verdict",
    "promotedQcoItemId" TEXT,
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "review_queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ISStandardToQCOItem" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ISStandardToQCOItem_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "qcos_status_idx" ON "qcos"("status");

-- CreateIndex
CREATE UNIQUE INDEX "is_standards_isNumber_key" ON "is_standards"("isNumber");

-- CreateIndex
CREATE INDEX "qco_items_qcoId_idx" ON "qco_items"("qcoId");

-- CreateIndex
CREATE INDEX "enforcement_circulars_qcoId_idx" ON "enforcement_circulars"("qcoId");

-- CreateIndex
CREATE UNIQUE INDEX "transitional_arrangements_enforcementCircularId_key" ON "transitional_arrangements"("enforcementCircularId");

-- CreateIndex
CREATE INDEX "exemptions_qcoId_idx" ON "exemptions"("qcoId");

-- CreateIndex
CREATE INDEX "determinations_firmId_idx" ON "determinations"("firmId");

-- CreateIndex
CREATE INDEX "determinations_userId_idx" ON "determinations"("userId");

-- CreateIndex
CREATE INDEX "determinations_batchId_idx" ON "determinations"("batchId");

-- CreateIndex
CREATE INDEX "determinations_verdict_idx" ON "determinations"("verdict");

-- CreateIndex
CREATE INDEX "batches_firmId_idx" ON "batches"("firmId");

-- CreateIndex
CREATE INDEX "batches_userId_idx" ON "batches"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "review_queue_items_determinationId_key" ON "review_queue_items"("determinationId");

-- CreateIndex
CREATE INDEX "review_queue_items_status_idx" ON "review_queue_items"("status");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_idx" ON "audit_logs"("actorUserId");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "_ISStandardToQCOItem_B_index" ON "_ISStandardToQCOItem"("B");

-- AddForeignKey
ALTER TABLE "qcos" ADD CONSTRAINT "qcos_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "qcos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qco_items" ADD CONSTRAINT "qco_items_qcoId_fkey" FOREIGN KEY ("qcoId") REFERENCES "qcos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enforcement_circulars" ADD CONSTRAINT "enforcement_circulars_qcoId_fkey" FOREIGN KEY ("qcoId") REFERENCES "qcos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transitional_arrangements" ADD CONSTRAINT "transitional_arrangements_enforcementCircularId_fkey" FOREIGN KEY ("enforcementCircularId") REFERENCES "enforcement_circulars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exemptions" ADD CONSTRAINT "exemptions_qcoId_fkey" FOREIGN KEY ("qcoId") REFERENCES "qcos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "determinations" ADD CONSTRAINT "determinations_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "determinations" ADD CONSTRAINT "determinations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "determinations" ADD CONSTRAINT "determinations_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "determinations" ADD CONSTRAINT "determinations_qcoItemId_fkey" FOREIGN KEY ("qcoItemId") REFERENCES "qco_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "determinations" ADD CONSTRAINT "determinations_qcoId_fkey" FOREIGN KEY ("qcoId") REFERENCES "qcos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "determinations" ADD CONSTRAINT "determinations_enforcementCircularId_fkey" FOREIGN KEY ("enforcementCircularId") REFERENCES "enforcement_circulars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "determinations" ADD CONSTRAINT "determinations_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "determinations" ADD CONSTRAINT "determinations_promotionQcoItemId_fkey" FOREIGN KEY ("promotionQcoItemId") REFERENCES "qco_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_determinationId_fkey" FOREIGN KEY ("determinationId") REFERENCES "determinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_promotedQcoItemId_fkey" FOREIGN KEY ("promotedQcoItemId") REFERENCES "qco_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ISStandardToQCOItem" ADD CONSTRAINT "_ISStandardToQCOItem_A_fkey" FOREIGN KEY ("A") REFERENCES "is_standards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ISStandardToQCOItem" ADD CONSTRAINT "_ISStandardToQCOItem_B_fkey" FOREIGN KEY ("B") REFERENCES "qco_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

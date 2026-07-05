-- CreateEnum
CREATE TYPE "AuthorOrganizationCollaborationStatus" AS ENUM ('PENDING_ORG_REVIEW', 'NEGOTIATION', 'ACCEPTED', 'REJECTED', 'ABORTED');

-- CreateEnum
CREATE TYPE "CollaborationActor" AS ENUM ('AUTHOR', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "CollaborationTurn" AS ENUM ('AUTHOR', 'ORGANIZATION');

-- CreateTable
CREATE TABLE "author_organization_collaborations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "description" TEXT,
    "authorBudget" DECIMAL(12,2) NOT NULL,
    "organizationAsk" DECIMAL(12,2),
    "acceptedBudget" DECIMAL(12,2),
    "currency" TEXT NOT NULL,
    "status" "AuthorOrganizationCollaborationStatus" NOT NULL,
    "turn" "CollaborationTurn" NOT NULL,
    "negotiationExpiresAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "abortedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "author_organization_collaborations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author_organization_collaboration_attachments" (
    "id" TEXT NOT NULL,
    "collaborationId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedBy" "CollaborationActor" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "author_organization_collaboration_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author_organization_collaboration_rounds" (
    "id" TEXT NOT NULL,
    "collaborationId" TEXT NOT NULL,
    "actor" "CollaborationActor" NOT NULL,
    "authorBudget" DECIMAL(12,2),
    "organizationAsk" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "author_organization_collaboration_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "author_organization_collaborations_authorId_organizationId_key" ON "author_organization_collaborations"("authorId", "organizationId");

-- CreateIndex
CREATE INDEX "author_organization_collaborations_organizationId_status_idx" ON "author_organization_collaborations"("organizationId", "status");

-- CreateIndex
CREATE INDEX "author_organization_collaborations_authorId_status_idx" ON "author_organization_collaborations"("authorId", "status");

-- CreateIndex
CREATE INDEX "author_organization_collaboration_attachments_collaborationId_idx" ON "author_organization_collaboration_attachments"("collaborationId");

-- CreateIndex
CREATE INDEX "author_organization_collaboration_rounds_collaborationId_idx" ON "author_organization_collaboration_rounds"("collaborationId");

-- AddForeignKey
ALTER TABLE "author_organization_collaborations" ADD CONSTRAINT "author_organization_collaborations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_organization_collaborations" ADD CONSTRAINT "author_organization_collaborations_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_organization_collaboration_attachments" ADD CONSTRAINT "author_organization_collaboration_attachments_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES "author_organization_collaborations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_organization_collaboration_rounds" ADD CONSTRAINT "author_organization_collaboration_rounds_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES "author_organization_collaborations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

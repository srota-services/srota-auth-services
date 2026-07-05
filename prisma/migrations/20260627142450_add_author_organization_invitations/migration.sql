-- CreateEnum
CREATE TYPE "AuthorOrganizationInvitationStatus" AS ENUM ('PENDING_CONTACT_CONSENT', 'AWAITING_ORG_CONTACT', 'AWAITING_JOIN_DECISION', 'DECLINED', 'ACCEPTED');

-- CreateTable
CREATE TABLE "author_organization_invitations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "status" "AuthorOrganizationInvitationStatus" NOT NULL,
    "contactRevealedAt" TIMESTAMP(3),
    "orgContactConfirmedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "author_organization_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "author_organization_invitations_authorId_status_idx" ON "author_organization_invitations"("authorId", "status");

-- CreateIndex
CREATE INDEX "author_organization_invitations_organizationId_status_idx" ON "author_organization_invitations"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "author_organization_invitations_organizationId_authorId_key" ON "author_organization_invitations"("organizationId", "authorId");

-- AddForeignKey
ALTER TABLE "author_organization_invitations" ADD CONSTRAINT "author_organization_invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_organization_invitations" ADD CONSTRAINT "author_organization_invitations_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

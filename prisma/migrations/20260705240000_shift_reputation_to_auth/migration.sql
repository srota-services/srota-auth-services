-- CreateEnum
CREATE TYPE "ReputationTierLevel" AS ENUM ('TIER_1', 'TIER_2', 'TIER_3', 'TIER_4', 'TIER_5');

-- CreateEnum
CREATE TYPE "ReviewerType" AS ENUM ('USER', 'AUTHOR', 'ORGANIZATION');

-- CreateTable
CREATE TABLE "organization_tiers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tier" "ReputationTierLevel" NOT NULL DEFAULT 'TIER_3',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author_tiers" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "tier" "ReputationTierLevel" NOT NULL DEFAULT 'TIER_3',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "author_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_reviews" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reviewerType" "ReviewerType" NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author_reviews" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "reviewerType" "ReviewerType" NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "author_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_tiers_organizationId_key" ON "organization_tiers"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "author_tiers_authorId_key" ON "author_tiers"("authorId");

-- CreateIndex
CREATE INDEX "organization_reviews_organizationId_idx" ON "organization_reviews"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_reviews_organizationId_reviewerType_reviewerId_key" ON "organization_reviews"("organizationId", "reviewerType", "reviewerId");

-- CreateIndex
CREATE INDEX "author_reviews_authorId_idx" ON "author_reviews"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "author_reviews_authorId_reviewerType_reviewerId_key" ON "author_reviews"("authorId", "reviewerType", "reviewerId");

-- AddForeignKey
ALTER TABLE "organization_tiers" ADD CONSTRAINT "organization_tiers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_tiers" ADD CONSTRAINT "author_tiers_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_reviews" ADD CONSTRAINT "organization_reviews_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_reviews" ADD CONSTRAINT "author_reviews_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

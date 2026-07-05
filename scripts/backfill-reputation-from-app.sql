-- Backfill auth-service reputation tables from exported app-service tables.
-- Run after exporting CSV/SQL dumps from app DB into staging tables or via dblink.

-- Example when tier/review tables are imported as temp tables:
-- CREATE TEMP TABLE app_organization_tiers AS SELECT * FROM ...;
-- CREATE TEMP TABLE app_author_tiers AS SELECT * FROM ...;
-- CREATE TEMP TABLE app_organization_reviews AS SELECT * FROM ...;
-- CREATE TEMP TABLE app_author_reviews AS SELECT * FROM ...;

-- INSERT INTO organization_tiers (id, "organizationId", tier, "createdAt", "updatedAt")
-- SELECT id, "organizationId", tier::"ReputationTierLevel", "createdAt", "updatedAt"
-- FROM app_organization_tiers
-- ON CONFLICT ("organizationId") DO NOTHING;

-- INSERT INTO author_tiers (id, "authorId", tier, "createdAt", "updatedAt")
-- SELECT id, "authorId", tier::"ReputationTierLevel", "createdAt", "updatedAt"
-- FROM app_author_tiers
-- ON CONFLICT ("authorId") DO NOTHING;

-- INSERT INTO organization_reviews (id, "organizationId", "reviewerType", "reviewerId", rating, description, "createdAt", "updatedAt")
-- SELECT id, "organizationId", "reviewerType"::"ReviewerType", "reviewerId", rating, description, "createdAt", "updatedAt"
-- FROM app_organization_reviews
-- ON CONFLICT DO NOTHING;

-- INSERT INTO author_reviews (id, "authorId", "reviewerType", "reviewerId", rating, description, "createdAt", "updatedAt")
-- SELECT id, "authorId", "reviewerType"::"ReviewerType", "reviewerId", rating, description, "createdAt", "updatedAt"
-- FROM app_author_reviews
-- ON CONFLICT DO NOTHING;

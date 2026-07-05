-- Backfill auth-service profile fields from exported app-service tables.
-- Run after exporting CSV/SQL dumps from app DB into staging tables or via dblink.

-- Example when author_profiles and user_profiles are imported as temp tables:
-- CREATE TEMP TABLE app_author_profiles AS SELECT * FROM ...;
-- CREATE TEMP TABLE app_user_profiles AS SELECT * FROM ...;

-- UPDATE authors a
-- SET avatar = ap.avatar,
--     discoverable = COALESCE(ap.discoverable, false)
-- FROM app_author_profiles ap
-- WHERE a.id = ap."authorId";

-- UPDATE users u
-- SET username = up.username,
--     avatar = up.avatar,
--     preferences = up.preferences
-- FROM app_user_profiles up
-- WHERE u.id = up."userId";

-- Copy image_assets for author/user categories similarly into auth image_assets.

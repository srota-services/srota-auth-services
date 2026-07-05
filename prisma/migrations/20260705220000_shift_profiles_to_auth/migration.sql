-- Shift profile fields from app-service into auth-service

ALTER TABLE "users" ADD COLUMN "username" TEXT;
ALTER TABLE "users" ADD COLUMN "avatar" TEXT;
ALTER TABLE "users" ADD COLUMN "preferences" JSONB;

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

ALTER TABLE "authors" ADD COLUMN "avatar" TEXT;
ALTER TABLE "authors" ADD COLUMN "discoverable" BOOLEAN NOT NULL DEFAULT false;

ALTER TYPE "ImageCategory" ADD VALUE IF NOT EXISTS 'author';
ALTER TYPE "ImageCategory" ADD VALUE IF NOT EXISTS 'user';

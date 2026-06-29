-- CreateEnum
CREATE TYPE "SubscriptionTierLevel" AS ENUM ('BASE', 'STANDARD', 'PREMIUM');

-- Drop the old integer default (0) before type conversion; the new column has no default.
ALTER TABLE "subscription_plans" ALTER COLUMN "tierLevel" DROP DEFAULT;

-- AlterTable: convert existing Int tierLevel to SubscriptionTierLevel enum
-- Any rows with tierLevel=0 (schema default, no real plans have this value) fall back to BASE.
ALTER TABLE "subscription_plans"
  ALTER COLUMN "tierLevel" TYPE "SubscriptionTierLevel"
  USING CASE
    WHEN "tierLevel" = 1 THEN 'BASE'::"SubscriptionTierLevel"
    WHEN "tierLevel" = 2 THEN 'STANDARD'::"SubscriptionTierLevel"
    WHEN "tierLevel" = 3 THEN 'PREMIUM'::"SubscriptionTierLevel"
    ELSE 'BASE'::"SubscriptionTierLevel"
  END;

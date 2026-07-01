-- Partial index for daily pending downgrade job query
CREATE INDEX "user_subscriptions_pending_downgrade_idx"
ON "user_subscriptions" ("pendingPlanChangeAt")
WHERE "pendingPlanChangeType" = 'DOWNGRADE' AND "pendingPlanId" IS NOT NULL;

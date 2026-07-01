-- Partial indexes for daily subscription renewal and expiration jobs
CREATE INDEX "user_subscriptions_due_renewal_idx"
ON "user_subscriptions" ("currentPeriodEnd")
WHERE "autoRenew" = true AND "cancelAtPeriodEnd" = false;

CREATE INDEX "user_subscriptions_due_expire_idx"
ON "user_subscriptions" ("currentPeriodEnd")
WHERE "cancelAtPeriodEnd" = true;

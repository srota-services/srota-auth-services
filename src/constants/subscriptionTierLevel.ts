import { SubscriptionTierLevel } from '@prisma/client';

export { SubscriptionTierLevel };

/**
 * Numeric ordering for SubscriptionTierLevel comparisons.
 * Higher number = higher tier. Used for max-tier calculation and tier comparison.
 */
export const SUBSCRIPTION_TIER_ORDER: Record<SubscriptionTierLevel, number> = {
   [SubscriptionTierLevel.BASE]: 1,
   [SubscriptionTierLevel.STANDARD]: 2,
   [SubscriptionTierLevel.PREMIUM]: 3,
};

/** Convert a tier enum value to its numeric ordering value. */
export function tierLevelToNumber(tier: SubscriptionTierLevel): number {
   return SUBSCRIPTION_TIER_ORDER[tier];
}

/** Return the higher of two tier levels, or the non-null one if one is null. */
export function maxTierLevel(
   a: SubscriptionTierLevel | null,
   b: SubscriptionTierLevel,
): SubscriptionTierLevel {
   if (a === null) return b;
   return SUBSCRIPTION_TIER_ORDER[a] >= SUBSCRIPTION_TIER_ORDER[b] ? a : b;
}

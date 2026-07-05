import { ReputationTierLevel } from '@prisma/client';

export const DEFAULT_REPUTATION_TIER = ReputationTierLevel.TIER_3;

const TIER_ORDER: ReputationTierLevel[] = [
   ReputationTierLevel.TIER_1,
   ReputationTierLevel.TIER_2,
   ReputationTierLevel.TIER_3,
   ReputationTierLevel.TIER_4,
   ReputationTierLevel.TIER_5,
];

export function reputationTierToNumber(tier: ReputationTierLevel): number {
   const index = TIER_ORDER.indexOf(tier);
   return index >= 0 ? index + 1 : 3;
}

export function numberToReputationTier(value: number): ReputationTierLevel {
   const clamped = Math.min(5, Math.max(1, Math.ceil(value)));
   return TIER_ORDER[clamped - 1] ?? DEFAULT_REPUTATION_TIER;
}

export function tierFromAverageCeil(average: number): ReputationTierLevel {
   return numberToReputationTier(average);
}

export function tierFromRatings(ratings: number[]): ReputationTierLevel {
   if (ratings.length === 0) {
      return DEFAULT_REPUTATION_TIER;
   }
   const sum = ratings.reduce((total, rating) => total + rating, 0);
   return tierFromAverageCeil(sum / ratings.length);
}

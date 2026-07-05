import { ReputationTierLevel } from '@prisma/client';
import {
   DEFAULT_REPUTATION_TIER,
   numberToReputationTier,
   reputationTierToNumber,
   tierFromAverageCeil,
   tierFromRatings,
} from '../../src/constants/reputationTierLevel';

describe('reputationTierLevel', () => {
   it('maps tiers to numbers and back', () => {
      expect(reputationTierToNumber(ReputationTierLevel.TIER_1)).toBe(1);
      expect(reputationTierToNumber(ReputationTierLevel.TIER_5)).toBe(5);
      expect(numberToReputationTier(3)).toBe(ReputationTierLevel.TIER_3);
   });

   it('clamps tier values between 1 and 5', () => {
      expect(numberToReputationTier(0)).toBe(ReputationTierLevel.TIER_1);
      expect(numberToReputationTier(6)).toBe(ReputationTierLevel.TIER_5);
   });

   it('uses ceil for average tier mapping', () => {
      expect(tierFromAverageCeil(2.1)).toBe(ReputationTierLevel.TIER_3);
      expect(tierFromAverageCeil(4.0)).toBe(ReputationTierLevel.TIER_4);
   });

   it('returns default tier when there are no ratings', () => {
      expect(tierFromRatings([])).toBe(DEFAULT_REPUTATION_TIER);
   });

   it('derives tier from average rating', () => {
      expect(tierFromRatings([4, 5])).toBe(ReputationTierLevel.TIER_5);
      expect(tierFromRatings([1, 2, 3])).toBe(ReputationTierLevel.TIER_2);
   });
});

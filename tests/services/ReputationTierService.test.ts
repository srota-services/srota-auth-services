import { PrismaClient, ReputationTierLevel } from '@prisma/client';
import { ReputationTierService } from '../../src/services/ReputationTierService';
import { attachPrismaTransaction } from '../helpers/prismaMock';

describe('ReputationTierService', () => {
   let service: ReputationTierService;
   let mockPrisma: {
      organizationReview: { findMany: jest.Mock };
      organizationTier: { upsert: jest.Mock };
      authorReview: { findMany: jest.Mock };
      authorTier: { upsert: jest.Mock };
   };

   beforeEach(() => {
      mockPrisma = attachPrismaTransaction({
         organizationReview: { findMany: jest.fn() },
         organizationTier: { upsert: jest.fn() },
         authorReview: { findMany: jest.fn() },
         authorTier: { upsert: jest.fn() },
      });
      service = new ReputationTierService(mockPrisma as unknown as PrismaClient);
   });

   it('recalculates organization tier from review average', async () => {
      mockPrisma.organizationReview.findMany.mockResolvedValue([{ rating: 4 }, { rating: 5 }]);
      mockPrisma.organizationTier.upsert.mockResolvedValue({});

      await service.recalculateOrganizationTier('org-1');

      expect(mockPrisma.organizationTier.upsert).toHaveBeenCalledWith({
         where: { organizationId: 'org-1' },
         create: { organizationId: 'org-1', tier: ReputationTierLevel.TIER_5 },
         update: { tier: ReputationTierLevel.TIER_5 },
      });
   });

   it('recalculates author tier to default when there are no reviews', async () => {
      mockPrisma.authorReview.findMany.mockResolvedValue([]);
      mockPrisma.authorTier.upsert.mockResolvedValue({});

      await service.recalculateAuthorTier('author-1');

      expect(mockPrisma.authorTier.upsert).toHaveBeenCalledWith({
         where: { authorId: 'author-1' },
         create: { authorId: 'author-1', tier: ReputationTierLevel.TIER_3 },
         update: { tier: ReputationTierLevel.TIER_3 },
      });
   });
});

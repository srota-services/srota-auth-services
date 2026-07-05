import { PrismaClient, ReviewerType } from '@prisma/client';
import { OrganizationReviewService } from '../../src/services/OrganizationReviewService';
import { attachPrismaTransaction } from '../helpers/prismaMock';

jest.mock('../../src/services/DomainEventPublisher', () => ({
   emitCacheInvalidation: jest.fn(),
}));

describe('OrganizationReviewService', () => {
   let service: OrganizationReviewService;
   let mockPrisma: {
      organization: { findUnique: jest.Mock };
      organizationMember: { findFirst: jest.Mock };
      organizationReview: {
         findUnique: jest.Mock;
         create: jest.Mock;
         findMany: jest.Mock;
      };
      organizationTier: { upsert: jest.Mock };
   };

   const reviewer = { type: ReviewerType.USER, id: 'user-1' };

   beforeEach(() => {
      jest.clearAllMocks();
      mockPrisma = attachPrismaTransaction({
         organization: { findUnique: jest.fn() },
         organizationMember: { findFirst: jest.fn() },
         organizationReview: {
            findUnique: jest.fn(),
            create: jest.fn(),
            findMany: jest.fn().mockResolvedValue([]),
         },
         organizationTier: { upsert: jest.fn().mockResolvedValue({}) },
      });
      service = new OrganizationReviewService(mockPrisma as unknown as PrismaClient);
   });

   it('creates a review and recalculates tier', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      mockPrisma.organizationMember.findFirst.mockResolvedValue(null);
      mockPrisma.organizationReview.findUnique.mockResolvedValue(null);
      mockPrisma.organizationReview.create.mockResolvedValue({
         id: 'review-1',
         organizationId: 'org-1',
         reviewerType: ReviewerType.USER,
         reviewerId: 'user-1',
         rating: 5,
         description: null,
         createdAt: new Date(),
         updatedAt: new Date(),
      });

      const result = await service.createReview(
         reviewer,
         { organizationId: 'org-1', rating: 5 },
         'user-1',
      );

      expect(result.organizationId).toBe('org-1');
      expect(mockPrisma.organizationTier.upsert).toHaveBeenCalled();
   });

   it('rejects duplicate reviews', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      mockPrisma.organizationMember.findFirst.mockResolvedValue(null);
      mockPrisma.organizationReview.findUnique.mockResolvedValue({ id: 'existing-review' });

      await expect(
         service.createReview(reviewer, { organizationId: 'org-1', rating: 4 }, 'user-1'),
      ).rejects.toMatchObject({ statusCode: 409 });
   });

   it('forbids organization member reviews', async () => {
      mockPrisma.organizationMember.findFirst.mockResolvedValue({ role: 'ADMIN' });

      await expect(
         service.createReview(reviewer, { organizationId: 'org-1', rating: 4 }, 'user-1'),
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
   });
});

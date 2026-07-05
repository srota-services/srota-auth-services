import { PrismaClient, ReviewerType } from '@prisma/client';
import { AuthorReviewService } from '../../src/services/AuthorReviewService';
import { attachPrismaTransaction } from '../helpers/prismaMock';

jest.mock('../../src/services/DomainEventPublisher', () => ({
   emitCacheInvalidation: jest.fn(),
}));

describe('AuthorReviewService', () => {
   let service: AuthorReviewService;
   let mockPrisma: {
      author: { findUnique: jest.Mock };
      authorReview: {
         findUnique: jest.Mock;
         create: jest.Mock;
         findMany: jest.Mock;
      };
      authorTier: { upsert: jest.Mock };
   };

   const reviewer = { type: ReviewerType.USER, id: 'user-1' };

   beforeEach(() => {
      jest.clearAllMocks();
      mockPrisma = attachPrismaTransaction({
         author: { findUnique: jest.fn() },
         authorReview: {
            findUnique: jest.fn(),
            create: jest.fn(),
            findMany: jest.fn().mockResolvedValue([]),
         },
         authorTier: { upsert: jest.fn().mockResolvedValue({}) },
      });
      service = new AuthorReviewService(mockPrisma as unknown as PrismaClient);
   });

   it('creates a review and recalculates tier', async () => {
      mockPrisma.author.findUnique
         .mockResolvedValueOnce({ id: 'author-1', userId: 'author-user-1' })
         .mockResolvedValueOnce(null);
      mockPrisma.authorReview.findUnique.mockResolvedValue(null);
      mockPrisma.authorReview.create.mockResolvedValue({
         id: 'review-1',
         authorId: 'author-1',
         reviewerType: ReviewerType.USER,
         reviewerId: 'user-1',
         rating: 5,
         description: null,
         createdAt: new Date(),
         updatedAt: new Date(),
      });

      const result = await service.createReview(
         reviewer,
         { authorId: 'author-1', rating: 5 },
         'user-1',
      );

      expect(result.authorId).toBe('author-1');
      expect(mockPrisma.authorTier.upsert).toHaveBeenCalled();
   });

   it('forbids self review by author user id', async () => {
      mockPrisma.author.findUnique.mockResolvedValue({ id: 'author-1', userId: 'user-1' });

      await expect(
         service.createReview(reviewer, { authorId: 'author-1', rating: 4 }, 'user-1'),
      ).rejects.toMatchObject({ statusCode: 400 });
   });
});

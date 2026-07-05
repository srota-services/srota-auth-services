import { PrismaClient } from '@prisma/client';
import { AuthorService } from '../../src/services/AuthorService';
import { fileUrlService } from '../../src/services/FileUrlService';

jest.mock('../../src/services/FileUrlService', () => ({
   fileUrlService: {
      resolveAuthorMedia: jest.fn(async (dto: unknown) => dto),
      resolveAuthorMediaList: jest.fn(async (dtos: unknown[]) => dtos),
   },
}));

describe('AuthorService.listDiscoverableAuthors', () => {
   let service: AuthorService;
   let mockPrisma: {
      author: {
         findMany: jest.Mock;
         count: jest.Mock;
      };
   };

   beforeEach(() => {
      mockPrisma = {
         author: {
            findMany: jest.fn(),
            count: jest.fn(),
         },
      };
      service = new AuthorService(mockPrisma as unknown as PrismaClient);
   });

   it('returns discoverable authors with pagination metadata', async () => {
      mockPrisma.author.findMany.mockResolvedValue([
         {
            id: 'author-1',
            userId: 'user-1',
            slug: 'jane-doe',
            avatar: 'avatar.jpg',
            discoverable: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            user: { firstName: 'Jane', lastName: 'Doe', address: null, contact: null },
            organizations: [],
         },
      ]);
      mockPrisma.author.count.mockResolvedValue(1);

      const result = await service.listDiscoverableAuthors({ page: 1, limit: 10 });

      expect(mockPrisma.author.findMany).toHaveBeenCalledWith(
         expect.objectContaining({
            where: { discoverable: true },
            skip: 0,
            take: 10,
         }),
      );
      expect(result.totalCount).toBe(1);
      expect(result.authors[0]).toEqual(
         expect.objectContaining({
            authorId: 'author-1',
            slug: 'jane-doe',
            firstName: 'Jane',
            lastName: 'Doe',
            discoverable: true,
         }),
      );
      expect(fileUrlService.resolveAuthorMediaList).toHaveBeenCalled();
   });
});

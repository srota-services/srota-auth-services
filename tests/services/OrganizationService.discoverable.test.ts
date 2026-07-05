import { PrismaClient } from '@prisma/client';
import { OrganizationService } from '../../src/services/OrganizationService';

jest.mock('../../src/services/FileUrlService', () => ({
   fileUrlService: {
      resolveOrganizationMediaList: jest.fn(async (dtos: unknown) => dtos),
   },
}));

describe('OrganizationService.listDiscoverableOrganizations', () => {
   let service: OrganizationService;
   let mockPrisma: {
      organization: {
         findMany: jest.Mock;
         count: jest.Mock;
      };
   };

   beforeEach(() => {
      mockPrisma = {
         organization: {
            findMany: jest.fn(),
            count: jest.fn(),
         },
      };
      service = new OrganizationService(mockPrisma as unknown as PrismaClient);
   });

   it('returns only discoverable organizations with pagination metadata', async () => {
      mockPrisma.organization.findMany.mockResolvedValue([
         {
            id: 'org-1',
            name: 'Acme Publishing',
            slug: 'acme-publishing',
            description: 'Publisher',
            image: null,
            preferredGenre: null,
            websiteUrl: null,
            teamSize: null,
            discoverable: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            _count: { members: 2 },
         },
      ]);
      mockPrisma.organization.count.mockResolvedValue(1);

      const result = await service.listDiscoverableOrganizations({ page: 1, limit: 10 });

      expect(mockPrisma.organization.findMany).toHaveBeenCalledWith(
         expect.objectContaining({
            where: { discoverable: true },
            skip: 0,
            take: 10,
         }),
      );
      expect(result.totalCount).toBe(1);
      expect(result.organizations).toHaveLength(1);
      expect(result.organizations[0]?.discoverable).toBe(true);
   });
});

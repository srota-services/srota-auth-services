import { PrismaClient, ReputationTierLevel } from '@prisma/client';
import { OrganizationTierService } from '../../src/services/OrganizationTierService';
import { attachPrismaTransaction } from '../helpers/prismaMock';

describe('OrganizationTierService', () => {
   let service: OrganizationTierService;
   let mockPrisma: {
      organizationTier: {
         findUnique: jest.Mock;
         create: jest.Mock;
      };
   };

   beforeEach(() => {
      mockPrisma = attachPrismaTransaction({
         organizationTier: {
            findUnique: jest.fn(),
            create: jest.fn(),
         },
      });
      service = new OrganizationTierService(mockPrisma as unknown as PrismaClient);
   });

   it('creates default tier idempotently', async () => {
      mockPrisma.organizationTier.findUnique.mockResolvedValue(null);
      mockPrisma.organizationTier.create.mockResolvedValue({
         organizationId: 'org-1',
         tier: ReputationTierLevel.TIER_3,
      });

      await service.createDefaultForOrganization('org-1');

      expect(mockPrisma.organizationTier.create).toHaveBeenCalledWith({
         data: {
            organizationId: 'org-1',
            tier: ReputationTierLevel.TIER_3,
         },
      });
   });

   it('skips create when tier already exists', async () => {
      mockPrisma.organizationTier.findUnique.mockResolvedValue({
         organizationId: 'org-1',
         tier: ReputationTierLevel.TIER_3,
      });

      await service.createDefaultForOrganization('org-1');

      expect(mockPrisma.organizationTier.create).not.toHaveBeenCalled();
   });
});

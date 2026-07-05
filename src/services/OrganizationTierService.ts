import { PrismaClient } from '@prisma/client';
import { DEFAULT_REPUTATION_TIER } from '../constants/reputationTierLevel';
import { runWrite } from '../utils/prismaTransaction';

export class OrganizationTierService {
   constructor(private prisma: PrismaClient) {}

   async createDefaultForOrganization(organizationId: string): Promise<void> {
      const existing = await this.prisma.organizationTier.findUnique({
         where: { organizationId },
      });

      if (existing) {
         return;
      }

      await runWrite(this.prisma, async (tx) =>
         tx.organizationTier.create({
            data: {
               organizationId,
               tier: DEFAULT_REPUTATION_TIER,
            },
         }),
      );
   }
}

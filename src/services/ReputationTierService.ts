import { PrismaClient } from '@prisma/client';
import { tierFromRatings } from '../constants/reputationTierLevel';
import { runWrite } from '../utils/prismaTransaction';

export class ReputationTierService {
   constructor(private prisma: PrismaClient) {}

   async recalculateOrganizationTier(organizationId: string): Promise<void> {
      const reviews = await this.prisma.organizationReview.findMany({
         where: { organizationId },
         select: { rating: true },
      });

      const tier = tierFromRatings(reviews.map((review) => review.rating));

      await runWrite(this.prisma, async (tx) =>
         tx.organizationTier.upsert({
            where: { organizationId },
            create: { organizationId, tier },
            update: { tier },
         }),
      );
   }

   async recalculateAuthorTier(authorId: string): Promise<void> {
      const reviews = await this.prisma.authorReview.findMany({
         where: { authorId },
         select: { rating: true },
      });

      const tier = tierFromRatings(reviews.map((review) => review.rating));

      await runWrite(this.prisma, async (tx) =>
         tx.authorTier.upsert({
            where: { authorId },
            create: { authorId, tier },
            update: { tier },
         }),
      );
   }
}

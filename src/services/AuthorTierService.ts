import { PrismaClient } from '@prisma/client';
import { DEFAULT_REPUTATION_TIER } from '../constants/reputationTierLevel';
import { runWrite } from '../utils/prismaTransaction';

export class AuthorTierService {
   constructor(private prisma: PrismaClient) {}

   async createDefaultForAuthor(authorId: string): Promise<void> {
      const existing = await this.prisma.authorTier.findUnique({
         where: { authorId },
      });

      if (existing) {
         return;
      }

      await runWrite(this.prisma, async (tx) =>
         tx.authorTier.create({
            data: {
               authorId,
               tier: DEFAULT_REPUTATION_TIER,
            },
         }),
      );
   }
}

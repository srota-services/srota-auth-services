import { PrismaClient, ReviewerType } from '@prisma/client';
import { runWrite } from '../utils/prismaTransaction';

export class ReputationCleanupService {
   constructor(private prisma: PrismaClient) {}

   async cleanupAuthorReputation(authorId: string): Promise<void> {
      await runWrite(this.prisma, async (tx) => {
         await tx.authorReview.deleteMany({
            where: {
               OR: [{ authorId }, { reviewerType: ReviewerType.AUTHOR, reviewerId: authorId }],
            },
         });
      });
   }
}

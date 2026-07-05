import { ReviewerType } from '@prisma/client';

export interface ResolvedReviewer {
   type: ReviewerType;
   id: string;
}

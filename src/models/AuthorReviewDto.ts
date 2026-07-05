import { AuthorReview, ReviewerType } from '@prisma/client';

export interface AuthorReviewDto {
   id: string;
   authorId: string;
   reviewerType: ReviewerType;
   reviewerId: string;
   rating: number;
   description?: string;
   createdAt: Date;
   updatedAt: Date;
}

export interface CreateAuthorReviewRequest {
   authorId: string;
   rating: number;
   description?: string;
}

export interface UpdateAuthorReviewRequest {
   rating?: number;
   description?: string | null;
}

export interface AuthorReviewQueryParams {
   authorId?: string;
   reviewerType?: ReviewerType;
   reviewerId?: string;
   page?: number;
   limit?: number;
   sortBy?: 'createdAt' | 'updatedAt' | 'rating';
   sortOrder?: 'asc' | 'desc';
}

export function toAuthorReviewDto(review: AuthorReview): AuthorReviewDto {
   return {
      id: review.id,
      authorId: review.authorId,
      reviewerType: review.reviewerType,
      reviewerId: review.reviewerId,
      rating: review.rating,
      ...(review.description ? { description: review.description } : {}),
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
   };
}

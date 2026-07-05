import { OrganizationReview, ReviewerType } from '@prisma/client';

export interface OrganizationReviewDto {
   id: string;
   organizationId: string;
   reviewerType: ReviewerType;
   reviewerId: string;
   rating: number;
   description?: string;
   createdAt: Date;
   updatedAt: Date;
}

export interface CreateOrganizationReviewRequest {
   organizationId: string;
   rating: number;
   description?: string;
}

export interface UpdateOrganizationReviewRequest {
   rating?: number;
   description?: string | null;
}

export interface OrganizationReviewQueryParams {
   organizationId?: string;
   reviewerType?: ReviewerType;
   reviewerId?: string;
   page?: number;
   limit?: number;
   sortBy?: 'createdAt' | 'updatedAt' | 'rating';
   sortOrder?: 'asc' | 'desc';
}

export function toOrganizationReviewDto(review: OrganizationReview): OrganizationReviewDto {
   return {
      id: review.id,
      organizationId: review.organizationId,
      reviewerType: review.reviewerType,
      reviewerId: review.reviewerId,
      rating: review.rating,
      ...(review.description ? { description: review.description } : {}),
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
   };
}

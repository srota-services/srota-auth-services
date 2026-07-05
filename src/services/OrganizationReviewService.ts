import { Prisma, PrismaClient, ReviewerType } from '@prisma/client';
import {
   CreateOrganizationReviewRequest,
   OrganizationReviewDto,
   OrganizationReviewQueryParams,
   UpdateOrganizationReviewRequest,
   toOrganizationReviewDto,
} from '../models/OrganizationReviewDto';
import { DomainError } from '../types/domain';
import { ResolvedReviewer } from '../types/reviewer';
import { runWrite } from '../utils/prismaTransaction';
import { domainMessages } from '../utils/domainMessages';
import { ReputationTierService } from './ReputationTierService';
import { emitCacheInvalidation } from './DomainEventPublisher';

const msg = domainMessages.error.organizationReviews;
const orgMsg = domainMessages.error.organizations;
const validationMsg = domainMessages.error.validation;

export class OrganizationReviewService {
   private reputationTierService: ReputationTierService;

   constructor(private prisma: PrismaClient) {
      this.reputationTierService = new ReputationTierService(prisma);
   }

   private validateRating(rating: number): void {
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
         throw DomainError.validation(validationMsg.review_rating_invalid);
      }
   }

   private async assertNotMemberReview(organizationId: string, userId: string): Promise<void> {
      const membership = await this.prisma.organizationMember.findFirst({
         where: { organizationId, userId },
      });
      if (membership) {
         throw DomainError.validation(msg.member_review_forbidden);
      }
   }

   private isReviewerOwner(
      review: { reviewerType: ReviewerType; reviewerId: string },
      reviewer: ResolvedReviewer,
   ): boolean {
      return review.reviewerType === reviewer.type && review.reviewerId === reviewer.id;
   }

   private async recalculateTier(organizationId: string): Promise<void> {
      await this.reputationTierService.recalculateOrganizationTier(organizationId);
   }

   async createReview(
      reviewer: ResolvedReviewer,
      data: CreateOrganizationReviewRequest,
      userId: string,
   ): Promise<OrganizationReviewDto> {
      this.validateRating(data.rating);
      await this.assertNotMemberReview(data.organizationId, userId);

      const organization = await this.prisma.organization.findUnique({
         where: { id: data.organizationId },
      });
      if (!organization) {
         throw DomainError.notFound(orgMsg.not_found);
      }

      const existing = await this.prisma.organizationReview.findUnique({
         where: {
            organizationId_reviewerType_reviewerId: {
               organizationId: data.organizationId,
               reviewerType: reviewer.type,
               reviewerId: reviewer.id,
            },
         },
      });

      if (existing) {
         throw DomainError.conflict(msg.already_exists);
      }

      const review = await runWrite(this.prisma, async (tx) =>
         tx.organizationReview.create({
            data: {
               organizationId: data.organizationId,
               reviewerType: reviewer.type,
               reviewerId: reviewer.id,
               rating: data.rating,
               description: data.description?.trim() || null,
            },
         }),
      );

      await this.recalculateTier(data.organizationId);
      emitCacheInvalidation('organization-review', 'created', review.id, {
         organizationId: data.organizationId,
      });
      return toOrganizationReviewDto(review);
   }

   async getReviews(
      query: OrganizationReviewQueryParams,
   ): Promise<{ reviews: OrganizationReviewDto[]; totalCount: number }> {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const skip = (page - 1) * limit;
      const sortBy = query.sortBy ?? 'createdAt';
      const sortOrder = query.sortOrder ?? 'desc';

      const where: Prisma.OrganizationReviewWhereInput = {};
      if (query.organizationId) where.organizationId = query.organizationId;
      if (query.reviewerType) where.reviewerType = query.reviewerType;
      if (query.reviewerId) where.reviewerId = query.reviewerId;

      const [reviews, totalCount] = await Promise.all([
         this.prisma.organizationReview.findMany({
            where,
            skip,
            take: limit,
            orderBy: { [sortBy]: sortOrder },
         }),
         this.prisma.organizationReview.count({ where }),
      ]);

      return {
         reviews: reviews.map(toOrganizationReviewDto),
         totalCount,
      };
   }

   async getReviewById(id: string): Promise<OrganizationReviewDto> {
      const review = await this.prisma.organizationReview.findUnique({ where: { id } });
      if (!review) {
         throw DomainError.notFound(msg.not_found);
      }
      return toOrganizationReviewDto(review);
   }

   async updateReview(
      id: string,
      reviewer: ResolvedReviewer,
      data: UpdateOrganizationReviewRequest,
   ): Promise<OrganizationReviewDto> {
      const existing = await this.prisma.organizationReview.findUnique({ where: { id } });
      if (!existing) {
         throw DomainError.notFound(msg.not_found);
      }
      if (!this.isReviewerOwner(existing, reviewer)) {
         throw DomainError.forbidden(msg.access_denied);
      }

      if (data.rating !== undefined) {
         this.validateRating(data.rating);
      }

      const updated = await runWrite(this.prisma, async (tx) =>
         tx.organizationReview.update({
            where: { id },
            data: {
               ...(data.rating !== undefined ? { rating: data.rating } : {}),
               ...(data.description !== undefined
                  ? { description: data.description === null ? null : data.description.trim() || null }
                  : {}),
            },
         }),
      );

      await this.recalculateTier(existing.organizationId);
      emitCacheInvalidation('organization-review', 'updated', id, {
         organizationId: existing.organizationId,
      });
      return toOrganizationReviewDto(updated);
   }

   async deleteReview(id: string, reviewer: ResolvedReviewer): Promise<void> {
      const existing = await this.prisma.organizationReview.findUnique({ where: { id } });
      if (!existing) {
         throw DomainError.notFound(msg.not_found);
      }
      if (!this.isReviewerOwner(existing, reviewer)) {
         throw DomainError.forbidden(msg.access_denied);
      }

      await runWrite(this.prisma, async (tx) => tx.organizationReview.delete({ where: { id } }));
      await this.recalculateTier(existing.organizationId);
      emitCacheInvalidation('organization-review', 'deleted', id, {
         organizationId: existing.organizationId,
      });
   }
}

import { Prisma, PrismaClient, ReviewerType } from '@prisma/client';
import {
   AuthorReviewDto,
   AuthorReviewQueryParams,
   CreateAuthorReviewRequest,
   UpdateAuthorReviewRequest,
   toAuthorReviewDto,
} from '../models/AuthorReviewDto';
import { DomainError } from '../types/domain';
import { ResolvedReviewer } from '../types/reviewer';
import { runWrite } from '../utils/prismaTransaction';
import { domainMessages } from '../utils/domainMessages';
import { ReputationTierService } from './ReputationTierService';
import { emitCacheInvalidation } from './DomainEventPublisher';

const msg = domainMessages.error.authorReviews;
const authorMsg = domainMessages.error.authors;
const validationMsg = domainMessages.error.validation;

export class AuthorReviewService {
   private reputationTierService: ReputationTierService;

   constructor(private prisma: PrismaClient) {
      this.reputationTierService = new ReputationTierService(prisma);
   }

   private validateRating(rating: number): void {
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
         throw DomainError.validation(validationMsg.review_rating_invalid);
      }
   }

   private async assertNotSelfReview(
      reviewer: ResolvedReviewer,
      author: { id: string; userId: string },
      externalUserId?: string,
   ): Promise<void> {
      if (reviewer.type === ReviewerType.AUTHOR && reviewer.id === author.id) {
         throw DomainError.validation(msg.self_review_forbidden);
      }

      if (externalUserId && author.userId === externalUserId) {
         throw DomainError.validation(msg.self_review_forbidden);
      }

      if (externalUserId) {
         const myAuthor = await this.prisma.author.findUnique({
            where: { userId: externalUserId },
            select: { id: true },
         });
         if (myAuthor?.id === author.id) {
            throw DomainError.validation(msg.self_review_forbidden);
         }
      }
   }

   private isReviewerOwner(
      review: { reviewerType: ReviewerType; reviewerId: string },
      reviewer: ResolvedReviewer,
   ): boolean {
      return review.reviewerType === reviewer.type && review.reviewerId === reviewer.id;
   }

   private async recalculateTier(authorId: string): Promise<void> {
      await this.reputationTierService.recalculateAuthorTier(authorId);
   }

   async createReview(
      reviewer: ResolvedReviewer,
      data: CreateAuthorReviewRequest,
      externalUserId?: string,
   ): Promise<AuthorReviewDto> {
      this.validateRating(data.rating);

      const author = await this.prisma.author.findUnique({
         where: { id: data.authorId },
         select: { id: true, userId: true },
      });
      if (!author) {
         throw DomainError.notFound(authorMsg.not_found);
      }

      await this.assertNotSelfReview(reviewer, author, externalUserId);

      const existing = await this.prisma.authorReview.findUnique({
         where: {
            authorId_reviewerType_reviewerId: {
               authorId: data.authorId,
               reviewerType: reviewer.type,
               reviewerId: reviewer.id,
            },
         },
      });

      if (existing) {
         throw DomainError.conflict(msg.already_exists);
      }

      const review = await runWrite(this.prisma, async (tx) =>
         tx.authorReview.create({
            data: {
               authorId: data.authorId,
               reviewerType: reviewer.type,
               reviewerId: reviewer.id,
               rating: data.rating,
               description: data.description?.trim() || null,
            },
         }),
      );

      await this.recalculateTier(data.authorId);
      emitCacheInvalidation('author-review', 'created', review.id, { authorId: data.authorId });
      return toAuthorReviewDto(review);
   }

   async getReviews(query: AuthorReviewQueryParams): Promise<{ reviews: AuthorReviewDto[]; totalCount: number }> {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const skip = (page - 1) * limit;
      const sortBy = query.sortBy ?? 'createdAt';
      const sortOrder = query.sortOrder ?? 'desc';

      const where: Prisma.AuthorReviewWhereInput = {};
      if (query.authorId) where.authorId = query.authorId;
      if (query.reviewerType) where.reviewerType = query.reviewerType;
      if (query.reviewerId) where.reviewerId = query.reviewerId;

      const [reviews, totalCount] = await Promise.all([
         this.prisma.authorReview.findMany({
            where,
            skip,
            take: limit,
            orderBy: { [sortBy]: sortOrder },
         }),
         this.prisma.authorReview.count({ where }),
      ]);

      return {
         reviews: reviews.map(toAuthorReviewDto),
         totalCount,
      };
   }

   async getReviewById(id: string): Promise<AuthorReviewDto> {
      const review = await this.prisma.authorReview.findUnique({ where: { id } });
      if (!review) {
         throw DomainError.notFound(msg.not_found);
      }
      return toAuthorReviewDto(review);
   }

   async updateReview(
      id: string,
      reviewer: ResolvedReviewer,
      data: UpdateAuthorReviewRequest,
   ): Promise<AuthorReviewDto> {
      const existing = await this.prisma.authorReview.findUnique({ where: { id } });
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
         tx.authorReview.update({
            where: { id },
            data: {
               ...(data.rating !== undefined ? { rating: data.rating } : {}),
               ...(data.description !== undefined
                  ? { description: data.description === null ? null : data.description.trim() || null }
                  : {}),
            },
         }),
      );

      await this.recalculateTier(existing.authorId);
      emitCacheInvalidation('author-review', 'updated', id, { authorId: existing.authorId });
      return toAuthorReviewDto(updated);
   }

   async deleteReview(id: string, reviewer: ResolvedReviewer): Promise<void> {
      const existing = await this.prisma.authorReview.findUnique({ where: { id } });
      if (!existing) {
         throw DomainError.notFound(msg.not_found);
      }
      if (!this.isReviewerOwner(existing, reviewer)) {
         throw DomainError.forbidden(msg.access_denied);
      }

      await runWrite(this.prisma, async (tx) => tx.authorReview.delete({ where: { id } }));
      await this.recalculateTier(existing.authorId);
      emitCacheInvalidation('author-review', 'deleted', id, { authorId: existing.authorId });
   }
}

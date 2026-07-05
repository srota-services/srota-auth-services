import { Request, Response } from 'express';
import { PrismaClient, ReviewerType } from '@prisma/client';
import { AuthorReviewService } from '../services/AuthorReviewService';
import {
   AuthorReviewQueryParams,
   CreateAuthorReviewRequest,
   UpdateAuthorReviewRequest,
} from '../models/AuthorReviewDto';
import { handleDomainError, calculatePagination } from '../utils/domainController';
import { domainMessages } from '../utils/domainMessages';
import { resolveReviewerFromJwt } from '../utils/resolveReviewerFromJwt';
import { AuthenticatedRequest } from '../types/domain';

export class AuthorReviewController {
   private authorReviewService: AuthorReviewService;

   constructor(private prisma: PrismaClient) {
      this.authorReviewService = new AuthorReviewService(prisma);
   }

   createReview = async (req: Request, res: Response): Promise<void> => {
      try {
         const authReq = req as AuthenticatedRequest;
         const reviewer = await resolveReviewerFromJwt(req, this.prisma);
         const review = await this.authorReviewService.createReview(
            reviewer,
            req.body as CreateAuthorReviewRequest,
            authReq.user?.id,
         );
         res.status(201).json({
            message: domainMessages.success.authorReviews.created,
            review,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   getReviews = async (req: Request, res: Response): Promise<void> => {
      try {
         const page = req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1;
         const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20;
         const query: AuthorReviewQueryParams = {
            page,
            limit,
            sortBy: (req.query['sortBy'] as AuthorReviewQueryParams['sortBy']) || 'createdAt',
            sortOrder: (req.query['sortOrder'] as AuthorReviewQueryParams['sortOrder']) || 'desc',
            ...(req.query['authorId'] ? { authorId: req.query['authorId'] as string } : {}),
            ...(req.query['reviewerType']
               ? { reviewerType: req.query['reviewerType'] as ReviewerType }
               : {}),
            ...(req.query['reviewerId'] ? { reviewerId: req.query['reviewerId'] as string } : {}),
         };

         const result = await this.authorReviewService.getReviews(query);
         res.json({
            message: domainMessages.success.authorReviews.retrieved,
            reviews: result.reviews,
            pagination: calculatePagination(page, limit, result.totalCount),
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   getReviewById = async (req: Request, res: Response): Promise<void> => {
      try {
         const { id } = req.params as { id: string };
         const review = await this.authorReviewService.getReviewById(id);
         res.json({
            message: domainMessages.success.authorReviews.retrieved_by_id,
            review,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   updateReview = async (req: Request, res: Response): Promise<void> => {
      try {
         const reviewer = await resolveReviewerFromJwt(req, this.prisma);
         const { id } = req.params as { id: string };
         const review = await this.authorReviewService.updateReview(
            id,
            reviewer,
            req.body as UpdateAuthorReviewRequest,
         );
         res.json({
            message: domainMessages.success.authorReviews.updated,
            review,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   deleteReview = async (req: Request, res: Response): Promise<void> => {
      try {
         const reviewer = await resolveReviewerFromJwt(req, this.prisma);
         const { id } = req.params as { id: string };
         await this.authorReviewService.deleteReview(id, reviewer);
         res.json({
            message: domainMessages.success.authorReviews.deleted,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };
}

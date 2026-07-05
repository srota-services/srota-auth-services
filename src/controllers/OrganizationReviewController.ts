import { Request, Response } from 'express';
import { PrismaClient, ReviewerType } from '@prisma/client';
import { OrganizationReviewService } from '../services/OrganizationReviewService';
import {
   CreateOrganizationReviewRequest,
   OrganizationReviewQueryParams,
   UpdateOrganizationReviewRequest,
} from '../models/OrganizationReviewDto';
import { handleDomainError, calculatePagination } from '../utils/domainController';
import { domainMessages } from '../utils/domainMessages';
import { resolveReviewerFromJwt } from '../utils/resolveReviewerFromJwt';
import { AuthenticatedRequest, DomainError } from '../types/domain';

export class OrganizationReviewController {
   private organizationReviewService: OrganizationReviewService;

   constructor(private prisma: PrismaClient) {
      this.organizationReviewService = new OrganizationReviewService(prisma);
   }

   createReview = async (req: Request, res: Response): Promise<void> => {
      try {
         const authReq = req as AuthenticatedRequest;
         const reviewer = await resolveReviewerFromJwt(req, this.prisma);
         const userId = authReq.user?.id;
         if (!userId) {
            throw DomainError.forbidden('Authentication required');
         }

         const review = await this.organizationReviewService.createReview(
            reviewer,
            req.body as CreateOrganizationReviewRequest,
            userId,
         );
         res.status(201).json({
            message: domainMessages.success.organizationReviews.created,
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
         const query: OrganizationReviewQueryParams = {
            page,
            limit,
            sortBy: (req.query['sortBy'] as OrganizationReviewQueryParams['sortBy']) || 'createdAt',
            sortOrder: (req.query['sortOrder'] as OrganizationReviewQueryParams['sortOrder']) || 'desc',
            ...(req.query['organizationId']
               ? { organizationId: req.query['organizationId'] as string }
               : {}),
            ...(req.query['reviewerType']
               ? { reviewerType: req.query['reviewerType'] as ReviewerType }
               : {}),
            ...(req.query['reviewerId'] ? { reviewerId: req.query['reviewerId'] as string } : {}),
         };

         const result = await this.organizationReviewService.getReviews(query);
         res.json({
            message: domainMessages.success.organizationReviews.retrieved,
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
         const review = await this.organizationReviewService.getReviewById(id);
         res.json({
            message: domainMessages.success.organizationReviews.retrieved_by_id,
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
         const review = await this.organizationReviewService.updateReview(
            id,
            reviewer,
            req.body as UpdateOrganizationReviewRequest,
         );
         res.json({
            message: domainMessages.success.organizationReviews.updated,
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
         await this.organizationReviewService.deleteReview(id, reviewer);
         res.json({
            message: domainMessages.success.organizationReviews.deleted,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };
}

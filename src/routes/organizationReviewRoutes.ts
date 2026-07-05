import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { OrganizationReviewController } from '../controllers/OrganizationReviewController';
import {
   validateCreateOrganizationReview,
   validateReviewId,
   validateReviewPagination,
   validateUpdateOrganizationReview,
} from '../middleware/reviewValidation';

export function createOrganizationReviewRoutes(prisma: PrismaClient): Router {
   const router = Router();
   const controller = new OrganizationReviewController(prisma);

   router.post('/', validateCreateOrganizationReview, controller.createReview);
   router.get('/', validateReviewPagination, controller.getReviews);
   router.get('/:id', validateReviewId, controller.getReviewById);
   router.put('/:id', validateReviewId, validateUpdateOrganizationReview, controller.updateReview);
   router.delete('/:id', validateReviewId, controller.deleteReview);

   return router;
}

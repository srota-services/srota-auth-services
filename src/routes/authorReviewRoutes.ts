import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthorReviewController } from '../controllers/AuthorReviewController';
import {
   validateCreateAuthorReview,
   validateReviewId,
   validateReviewPagination,
   validateUpdateAuthorReview,
} from '../middleware/reviewValidation';

export function createAuthorReviewRoutes(prisma: PrismaClient): Router {
   const router = Router();
   const controller = new AuthorReviewController(prisma);

   router.post('/', validateCreateAuthorReview, controller.createReview);
   router.get('/', validateReviewPagination, controller.getReviews);
   router.get('/:id', validateReviewId, controller.getReviewById);
   router.put('/:id', validateReviewId, validateUpdateAuthorReview, controller.updateReview);
   router.delete('/:id', validateReviewId, controller.deleteReview);

   return router;
}

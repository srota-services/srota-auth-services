import { NextFunction, Request, Response } from 'express';
import { DomainError } from '../types/domain';
import { domainMessages } from '../utils/domainMessages';

const validationMsg = domainMessages.error.validation;

export function validateCreateOrganizationReview(req: Request, _res: Response, next: NextFunction): void {
   const { organizationId, rating, description } = req.body as Record<string, unknown>;

   if (!organizationId || typeof organizationId !== 'string' || organizationId.trim().length === 0) {
      next(DomainError.validation(validationMsg.organization_id_required));
      return;
   }

   if (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5) {
      next(DomainError.validation(validationMsg.review_rating_invalid));
      return;
   }

   if (
      description !== undefined &&
      description !== null &&
      (typeof description !== 'string' || description.length > 2000)
   ) {
      next(DomainError.validation(validationMsg.description_length));
      return;
   }

   next();
}

export function validateUpdateOrganizationReview(req: Request, _res: Response, next: NextFunction): void {
   const { rating, description } = req.body as Record<string, unknown>;

   if (rating !== undefined && (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5)) {
      next(DomainError.validation(validationMsg.review_rating_invalid));
      return;
   }

   if (
      description !== undefined &&
      description !== null &&
      (typeof description !== 'string' || description.length > 2000)
   ) {
      next(DomainError.validation(validationMsg.description_length));
      return;
   }

   if (rating === undefined && description === undefined) {
      next(DomainError.validation(validationMsg.update_field_required));
      return;
   }

   next();
}

export function validateCreateAuthorReview(req: Request, _res: Response, next: NextFunction): void {
   const { authorId, rating, description } = req.body as Record<string, unknown>;

   if (!authorId || typeof authorId !== 'string' || authorId.trim().length === 0) {
      next(DomainError.validation(validationMsg.author_id_required));
      return;
   }

   if (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5) {
      next(DomainError.validation(validationMsg.review_rating_invalid));
      return;
   }

   if (
      description !== undefined &&
      description !== null &&
      (typeof description !== 'string' || description.length > 2000)
   ) {
      next(DomainError.validation(validationMsg.description_length));
      return;
   }

   next();
}

export function validateUpdateAuthorReview(req: Request, _res: Response, next: NextFunction): void {
   const { rating, description } = req.body as Record<string, unknown>;

   if (rating !== undefined && (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5)) {
      next(DomainError.validation(validationMsg.review_rating_invalid));
      return;
   }

   if (
      description !== undefined &&
      description !== null &&
      (typeof description !== 'string' || description.length > 2000)
   ) {
      next(DomainError.validation(validationMsg.description_length));
      return;
   }

   if (rating === undefined && description === undefined) {
      next(DomainError.validation(validationMsg.update_field_required));
      return;
   }

   next();
}

export function validateReviewPagination(req: Request, _res: Response, next: NextFunction): void {
   const page = req.query['page'];
   const limit = req.query['limit'];

   if (page !== undefined) {
      const pageNum = parseInt(String(page), 10);
      if (Number.isNaN(pageNum) || pageNum < 1) {
         next(DomainError.validation('Page must be a positive integer'));
         return;
      }
   }

   if (limit !== undefined) {
      const limitNum = parseInt(String(limit), 10);
      if (Number.isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
         next(DomainError.validation('Limit must be between 1 and 100'));
         return;
      }
   }

   next();
}

export function validateReviewId(req: Request, _res: Response, next: NextFunction): void {
   const { id } = req.params;
   if (!id || typeof id !== 'string' || id.trim().length === 0) {
      next(DomainError.validation('Review ID is required'));
      return;
   }
   next();
}

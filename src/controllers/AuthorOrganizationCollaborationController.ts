import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import {
   AuthorOrganizationCollaborationService,
   authorCollaborationSuccessMessages,
} from '../services/AuthorOrganizationCollaborationService';
import { handleDomainError } from '../utils/domainController';
import { DomainError, AuthenticatedRequest } from '../types/domain';
import {
   CounterCollaborationBudgetDto,
   CreateAuthorOrganizationCollaborationDto,
   NegotiateCollaborationDto,
} from '../models/AuthorOrganizationCollaborationDto';

function getAuthContext(req: Request): { userId: string; role: string | undefined } {
   const authReq = req as AuthenticatedRequest;
   if (!authReq.user?.id) {
      throw DomainError.forbidden('Authentication required');
   }
   return { userId: authReq.user.id, role: authReq.user.role };
}

export class AuthorOrganizationCollaborationController {
   private readonly collaborationService: AuthorOrganizationCollaborationService;

   constructor(prisma: PrismaClient) {
      this.collaborationService = new AuthorOrganizationCollaborationService(prisma);
   }

   createRequest = async (req: Request, res: Response): Promise<void> => {
      try {
         const { userId } = getAuthContext(req);
         const body = req.body as CreateAuthorOrganizationCollaborationDto;
         const attachmentFiles =
            (req as Request & { collaborationAttachmentFiles?: Express.Multer.File[] })
               .collaborationAttachmentFiles ?? [];

         if (!body.organizationId?.trim()) {
            throw DomainError.validation('Organization ID is required');
         }

         const collaboration = await this.collaborationService.createRequest(
            userId,
            body.organizationId.trim(),
            body.description,
            body.authorBudget,
            body.currency,
            attachmentFiles,
         );

         res.status(201).json({
            message: authorCollaborationSuccessMessages.created,
            collaboration,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   listMyCollaborations = async (req: Request, res: Response): Promise<void> => {
      try {
         const { userId } = getAuthContext(req);
         const collaborations = await this.collaborationService.listForAuthor(userId);

         res.status(200).json({
            message: authorCollaborationSuccessMessages.retrieved,
            collaborations,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   counterBudget = async (req: Request, res: Response): Promise<void> => {
      try {
         const { collaborationId } = req.params as { collaborationId: string };
         const { authorBudget } = req.body as CounterCollaborationBudgetDto;
         const { userId } = getAuthContext(req);

         const collaboration = await this.collaborationService.counterBudget(
            collaborationId,
            userId,
            authorBudget,
         );

         res.status(200).json({
            message: authorCollaborationSuccessMessages.countered,
            collaboration,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   abort = async (req: Request, res: Response): Promise<void> => {
      try {
         const { collaborationId } = req.params as { collaborationId: string };
         const { userId } = getAuthContext(req);

         const collaboration = await this.collaborationService.abort(collaborationId, userId);

         res.status(200).json({
            message: authorCollaborationSuccessMessages.aborted,
            collaboration,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   listOrganizationCollaborations = async (req: Request, res: Response): Promise<void> => {
      try {
         const { organizationId } = req.params as { organizationId: string };
         const { userId, role } = getAuthContext(req);

         const collaborations = await this.collaborationService.listForOrganization(
            organizationId,
            userId,
            role,
         );

         res.status(200).json({
            message: authorCollaborationSuccessMessages.retrieved,
            collaborations,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   accept = async (req: Request, res: Response): Promise<void> => {
      try {
         const { organizationId, collaborationId } = req.params as {
            organizationId: string;
            collaborationId: string;
         };
         const { userId, role } = getAuthContext(req);

         const collaboration = await this.collaborationService.accept(
            organizationId,
            collaborationId,
            userId,
            role,
         );

         res.status(200).json({
            message: authorCollaborationSuccessMessages.accepted,
            collaboration,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   reject = async (req: Request, res: Response): Promise<void> => {
      try {
         const { organizationId, collaborationId } = req.params as {
            organizationId: string;
            collaborationId: string;
         };
         const { userId, role } = getAuthContext(req);

         const collaboration = await this.collaborationService.reject(
            organizationId,
            collaborationId,
            userId,
            role,
         );

         res.status(200).json({
            message: authorCollaborationSuccessMessages.rejected,
            collaboration,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   negotiate = async (req: Request, res: Response): Promise<void> => {
      try {
         const { organizationId, collaborationId } = req.params as {
            organizationId: string;
            collaborationId: string;
         };
         const { organizationAsk } = req.body as NegotiateCollaborationDto;
         const { userId, role } = getAuthContext(req);

         const collaboration = await this.collaborationService.negotiate(
            organizationId,
            collaborationId,
            userId,
            role,
            organizationAsk,
         );

         res.status(200).json({
            message: authorCollaborationSuccessMessages.negotiated,
            collaboration,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };
}

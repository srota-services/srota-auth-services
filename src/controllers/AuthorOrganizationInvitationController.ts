import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import {
   AuthorOrganizationInvitationService,
   authorInvitationSuccessMessages,
} from '../services/AuthorOrganizationInvitationService';
import { handleDomainError } from '../utils/domainController';
import { DomainError, AuthenticatedRequest } from '../types/domain';
import {
   ConfirmOrgContactDto,
   CreateAuthorOrganizationInvitationDto,
   JoinOrganizationInvitationDto,
   RevealContactDto,
} from '../models/AuthorOrganizationInvitationDto';

function getAuthContext(req: Request): { userId: string; role: string | undefined } {
   const authReq = req as AuthenticatedRequest;
   if (!authReq.user?.id) {
      throw DomainError.forbidden('Authentication required');
   }
   return { userId: authReq.user.id, role: authReq.user.role };
}

export class AuthorOrganizationInvitationController {
   private readonly invitationService: AuthorOrganizationInvitationService;

   constructor(prisma: PrismaClient) {
      this.invitationService = new AuthorOrganizationInvitationService(prisma);
   }

   createInvitation = async (req: Request, res: Response): Promise<void> => {
      try {
         const { organizationId } = req.params as { organizationId: string };
         const { authorId } = req.body as CreateAuthorOrganizationInvitationDto;
         const { userId, role } = getAuthContext(req);

         if (!authorId?.trim()) {
            throw DomainError.validation('Author ID is required');
         }

         const invitation = await this.invitationService.createInvitation(
            organizationId,
            authorId.trim(),
            userId,
            role,
         );

         res.status(201).json({
            message: authorInvitationSuccessMessages.created,
            invitation,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   listOrganizationInvitations = async (req: Request, res: Response): Promise<void> => {
      try {
         const { organizationId } = req.params as { organizationId: string };
         const { userId, role } = getAuthContext(req);

         const invitations = await this.invitationService.listForOrganization(
            organizationId,
            userId,
            role,
         );

         res.status(200).json({
            message: authorInvitationSuccessMessages.retrieved,
            invitations,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   listOrganizationAuthors = async (req: Request, res: Response): Promise<void> => {
      try {
         const { organizationId } = req.params as { organizationId: string };
         const { userId, role } = getAuthContext(req);

         const authors = await this.invitationService.listLinkedAuthorsForOrganization(
            organizationId,
            userId,
            role,
         );

         res.status(200).json({
            message: authorInvitationSuccessMessages.authors_retrieved,
            authors,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   listMyInvitations = async (req: Request, res: Response): Promise<void> => {
      try {
         const { userId } = getAuthContext(req);
         const invitations = await this.invitationService.listForAuthor(userId);

         res.status(200).json({
            message: authorInvitationSuccessMessages.retrieved,
            invitations,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   revealContact = async (req: Request, res: Response): Promise<void> => {
      try {
         const { invitationId } = req.params as { invitationId: string };
         const { reveal } = req.body as RevealContactDto;
         const { userId } = getAuthContext(req);

         if (typeof reveal !== 'boolean') {
            throw DomainError.validation('reveal must be a boolean');
         }

         const invitation = await this.invitationService.revealContact(
            invitationId,
            userId,
            reveal,
         );

         res.status(200).json({
            message: reveal
               ? authorInvitationSuccessMessages.contact_revealed
               : authorInvitationSuccessMessages.declined,
            invitation,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   confirmOrgContact = async (req: Request, res: Response): Promise<void> => {
      try {
         const { invitationId } = req.params as { invitationId: string };
         const { contacted } = req.body as ConfirmOrgContactDto;
         const { userId } = getAuthContext(req);

         if (typeof contacted !== 'boolean') {
            throw DomainError.validation('contacted must be a boolean');
         }

         const invitation = await this.invitationService.confirmOrgContact(
            invitationId,
            userId,
            contacted,
         );

         res.status(200).json({
            message: contacted
               ? authorInvitationSuccessMessages.contact_confirmed
               : authorInvitationSuccessMessages.awaiting_org_contact,
            invitation,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   decideJoin = async (req: Request, res: Response): Promise<void> => {
      try {
         const { invitationId } = req.params as { invitationId: string };
         const { accept } = req.body as JoinOrganizationInvitationDto;
         const { userId } = getAuthContext(req);

         if (typeof accept !== 'boolean') {
            throw DomainError.validation('accept must be a boolean');
         }

         const invitation = await this.invitationService.decideJoin(
            invitationId,
            userId,
            accept,
         );

         res.status(200).json({
            message: accept
               ? authorInvitationSuccessMessages.joined
               : authorInvitationSuccessMessages.declined,
            invitation,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };
}

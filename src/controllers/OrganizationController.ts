import { Request, Response } from 'express';
import { PrismaClient, OrganizationRole } from '@prisma/client';
import {
   OrganizationService,
   hasOwnerTierOrgAccess,
} from '../services/OrganizationService';
import { handleDomainError, calculatePagination } from '../utils/domainController';
import { domainMessages } from '../utils/domainMessages';
import { DomainError, AuthenticatedRequest } from '../types/domain';
import { isGlobalAdminRole } from '../constants/authRoles';
import {
   CreateOrganizationDto,
   OrganizationTeamSizeType,
   UpdateOrganizationDto,
} from '../models/OrganizationDto';

function parseOptionalString(value: unknown): string | undefined {
   if (value === undefined || value === null || typeof value !== 'string') {
      return undefined;
   }
   return value.trim();
}

function parseProfileFieldsFromBody(
   body: Record<string, unknown>,
   isUpdate: boolean,
): Pick<CreateOrganizationDto, 'preferredGenre' | 'websiteUrl' | 'teamSize'> {
   const result: Pick<CreateOrganizationDto, 'preferredGenre' | 'websiteUrl' | 'teamSize'> = {};

   if (body['preferredGenre'] !== undefined) {
      const preferredGenre = parseOptionalString(body['preferredGenre']);
      if (isUpdate) {
         result.preferredGenre = preferredGenre && preferredGenre.length > 0 ? preferredGenre : null;
      } else if (preferredGenre && preferredGenre.length > 0) {
         result.preferredGenre = preferredGenre;
      }
   }

   if (body['websiteUrl'] !== undefined) {
      const websiteUrl = parseOptionalString(body['websiteUrl']);
      if (isUpdate) {
         result.websiteUrl = websiteUrl && websiteUrl.length > 0 ? websiteUrl : null;
      } else if (websiteUrl && websiteUrl.length > 0) {
         result.websiteUrl = websiteUrl;
      }
   }

   if (body['teamSize'] !== undefined) {
      const teamSize = parseOptionalString(body['teamSize']);
      if (isUpdate) {
         result.teamSize = teamSize && teamSize.length > 0 ? (teamSize as OrganizationTeamSizeType) : null;
      } else if (teamSize && teamSize.length > 0) {
         result.teamSize = teamSize as OrganizationTeamSizeType;
      }
   }

   return result;
}

function isGlobalAdmin(req: Request): boolean {
   const authReq = req as AuthenticatedRequest;
   return isGlobalAdminRole(authReq.user?.role);
}

function getUserId(req: Request): string {
   const authReq = req as AuthenticatedRequest;
   if (!authReq.user?.id) {
      throw DomainError.forbidden('Authentication required');
   }
   return authReq.user.id;
}

export class OrganizationController {
   private organizationService: OrganizationService;

   constructor(prisma: PrismaClient) {
      this.organizationService = new OrganizationService(prisma);
   }

   private async assertOrgAdmin(req: Request, organizationId: string): Promise<void> {
      if (isGlobalAdmin(req)) {
         return;
      }
      const authReq = req as AuthenticatedRequest;
      const userId = getUserId(req);
      const hasAccess = await this.organizationService.hasOrgStaffAccess(
         organizationId,
         userId,
         authReq.user?.role,
      );
      if (!hasAccess) {
         throw DomainError.forbidden(domainMessages.error.organizations.admin_required);
      }
   }

   private async assertOrgMember(req: Request, organizationId: string): Promise<void> {
      if (isGlobalAdmin(req)) {
         return;
      }
      const userId = getUserId(req);
      const isMember = await this.organizationService.isMember(organizationId, userId);
      if (!isMember) {
         throw DomainError.forbidden(domainMessages.error.organizations.access_denied);
      }
   }

   createOrganization = async (req: Request, res: Response): Promise<void> => {
      try {
         const userId = getUserId(req);
         const uploadedImage = (req as Request & { organizationImageFile?: Express.Multer.File })
            .organizationImageFile;

         const imageSourcePath = uploadedImage?.path;

         const createData: CreateOrganizationDto = {
            ...req.body,
            ...parseProfileFieldsFromBody(req.body, false),
         };

         const created = await this.organizationService.createOrganization(
            createData,
            userId,
            imageSourcePath,
         );
         res.status(201).json({
            message: domainMessages.success.organizations.created,
            organization: created,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   listMyOrganizations = async (req: Request, res: Response): Promise<void> => {
      try {
         const userId = getUserId(req);
         const memberships = await this.organizationService.getOrganizationsForUser(userId);
         res.status(200).json({
            message: domainMessages.success.organizations.retrieved,
            organizations: memberships,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   listMyOrganizationMemberships = async (req: Request, res: Response): Promise<void> => {
      try {
         const userId = getUserId(req);
         const memberships = await this.organizationService.getOrganizationsForUser(userId);
         res.status(200).json({
            message: domainMessages.success.organizations.retrieved,
            memberships: memberships.map((membership) => ({
               organizationId: membership.organizationId,
               role: membership.role,
            })),
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   listAllOrganizations = async (req: Request, res: Response): Promise<void> => {
      try {
         const page = req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1;
         const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 10;
         const result = await this.organizationService.listOrganizations({ page, limit });
         res.status(200).json({
            message: domainMessages.success.organizations.all_retrieved,
            organizations: result.organizations,
            pagination: calculatePagination(page, limit, result.totalCount),
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   getOrganizationById = async (req: Request, res: Response): Promise<void> => {
      try {
         const { id } = req.params as { id: string };
         await this.assertOrgMember(req, id);
         const organization = await this.organizationService.getOrganizationById(id);
         res.status(200).json({
            message: domainMessages.success.organizations.retrieved_by_id,
            organization,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   updateOrganization = async (req: Request, res: Response): Promise<void> => {
      try {
         const { id } = req.params as { id: string };
         await this.assertOrgAdmin(req, id);

         const uploadedImage = (req as Request & { organizationImageFile?: Express.Multer.File })
            .organizationImageFile;
         const updateData: UpdateOrganizationDto = {
            ...req.body,
            ...parseProfileFieldsFromBody(req.body, true),
         };

         if (uploadedImage) {
            const updated = await this.organizationService.updateOrganization(
               id,
               updateData,
               uploadedImage.path,
            );
            res.status(200).json({
               message: domainMessages.success.organizations.updated,
               organization: updated,
            });
            return;
         }

         const updated = await this.organizationService.updateOrganization(id, updateData);
         res.status(200).json({
            message: domainMessages.success.organizations.updated,
            organization: updated,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   deleteOrganization = async (req: Request, res: Response): Promise<void> => {
      try {
         const { id } = req.params as { id: string };

         if (!isGlobalAdmin(req)) {
            const authReq = req as AuthenticatedRequest;
            const userId = getUserId(req);
            const membershipRole = await this.organizationService.getMemberRole(id, userId);
            if (!hasOwnerTierOrgAccess(authReq.user?.role, membershipRole)) {
               throw DomainError.forbidden(domainMessages.error.organizations.owner_required);
            }
         }

         await this.organizationService.deleteOrganization(id);
         res.status(200).json({
            message: domainMessages.success.organizations.deleted,
            deleted: true,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   listMembers = async (req: Request, res: Response): Promise<void> => {
      try {
         const { id } = req.params as { id: string };
         await this.assertOrgMember(req, id);
         const members = await this.organizationService.listMembers(id);
         res.status(200).json({
            message: domainMessages.success.organizations.members_retrieved,
            members,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   getMyMembership = async (req: Request, res: Response): Promise<void> => {
      try {
         const { id } = req.params as { id: string };
         const userId = getUserId(req);
         const membership = await this.organizationService.getMyMembership(id, userId);
         if (!membership) {
            throw DomainError.notFound(domainMessages.error.organizations.membership_not_found);
         }
         res.status(200).json({
            message: domainMessages.success.organizations.membership_retrieved,
            membership,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   addMember = async (req: Request, res: Response): Promise<void> => {
      try {
         const { id } = req.params as { id: string };
         const hasMembers = await this.organizationService.hasMembers(id);
         if (hasMembers) {
            await this.assertOrgAdmin(req, id);
         }

         const { userId, role } = req.body || {};
         if (!userId || typeof userId !== 'string') {
            throw DomainError.validation(domainMessages.error.validation.user_id_required);
         }
         if (role !== undefined && !Object.values(OrganizationRole).includes(role)) {
            throw DomainError.validation(domainMessages.error.organizations.role_invalid);
         }

         const member = await this.organizationService.addMember(
            id,
            userId,
            (role as OrganizationRole) || OrganizationRole.ADMIN,
         );
         res.status(201).json({
            message: domainMessages.success.organizations.member_added,
            member,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   updateMemberRole = async (req: Request, res: Response): Promise<void> => {
      try {
         const { id, userId } = req.params as { id: string; userId: string };
         await this.assertOrgAdmin(req, id);

         const { role } = req.body || {};
         if (!role || !Object.values(OrganizationRole).includes(role)) {
            throw DomainError.validation(domainMessages.error.organizations.role_invalid);
         }

         const updated = await this.organizationService.updateMemberRole(
            id,
            userId,
            role as OrganizationRole,
         );
         res.status(200).json({
            message: domainMessages.success.organizations.member_updated,
            member: updated,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   removeMember = async (req: Request, res: Response): Promise<void> => {
      try {
         const { id, userId } = req.params as { id: string; userId: string };
         await this.assertOrgAdmin(req, id);
         await this.organizationService.removeMember(id, userId);
         res.status(200).json({
            message: domainMessages.success.organizations.member_removed,
            removed: true,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   checkAuthorOrganizationLink = async (req: Request, res: Response): Promise<void> => {
      try {
         const { authorId, organizationId } = req.params as {
            authorId: string;
            organizationId: string;
         };
         const linked = await this.organizationService.isAuthorLinkedToOrganization(
            authorId,
            organizationId,
         );
         res.status(200).json({ linked });
      } catch (error) {
         handleDomainError(res, error);
      }
   };
}

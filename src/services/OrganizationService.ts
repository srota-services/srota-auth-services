import { OrganizationTeamSize, Prisma, PrismaClient, OrganizationRole } from '@prisma/client';
import {
   OrganizationDto,
   OrganizationMemberDto,
   OrganizationTeamSizeType,
   CreateOrganizationDto,
   UpdateOrganizationDto,
   parseTeamSizeFromApi,
   toOrganizationDto,
   toOrganizationMemberDto,
} from '../models/OrganizationDto';
import { DomainError } from '../types/domain';
import { domainMessages } from '../utils/domainMessages';
import { fileUrlService } from './FileUrlService';
import { generateOrganizationSlug } from '../utils/slug';
import { runInTransaction, runWrite } from '../utils/prismaTransaction';
import { rethrowServiceError } from '../utils/serviceError';
import { rabbitmqService } from './rabbitmq';
import { mediaCleanupService } from './MediaCleanupService';
import { ImageAssetService } from './ImageAssetService';
import { emitCacheInvalidation } from './DomainEventPublisher';
import {
   AuthRole,
   isOrgAdminRole,
   isOrgCoordinatorRole,
   isGlobalAdminRole,
   normalizeAuthRole,
} from '../constants/authRoles';

const msg = domainMessages.error.organizations;

export function hasOwnerTierOrgAccess(
   jwtRole: string | undefined,
   membershipRole: OrganizationRole | null,
): boolean {
   if (isGlobalAdminRole(jwtRole)) {
      return true;
   }
   return isOrgAdminRole(jwtRole) && membershipRole === OrganizationRole.OWNER;
}

export function hasCoordinatorTierOrgAccess(
   jwtRole: string | undefined,
   membershipRole: OrganizationRole | null,
): boolean {
   if (isGlobalAdminRole(jwtRole)) {
      return true;
   }
   return isOrgCoordinatorRole(jwtRole) && membershipRole === OrganizationRole.ADMIN;
}

export function hasOrgStaffAccess(
   jwtRole: string | undefined,
   membershipRole: OrganizationRole | null,
): boolean {
   return (
      hasOwnerTierOrgAccess(jwtRole, membershipRole) ||
      hasCoordinatorTierOrgAccess(jwtRole, membershipRole)
   );
}

export class OrganizationService {
   private imageAssetService: ImageAssetService;

   constructor(private prisma: PrismaClient) {
      this.imageAssetService = new ImageAssetService(prisma);
   }

   async createOrganization(
      data: CreateOrganizationDto,
      creatorUserId?: string,
      imageSourcePath?: string,
   ): Promise<OrganizationDto> {
      const name = data.name?.trim();
      if (!name) {
         throw DomainError.validation(msg.name_required);
      }
      if (name.length > 100) {
         throw DomainError.validation(msg.name_too_long);
      }

      const preferredGenre = this.normalizePreferredGenreName(data.preferredGenre);
      const websiteUrl = this.normalizeWebsiteUrl(data.websiteUrl);
      const teamSize = this.normalizeTeamSize(data.teamSize);

      try {
         const organization = await runInTransaction(this.prisma, async (tx) => {
            const slug = await generateOrganizationSlug(tx as PrismaClient, name);

            const created = await tx.organization.create({
               data: {
                  name,
                  slug,
                  description: data.description?.trim() || null,
                  image: data.image ?? null,
                  preferredGenre,
                  websiteUrl,
                  teamSize,
                  discoverable: data.discoverable ?? false,
               },
            });

            if (creatorUserId) {
               await tx.organizationMember.create({
                  data: {
                     organizationId: created.id,
                     userId: creatorUserId,
                     role: OrganizationRole.OWNER,
                  },
               });
            }

            return created;
         });

         if (imageSourcePath) {
            const { primaryStorageKey } = await this.imageAssetService.generateAndStoreVariants(
               'organization',
               organization.id,
               imageSourcePath,
            );
            const updated = await runWrite(this.prisma, (tx) =>
               tx.organization.update({
                  where: { id: organization.id },
                  data: { image: primaryStorageKey },
               }),
            );
            emitCacheInvalidation('organization', 'created', organization.id);
            try {
               await rabbitmqService.publishOrganizationCreated({ organizationId: organization.id });
            } catch (publishError) {
               rethrowServiceError(publishError, { operation: 'createOrganization.publishOrganizationCreated' }, msg.create_failed);
            }
            return fileUrlService.resolveOrganizationMedia(toOrganizationDto(updated));
         }

         emitCacheInvalidation('organization', 'created', organization.id);
         try {
            await rabbitmqService.publishOrganizationCreated({ organizationId: organization.id });
         } catch (publishError) {
            rethrowServiceError(publishError, { operation: 'createOrganization.publishOrganizationCreated' }, msg.create_failed);
         }
         return fileUrlService.resolveOrganizationMedia(toOrganizationDto(organization));
      } catch (error) {
         rethrowServiceError(error, { operation: 'createOrganization' }, msg.create_failed);
      }
   }

   async listDiscoverableOrganizations(params: { page?: number; limit?: number } = {}): Promise<{
      organizations: OrganizationDto[];
      totalCount: number;
   }> {
      const page = Math.max(1, params.page ?? 1);
      const limit = Math.min(100, Math.max(1, params.limit ?? 10));
      const skip = (page - 1) * limit;

      try {
         const where = { discoverable: true };
         const [organizations, totalCount] = await Promise.all([
            this.prisma.organization.findMany({
               where,
               skip,
               take: limit,
               orderBy: { name: 'asc' },
               include: { _count: { select: { members: true } } },
            }),
            this.prisma.organization.count({ where }),
         ]);

         const dtos = organizations.map(toOrganizationDto);
         return {
            organizations: await fileUrlService.resolveOrganizationMediaList(dtos),
            totalCount,
         };
      } catch (error) {
         rethrowServiceError(error, { operation: 'listDiscoverableOrganizations' }, msg.fetch_failed);
      }
   }

   async listOrganizations(params: { page?: number; limit?: number } = {}): Promise<{
      organizations: OrganizationDto[];
      totalCount: number;
   }> {
      const page = Math.max(1, params.page ?? 1);
      const limit = Math.min(100, Math.max(1, params.limit ?? 10));
      const skip = (page - 1) * limit;

      try {
         const [organizations, totalCount] = await Promise.all([
            this.prisma.organization.findMany({
               skip,
               take: limit,
               orderBy: { name: 'asc' },
               include: { _count: { select: { members: true } } },
            }),
            this.prisma.organization.count(),
         ]);

         const dtos = organizations.map(toOrganizationDto);
         return {
            organizations: await fileUrlService.resolveOrganizationMediaList(dtos),
            totalCount,
         };
      } catch (error) {
         rethrowServiceError(error, { operation: 'listOrganizations' }, msg.fetch_failed);
      }
   }

   async getOrganizationsForUser(userId: string): Promise<OrganizationMemberDto[]> {
      try {
         const memberships = await this.prisma.organizationMember.findMany({
            where: { userId },
            include: { organization: true },
            orderBy: { joinedAt: 'desc' },
         });
         const memberDtos = memberships.map(toOrganizationMemberDto);
         return Promise.all(
            memberDtos.map(async (member) => {
               if (!member.organization) {
                  return member;
               }
               const organization = await fileUrlService.resolveOrganizationMedia(member.organization);
               return { ...member, organization };
            }),
         );
      } catch (error) {
         rethrowServiceError(error, { operation: 'getOrganizationsForUser' }, msg.fetch_failed);
      }
   }

   async getOrganizationById(id: string): Promise<OrganizationDto> {
      try {
         const organization = await this.prisma.organization.findUnique({
            where: { id },
            include: { _count: { select: { members: true } } },
         });
         if (!organization) {
            throw DomainError.notFound(msg.not_found);
         }
         return fileUrlService.resolveOrganizationMedia(toOrganizationDto(organization));
      } catch (error) {
         rethrowServiceError(error, { operation: 'getOrganizationById' }, msg.fetch_failed);
      }
   }

   async getOrganizationBySlug(slug: string): Promise<OrganizationDto | null> {
      const organization = await this.prisma.organization.findUnique({
         where: { slug },
         include: { _count: { select: { members: true } } },
      });
      if (!organization) {
         return null;
      }
      return fileUrlService.resolveOrganizationMedia(toOrganizationDto(organization));
   }

   async updateOrganization(
      id: string,
      data: UpdateOrganizationDto,
      imageSourcePath?: string,
   ): Promise<OrganizationDto> {
      const updates: Prisma.OrganizationUpdateInput = {};

      if (data.name !== undefined) {
         const name = data.name.trim();
         if (!name) {
            throw DomainError.validation(msg.name_required);
         }
         if (name.length > 100) {
            throw DomainError.validation(msg.name_too_long);
         }
         updates.name = name;
      }

      if (data.description !== undefined) {
         updates.description = data.description.trim() || null;
      }

      if (data.image !== undefined && !imageSourcePath) {
         updates.image = data.image;
      }

      if (data.preferredGenre !== undefined) {
         updates.preferredGenre = this.normalizePreferredGenreName(data.preferredGenre);
      }

      if (data.websiteUrl !== undefined) {
         updates.websiteUrl = this.normalizeWebsiteUrl(data.websiteUrl);
      }

      if (data.teamSize !== undefined) {
         updates.teamSize = this.normalizeTeamSize(data.teamSize);
      }

      if (data.discoverable !== undefined) {
         updates.discoverable = data.discoverable;
      }

      if (Object.keys(updates).length === 0 && !imageSourcePath) {
         throw DomainError.validation(domainMessages.error.validation.no_update_fields);
      }

      try {
         const existing = await this.prisma.organization.findUnique({ where: { id } });
         if (!existing) {
            throw DomainError.notFound(msg.not_found);
         }

         let updated = existing;
         if (Object.keys(updates).length > 0) {
            updated = await runWrite(this.prisma, (tx) =>
               tx.organization.update({
                  where: { id },
                  data: updates,
               }),
            );
         }

         if (imageSourcePath) {
            const { primaryStorageKey } = await this.imageAssetService.generateAndStoreVariants(
               'organization',
               id,
               imageSourcePath,
            );
            updated = await runWrite(this.prisma, (tx) =>
               tx.organization.update({
                  where: { id },
                  data: { image: primaryStorageKey },
               }),
            );
         } else if (data.image !== undefined && data.image !== existing.image) {
            await this.imageAssetService.deleteAssetsForEntity('organization', id);
            await mediaCleanupService.deleteStoredFile(existing.image);
         }

         emitCacheInvalidation('organization', 'updated', id);
         return fileUrlService.resolveOrganizationMedia(toOrganizationDto(updated));
      } catch (error) {
         rethrowServiceError(error, { operation: 'updateOrganization' }, msg.update_failed);
      }
   }

   async deleteOrganization(id: string): Promise<void> {
      try {
         const existing = await this.prisma.organization.findUnique({ where: { id } });
         if (!existing) {
            throw DomainError.notFound(msg.not_found);
         }

         const orgImage = existing.image;
         await this.imageAssetService.deleteAssetsForEntity('organization', id);
         await runWrite(this.prisma, (tx) => tx.organization.delete({ where: { id } }));

         try {
            await rabbitmqService.publishOrganizationDeleted({ organizationId: id });
         } catch (error) {
            console.error(`Failed to publish organization.deleted for organization ${id}:`, error);
         }

         await mediaCleanupService.deleteStoredFile(orgImage);
         emitCacheInvalidation('organization', 'deleted', id);
      } catch (error) {
         rethrowServiceError(error, { operation: 'deleteOrganization' }, msg.delete_failed);
      }
   }

   async validateMemberAuthEligibility(
      userId: string,
      membershipRole: OrganizationRole,
   ): Promise<void> {
      const user = await this.prisma.user.findUnique({
         where: { id: userId },
         select: { role: true },
      });

      if (!user) {
         throw DomainError.notFound(domainMessages.error.users.not_found);
      }

      if (normalizeAuthRole(user.role) === normalizeAuthRole(AuthRole.LISTENER)) {
         throw DomainError.conflict(msg.listener_member_not_allowed);
      }

      if (membershipRole === OrganizationRole.OWNER && !isOrgAdminRole(user.role)) {
         throw DomainError.conflict(msg.member_role_mismatch);
      }

      if (membershipRole === OrganizationRole.ADMIN && !isOrgCoordinatorRole(user.role)) {
         throw DomainError.conflict(msg.member_role_mismatch);
      }
   }

   async addMember(
      organizationId: string,
      userId: string,
      role: OrganizationRole = OrganizationRole.ADMIN,
   ): Promise<OrganizationMemberDto> {
      try {
         const [organization, user] = await Promise.all([
            this.prisma.organization.findUnique({ where: { id: organizationId } }),
            this.prisma.user.findUnique({ where: { id: userId } }),
         ]);

         if (!organization) {
            throw DomainError.notFound(msg.not_found);
         }
         if (!user) {
            throw DomainError.notFound(domainMessages.error.users.not_found);
         }

         await this.validateMemberAuthEligibility(userId, role);

         const existing = await this.prisma.organizationMember.findUnique({
            where: {
               userId_organizationId: { userId, organizationId },
            },
         });
         if (existing) {
            throw DomainError.conflict(msg.member_exists);
         }

         const member = await runWrite(this.prisma, (tx) =>
            tx.organizationMember.create({
               data: { organizationId, userId, role },
               include: { organization: true },
            }),
         );

         const dto = toOrganizationMemberDto(member);
         if (dto.organization) {
            dto.organization = await fileUrlService.resolveOrganizationMedia(dto.organization);
         }
         emitCacheInvalidation('organization-member', 'created', member.id, { organizationId });
         return dto;
      } catch (error) {
         rethrowServiceError(error, { operation: 'addMember' }, msg.add_member_failed);
      }
   }

   async listMembers(organizationId: string): Promise<OrganizationMemberDto[]> {
      try {
         const organization = await this.prisma.organization.findUnique({
            where: { id: organizationId },
         });
         if (!organization) {
            throw DomainError.notFound(msg.not_found);
         }
         const members = await this.prisma.organizationMember.findMany({
            where: { organizationId },
            include: {
               organization: true,
               user: {
                  select: {
                     email: true,
                     firstName: true,
                     lastName: true,
                     contact: true,
                  },
               },
            },
            orderBy: { joinedAt: 'asc' },
         });
         return members.map(toOrganizationMemberDto);
      } catch (error) {
         rethrowServiceError(error, { operation: 'listMembers' }, msg.fetch_members_failed);
      }
   }

   async updateMemberRole(
      organizationId: string,
      userId: string,
      role: OrganizationRole,
   ): Promise<OrganizationMemberDto> {
      try {
         const member = await this.prisma.organizationMember.findUnique({
            where: { userId_organizationId: { userId, organizationId } },
         });
         if (!member) {
            throw DomainError.notFound(msg.member_not_found);
         }

         await this.validateMemberAuthEligibility(userId, role);

         if (member.role === OrganizationRole.OWNER && role !== OrganizationRole.OWNER) {
            const ownerCount = await this.prisma.organizationMember.count({
               where: { organizationId, role: OrganizationRole.OWNER },
            });
            if (ownerCount <= 1) {
               throw DomainError.validation(msg.last_owner);
            }
         }

         const updated = await runWrite(this.prisma, (tx) =>
            tx.organizationMember.update({
               where: { userId_organizationId: { userId, organizationId } },
               data: { role },
               include: { organization: true },
            }),
         );

         const dto = toOrganizationMemberDto(updated);
         if (dto.organization) {
            dto.organization = await fileUrlService.resolveOrganizationMedia(dto.organization);
         }
         emitCacheInvalidation('organization-member', 'updated', updated.id, { organizationId });
         return dto;
      } catch (error) {
         rethrowServiceError(error, { operation: 'updateMemberRole' }, msg.update_member_failed);
      }
   }

   async removeMember(organizationId: string, userId: string): Promise<void> {
      try {
         const member = await this.prisma.organizationMember.findUnique({
            where: { userId_organizationId: { userId, organizationId } },
         });
         if (!member) {
            throw DomainError.notFound(msg.member_not_found);
         }

         if (member.role === OrganizationRole.OWNER) {
            const ownerCount = await this.prisma.organizationMember.count({
               where: { organizationId, role: OrganizationRole.OWNER },
            });
            if (ownerCount <= 1) {
               throw DomainError.validation(msg.last_owner);
            }
         }

         await runWrite(this.prisma, (tx) =>
            tx.organizationMember.delete({
               where: { userId_organizationId: { userId, organizationId } },
            }),
         );
         emitCacheInvalidation('organization-member', 'deleted', member.id, { organizationId });
      } catch (error) {
         rethrowServiceError(error, { operation: 'removeMember' }, msg.remove_member_failed);
      }
   }

   async getMemberRole(organizationId: string, userId: string): Promise<OrganizationRole | null> {
      const member = await this.prisma.organizationMember.findUnique({
         where: { userId_organizationId: { userId, organizationId } },
         select: { role: true },
      });
      return member?.role ?? null;
   }

   async getMyMembership(
      organizationId: string,
      userId: string,
   ): Promise<OrganizationMemberDto | null> {
      const member = await this.prisma.organizationMember.findUnique({
         where: { userId_organizationId: { userId, organizationId } },
         include: { organization: true },
      });
      return member ? toOrganizationMemberDto(member) : null;
   }

   async hasMembers(organizationId: string): Promise<boolean> {
      const count = await this.prisma.organizationMember.count({ where: { organizationId } });
      return count > 0;
   }

   async isMember(organizationId: string, userId: string): Promise<boolean> {
      return (await this.getMemberRole(organizationId, userId)) !== null;
   }

   async isUserMemberOfOrganizationBySlug(userId: string, slug: string): Promise<boolean> {
      const org = await this.prisma.organization.findUnique({
         where: { slug },
         select: { id: true },
      });
      if (!org) {
         return false;
      }
      return this.isMember(org.id, userId);
   }

   async hasOrgStaffAccess(
      organizationId: string,
      userId: string,
      jwtRole: string | undefined,
   ): Promise<boolean> {
      const membershipRole = await this.getMemberRole(organizationId, userId);
      return hasOrgStaffAccess(jwtRole, membershipRole);
   }

   async isAuthorLinkedToOrganization(authorId: string, organizationId: string): Promise<boolean> {
      const link = await this.prisma.authorOrganization.findUnique({
         where: {
            authorId_organizationId: { authorId, organizationId },
         },
         select: { id: true },
      });
      return link !== null;
   }

   async getOrganizationIdsForUser(userId: string): Promise<string[]> {
      const memberships = await this.prisma.organizationMember.findMany({
         where: { userId },
         select: { organizationId: true },
      });
      return memberships.map((m) => m.organizationId);
   }

   private normalizePreferredGenreName(value: string | null | undefined): string | null {
      if (value === undefined || value === null) {
         return null;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
   }

   private normalizeWebsiteUrl(value: string | null | undefined): string | null {
      if (value === undefined || value === null) {
         return null;
      }

      const trimmed = value.trim();
      if (trimmed.length === 0) {
         return null;
      }

      if (trimmed.length > 500) {
         throw DomainError.validation(msg.website_url_invalid);
      }

      try {
         const parsed = new URL(trimmed);
         if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error('invalid protocol');
         }
      } catch {
         throw DomainError.validation(msg.website_url_invalid);
      }

      return trimmed;
   }

   private normalizeTeamSize(
      value: OrganizationTeamSizeType | null | undefined,
   ): OrganizationTeamSize | null {
      if (value === undefined || value === null) {
         return null;
      }

      const trimmed = String(value).trim() as OrganizationTeamSizeType;
      if (trimmed.length === 0) {
         return null;
      }

      try {
         return parseTeamSizeFromApi(trimmed);
      } catch {
         throw DomainError.validation(msg.team_size_invalid);
      }
   }
}

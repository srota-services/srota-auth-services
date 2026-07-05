import {
   AuthorOrganizationInvitationStatus,
   PrismaClient,
} from '@prisma/client';
import {
   AuthorOrganizationInvitationForAuthorDto,
   AuthorOrganizationInvitationForOrgDto,
   OrganizationAuthorMemberDto,
   invitationInclude,
   toAuthorOrganizationInvitationForAuthorDto,
   toAuthorOrganizationInvitationForOrgDto,
   toOrganizationAuthorMemberDto,
} from '../models/AuthorOrganizationInvitationDto';
import { DomainError } from '../types/domain';
import { domainMessages } from '../utils/domainMessages';
import { OrganizationService } from './OrganizationService';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { assertNoActiveAuthorOrgLinkRequest } from '../utils/assertNoActiveAuthorOrgLinkRequest';

const msg = domainMessages.error.authorInvitations;
const successMsg = domainMessages.success.authorInvitations;

const TERMINAL_STATUSES = new Set<AuthorOrganizationInvitationStatus>([
   AuthorOrganizationInvitationStatus.DECLINED,
   AuthorOrganizationInvitationStatus.ACCEPTED,
]);

export class AuthorOrganizationInvitationService {
   private readonly organizationService: OrganizationService;

   constructor(private readonly prisma: PrismaClient) {
      this.organizationService = new OrganizationService(prisma);
   }

   async createInvitation(
      organizationId: string,
      authorId: string,
      actorUserId: string,
      jwtRole: string | undefined,
   ): Promise<AuthorOrganizationInvitationForOrgDto> {
      await this.assertOrgStaff(organizationId, actorUserId, jwtRole);

      const organization = await this.prisma.organization.findUnique({
         where: { id: organizationId },
         select: { id: true },
      });
      if (!organization) {
         throw DomainError.notFound(domainMessages.error.organizations.not_found);
      }

      const author = await this.prisma.author.findUnique({
         where: { id: authorId },
         select: { id: true },
      });
      if (!author) {
         throw DomainError.notFound(domainMessages.error.authors.not_found);
      }

      const alreadyLinked = await this.organizationService.isAuthorLinkedToOrganization(
         authorId,
         organizationId,
      );
      if (alreadyLinked) {
         throw DomainError.conflict(msg.author_already_linked);
      }

      await assertNoActiveAuthorOrgLinkRequest(this.prisma, authorId, organizationId);

      const existingInvitation = await this.prisma.authorOrganizationInvitation.findUnique({
         where: {
            organizationId_authorId: { organizationId, authorId },
         },
      });
      if (existingInvitation && !TERMINAL_STATUSES.has(existingInvitation.status)) {
         throw DomainError.conflict(msg.invitation_already_pending);
      }

      const invitation = await this.prisma.authorOrganizationInvitation.upsert({
         where: {
            organizationId_authorId: { organizationId, authorId },
         },
         create: {
            organizationId,
            authorId,
            status: AuthorOrganizationInvitationStatus.PENDING_CONTACT_CONSENT,
         },
         update: {
            status: AuthorOrganizationInvitationStatus.PENDING_CONTACT_CONSENT,
            contactRevealedAt: null,
            orgContactConfirmedAt: null,
            respondedAt: null,
         },
         include: invitationInclude,
      });

      await emitCacheInvalidation('author-organization-invitation', 'created', invitation.id, {
         organizationId,
         authorId,
      });

      return toAuthorOrganizationInvitationForOrgDto(invitation);
   }

   async listForOrganization(
      organizationId: string,
      actorUserId: string,
      jwtRole: string | undefined,
   ): Promise<AuthorOrganizationInvitationForOrgDto[]> {
      await this.assertOrgStaff(organizationId, actorUserId, jwtRole);

      const invitations = await this.prisma.authorOrganizationInvitation.findMany({
         where: { organizationId },
         include: invitationInclude,
         orderBy: { createdAt: 'desc' },
      });

      return invitations.map((invitation) => toAuthorOrganizationInvitationForOrgDto(invitation));
   }

   async listLinkedAuthorsForOrganization(
      organizationId: string,
      actorUserId: string,
      jwtRole: string | undefined,
   ): Promise<OrganizationAuthorMemberDto[]> {
      await this.assertOrgStaff(organizationId, actorUserId, jwtRole);

      const links = await this.prisma.authorOrganization.findMany({
         where: { organizationId },
         include: {
            author: {
               include: {
                  user: {
                     select: {
                        email: true,
                        firstName: true,
                        lastName: true,
                        contact: true,
                     },
                  },
               },
            },
         },
         orderBy: { createdAt: 'desc' },
      });

      return links.map((link) => toOrganizationAuthorMemberDto(link.author));
   }

   async listForAuthor(userId: string): Promise<AuthorOrganizationInvitationForAuthorDto[]> {
      const author = await this.prisma.author.findUnique({
         where: { userId },
         select: { id: true },
      });
      if (!author) {
         throw DomainError.notFound(domainMessages.error.authors.not_found);
      }

      const invitations = await this.prisma.authorOrganizationInvitation.findMany({
         where: { authorId: author.id },
         include: invitationInclude,
         orderBy: { createdAt: 'desc' },
      });

      return invitations.map((invitation) => toAuthorOrganizationInvitationForAuthorDto(invitation));
   }

   async revealContact(
      invitationId: string,
      userId: string,
      reveal: boolean,
   ): Promise<AuthorOrganizationInvitationForAuthorDto> {
      const invitation = await this.getInvitationForAuthor(invitationId, userId);

      if (invitation.status !== AuthorOrganizationInvitationStatus.PENDING_CONTACT_CONSENT) {
         throw DomainError.conflict(msg.invalid_status);
      }

      const now = new Date();
      const updated = await this.prisma.authorOrganizationInvitation.update({
         where: { id: invitationId },
         data: reveal
            ? {
                 status: AuthorOrganizationInvitationStatus.AWAITING_ORG_CONTACT,
                 contactRevealedAt: now,
              }
            : {
                 status: AuthorOrganizationInvitationStatus.DECLINED,
                 respondedAt: now,
              },
         include: invitationInclude,
      });

      await emitCacheInvalidation('author-organization-invitation', 'updated', updated.id, {
         organizationId: updated.organizationId,
         authorId: updated.authorId,
      });

      return toAuthorOrganizationInvitationForAuthorDto(updated);
   }

   async confirmOrgContact(
      invitationId: string,
      userId: string,
      contacted: boolean,
   ): Promise<AuthorOrganizationInvitationForAuthorDto> {
      const invitation = await this.getInvitationForAuthor(invitationId, userId);

      if (invitation.status !== AuthorOrganizationInvitationStatus.AWAITING_ORG_CONTACT) {
         throw DomainError.conflict(msg.invalid_status);
      }

      if (!contacted) {
         return toAuthorOrganizationInvitationForAuthorDto(invitation);
      }

      const now = new Date();
      const updated = await this.prisma.authorOrganizationInvitation.update({
         where: { id: invitationId },
         data: {
            status: AuthorOrganizationInvitationStatus.AWAITING_JOIN_DECISION,
            orgContactConfirmedAt: now,
         },
         include: invitationInclude,
      });

      await emitCacheInvalidation('author-organization-invitation', 'updated', updated.id, {
         organizationId: updated.organizationId,
         authorId: updated.authorId,
      });

      return toAuthorOrganizationInvitationForAuthorDto(updated);
   }

   async decideJoin(
      invitationId: string,
      userId: string,
      accept: boolean,
   ): Promise<AuthorOrganizationInvitationForAuthorDto> {
      const invitation = await this.getInvitationForAuthor(invitationId, userId);

      if (invitation.status !== AuthorOrganizationInvitationStatus.AWAITING_JOIN_DECISION) {
         throw DomainError.conflict(msg.invalid_status);
      }

      const now = new Date();

      if (!accept) {
         const declined = await this.prisma.authorOrganizationInvitation.update({
            where: { id: invitationId },
            data: {
               status: AuthorOrganizationInvitationStatus.DECLINED,
               respondedAt: now,
            },
            include: invitationInclude,
         });

         await emitCacheInvalidation('author-organization-invitation', 'updated', declined.id, {
            organizationId: declined.organizationId,
            authorId: declined.authorId,
         });

         return toAuthorOrganizationInvitationForAuthorDto(declined);
      }

      const accepted = await this.prisma.$transaction(async (tx) => {
         const updatedInvitation = await tx.authorOrganizationInvitation.update({
            where: { id: invitationId },
            data: {
               status: AuthorOrganizationInvitationStatus.ACCEPTED,
               respondedAt: now,
            },
            include: invitationInclude,
         });

         await tx.authorOrganization.create({
            data: {
               authorId: updatedInvitation.authorId,
               organizationId: updatedInvitation.organizationId,
            },
         });

         return updatedInvitation;
      });

      await emitCacheInvalidation('author-organization-invitation', 'updated', accepted.id, {
         organizationId: accepted.organizationId,
         authorId: accepted.authorId,
      });
      await emitCacheInvalidation('author', 'updated', accepted.authorId, {
         organizationId: accepted.organizationId,
      });

      return toAuthorOrganizationInvitationForAuthorDto(accepted);
   }

   private async getInvitationForAuthor(invitationId: string, userId: string) {
      const author = await this.prisma.author.findUnique({
         where: { userId },
         select: { id: true },
      });
      if (!author) {
         throw DomainError.notFound(domainMessages.error.authors.not_found);
      }

      const invitation = await this.prisma.authorOrganizationInvitation.findUnique({
         where: { id: invitationId },
         include: invitationInclude,
      });
      if (!invitation) {
         throw DomainError.notFound(msg.not_found);
      }
      if (invitation.authorId !== author.id) {
         throw DomainError.forbidden(msg.access_denied);
      }

      return invitation;
   }

   private async assertOrgStaff(
      organizationId: string,
      userId: string,
      jwtRole: string | undefined,
   ): Promise<void> {
      const hasAccess = await this.organizationService.hasOrgStaffAccess(
         organizationId,
         userId,
         jwtRole,
      );
      if (!hasAccess) {
         throw DomainError.forbidden(domainMessages.error.organizations.admin_required);
      }
   }
}

export { successMsg as authorInvitationSuccessMessages };

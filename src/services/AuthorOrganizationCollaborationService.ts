import {
   AuthorOrganizationCollaborationStatus,
   CollaborationActor,
   CollaborationTurn,
   Prisma,
   PrismaClient,
} from '@prisma/client';
import {
   AuthorOrganizationCollaborationForAuthorDto,
   AuthorOrganizationCollaborationForOrgDto,
   collaborationInclude,
   toAuthorOrganizationCollaborationForAuthorDto,
   toAuthorOrganizationCollaborationForOrgDto,
} from '../models/AuthorOrganizationCollaborationDto';
import {
   NEGOTIATION_TIMEOUT_MS,
   REJECTION_COOLDOWN_MS,
   TERMINAL_COLLABORATION_STATUSES,
} from '../constants/collaborationConstants';
import { assertNoActiveAuthorOrgLinkRequest } from '../utils/assertNoActiveAuthorOrgLinkRequest';
import {
   parseCollaborationBudget,
   parseCollaborationCurrency,
} from '../utils/collaborationBudget';
import { domainMessages } from '../utils/domainMessages';
import { DomainError } from '../types/domain';
import { OrganizationService } from './OrganizationService';
import { persistCollaborationAttachments } from './CollaborationAttachmentService';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { runWrite } from '../utils/prismaTransaction';

const msg = domainMessages.error.authorCollaborations;
const successMsg = domainMessages.success.authorCollaborations;

type CollaborationRecord = Prisma.AuthorOrganizationCollaborationGetPayload<{
   include: typeof collaborationInclude;
}>;

export class AuthorOrganizationCollaborationService {
   private readonly organizationService: OrganizationService;

   constructor(private readonly prisma: PrismaClient) {
      this.organizationService = new OrganizationService(prisma);
   }

   async createRequest(
      userId: string,
      organizationId: string,
      description: string | undefined,
      authorBudgetInput: unknown,
      currencyInput: unknown,
      attachmentFiles: Express.Multer.File[] = [],
   ): Promise<AuthorOrganizationCollaborationForAuthorDto> {
      const author = await this.getAuthorByUserId(userId);
      const authorBudget = parseCollaborationBudget(authorBudgetInput, 'authorBudget');
      const currency = parseCollaborationCurrency(currencyInput);

      const organization = await this.prisma.organization.findUnique({
         where: { id: organizationId },
         select: { id: true, discoverable: true },
      });
      if (!organization) {
         throw DomainError.notFound(domainMessages.error.organizations.not_found);
      }
      if (!organization.discoverable) {
         throw DomainError.forbidden(msg.organization_not_discoverable);
      }

      await assertNoActiveAuthorOrgLinkRequest(this.prisma, author.id, organizationId);

      const existing = await this.prisma.authorOrganizationCollaboration.findUnique({
         where: {
            authorId_organizationId: { authorId: author.id, organizationId },
         },
      });

      if (existing) {
         if (!TERMINAL_COLLABORATION_STATUSES.has(existing.status)) {
            throw DomainError.conflict(msg.collaboration_already_pending);
         }
         if (
            existing.status === AuthorOrganizationCollaborationStatus.REJECTED &&
            existing.rejectedAt &&
            existing.rejectedAt.getTime() + REJECTION_COOLDOWN_MS > Date.now()
         ) {
            throw DomainError.conflict(msg.rejection_cooldown_active);
         }
      }

      const trimmedDescription = description?.trim() || null;

      const collaboration = await runWrite(this.prisma, async (tx) => {
         if (existing) {
            await tx.authorOrganizationCollaborationRound.deleteMany({
               where: { collaborationId: existing.id },
            });
         }

         const record = existing
            ? await tx.authorOrganizationCollaboration.update({
                 where: { id: existing.id },
                 data: {
                    description: trimmedDescription,
                    authorBudget,
                    organizationAsk: null,
                    acceptedBudget: null,
                    currency,
                    status: AuthorOrganizationCollaborationStatus.PENDING_ORG_REVIEW,
                    turn: CollaborationTurn.ORGANIZATION,
                    negotiationExpiresAt: null,
                    rejectedAt: null,
                    acceptedAt: null,
                    abortedAt: null,
                 },
                 include: collaborationInclude,
              })
            : await tx.authorOrganizationCollaboration.create({
                 data: {
                    organizationId,
                    authorId: author.id,
                    description: trimmedDescription,
                    authorBudget,
                    currency,
                    status: AuthorOrganizationCollaborationStatus.PENDING_ORG_REVIEW,
                    turn: CollaborationTurn.ORGANIZATION,
                 },
                 include: collaborationInclude,
              });

         if (attachmentFiles.length > 0) {
            const attachmentRows = await persistCollaborationAttachments(record.id, attachmentFiles);
            await tx.authorOrganizationCollaborationAttachment.createMany({
               data: attachmentRows.map((attachment) => ({
                  collaborationId: record.id,
                  ...attachment,
               })),
            });
         }

         return tx.authorOrganizationCollaboration.findUniqueOrThrow({
            where: { id: record.id },
            include: collaborationInclude,
         });
      });

      await emitCacheInvalidation('author-organization-collaboration', 'created', collaboration.id, {
         organizationId,
         authorId: author.id,
      });

      return toAuthorOrganizationCollaborationForAuthorDto(collaboration);
   }

   async listForAuthor(userId: string): Promise<AuthorOrganizationCollaborationForAuthorDto[]> {
      const author = await this.getAuthorByUserId(userId);
      const collaborations = await this.prisma.authorOrganizationCollaboration.findMany({
         where: { authorId: author.id },
         include: collaborationInclude,
         orderBy: { createdAt: 'desc' },
      });

      const resolved = await Promise.all(
         collaborations.map((collaboration) => this.resolveExpiry(collaboration)),
      );

      return resolved.map(toAuthorOrganizationCollaborationForAuthorDto);
   }

   async listForOrganization(
      organizationId: string,
      actorUserId: string,
      jwtRole: string | undefined,
   ): Promise<AuthorOrganizationCollaborationForOrgDto[]> {
      await this.assertOrgStaff(organizationId, actorUserId, jwtRole);

      const collaborations = await this.prisma.authorOrganizationCollaboration.findMany({
         where: { organizationId },
         include: collaborationInclude,
         orderBy: { createdAt: 'desc' },
      });

      const resolved = await Promise.all(
         collaborations.map((collaboration) => this.resolveExpiry(collaboration)),
      );

      return resolved.map(toAuthorOrganizationCollaborationForOrgDto);
   }

   async counterBudget(
      collaborationId: string,
      userId: string,
      authorBudgetInput: unknown,
   ): Promise<AuthorOrganizationCollaborationForAuthorDto> {
      const author = await this.getAuthorByUserId(userId);
      let collaboration = await this.getCollaborationForAuthor(collaborationId, author.id);
      collaboration = await this.resolveExpiry(collaboration);

      if (collaboration.status !== AuthorOrganizationCollaborationStatus.NEGOTIATION) {
         throw DomainError.conflict(msg.invalid_status);
      }
      if (collaboration.turn !== CollaborationTurn.AUTHOR) {
         throw DomainError.conflict(msg.not_your_turn);
      }

      const authorBudget = parseCollaborationBudget(authorBudgetInput, 'authorBudget');
      const negotiationExpiresAt = new Date(Date.now() + NEGOTIATION_TIMEOUT_MS);

      const updated = await runWrite(this.prisma, async (tx) => {
         const record = await tx.authorOrganizationCollaboration.update({
            where: { id: collaborationId },
            data: {
               authorBudget,
               turn: CollaborationTurn.ORGANIZATION,
               negotiationExpiresAt,
            },
            include: collaborationInclude,
         });

         await tx.authorOrganizationCollaborationRound.create({
            data: {
               collaborationId,
               actor: CollaborationActor.AUTHOR,
               authorBudget,
            },
         });

         return record;
      });

      await this.emitUpdated(updated);
      return toAuthorOrganizationCollaborationForAuthorDto(updated);
   }

   async abort(collaborationId: string, userId: string): Promise<AuthorOrganizationCollaborationForAuthorDto> {
      const author = await this.getAuthorByUserId(userId);
      const collaboration = await this.getCollaborationForAuthor(collaborationId, author.id);

      if (
         collaboration.status !== AuthorOrganizationCollaborationStatus.PENDING_ORG_REVIEW &&
         collaboration.status !== AuthorOrganizationCollaborationStatus.NEGOTIATION
      ) {
         throw DomainError.conflict(msg.invalid_status);
      }

      const now = new Date();
      const updated = await runWrite(this.prisma, async (tx) =>
         tx.authorOrganizationCollaboration.update({
            where: { id: collaborationId },
            data: {
               status: AuthorOrganizationCollaborationStatus.ABORTED,
               abortedAt: now,
               negotiationExpiresAt: null,
            },
            include: collaborationInclude,
         }),
      );

      await this.emitUpdated(updated);
      return toAuthorOrganizationCollaborationForAuthorDto(updated);
   }

   async accept(
      organizationId: string,
      collaborationId: string,
      actorUserId: string,
      jwtRole: string | undefined,
   ): Promise<AuthorOrganizationCollaborationForOrgDto> {
      await this.assertOrgStaff(organizationId, actorUserId, jwtRole);
      let collaboration = await this.getCollaborationForOrg(collaborationId, organizationId);
      collaboration = await this.resolveExpiry(collaboration);

      if (
         collaboration.status !== AuthorOrganizationCollaborationStatus.PENDING_ORG_REVIEW &&
         collaboration.status !== AuthorOrganizationCollaborationStatus.NEGOTIATION
      ) {
         throw DomainError.conflict(msg.invalid_status);
      }
      if (
         collaboration.status === AuthorOrganizationCollaborationStatus.NEGOTIATION &&
         collaboration.turn !== CollaborationTurn.ORGANIZATION
      ) {
         throw DomainError.conflict(msg.not_your_turn);
      }

      const now = new Date();
      const acceptedBudget = collaboration.authorBudget;

      const accepted = await this.prisma.$transaction(async (tx) => {
         const updatedCollaboration = await tx.authorOrganizationCollaboration.update({
            where: { id: collaborationId },
            data: {
               status: AuthorOrganizationCollaborationStatus.ACCEPTED,
               acceptedBudget,
               acceptedAt: now,
               negotiationExpiresAt: null,
            },
            include: collaborationInclude,
         });

         await tx.authorOrganization.create({
            data: {
               authorId: updatedCollaboration.authorId,
               organizationId: updatedCollaboration.organizationId,
            },
         });

         return updatedCollaboration;
      });

      await this.emitUpdated(accepted);
      await emitCacheInvalidation('author', 'updated', accepted.authorId, {
         organizationId: accepted.organizationId,
      });

      return toAuthorOrganizationCollaborationForOrgDto(accepted);
   }

   async reject(
      organizationId: string,
      collaborationId: string,
      actorUserId: string,
      jwtRole: string | undefined,
   ): Promise<AuthorOrganizationCollaborationForOrgDto> {
      await this.assertOrgStaff(organizationId, actorUserId, jwtRole);
      let collaboration = await this.getCollaborationForOrg(collaborationId, organizationId);
      collaboration = await this.resolveExpiry(collaboration);

      if (
         collaboration.status !== AuthorOrganizationCollaborationStatus.PENDING_ORG_REVIEW &&
         collaboration.status !== AuthorOrganizationCollaborationStatus.NEGOTIATION
      ) {
         throw DomainError.conflict(msg.invalid_status);
      }
      if (
         collaboration.status === AuthorOrganizationCollaborationStatus.NEGOTIATION &&
         collaboration.turn !== CollaborationTurn.ORGANIZATION
      ) {
         throw DomainError.conflict(msg.not_your_turn);
      }

      const now = new Date();
      const updated = await runWrite(this.prisma, async (tx) =>
         tx.authorOrganizationCollaboration.update({
            where: { id: collaborationId },
            data: {
               status: AuthorOrganizationCollaborationStatus.REJECTED,
               rejectedAt: now,
               negotiationExpiresAt: null,
            },
            include: collaborationInclude,
         }),
      );

      await this.emitUpdated(updated);
      return toAuthorOrganizationCollaborationForOrgDto(updated);
   }

   async negotiate(
      organizationId: string,
      collaborationId: string,
      actorUserId: string,
      jwtRole: string | undefined,
      organizationAskInput: unknown,
   ): Promise<AuthorOrganizationCollaborationForOrgDto> {
      await this.assertOrgStaff(organizationId, actorUserId, jwtRole);
      let collaboration = await this.getCollaborationForOrg(collaborationId, organizationId);
      collaboration = await this.resolveExpiry(collaboration);

      if (
         collaboration.status !== AuthorOrganizationCollaborationStatus.PENDING_ORG_REVIEW &&
         collaboration.status !== AuthorOrganizationCollaborationStatus.NEGOTIATION
      ) {
         throw DomainError.conflict(msg.invalid_status);
      }
      if (
         collaboration.status === AuthorOrganizationCollaborationStatus.NEGOTIATION &&
         collaboration.turn !== CollaborationTurn.ORGANIZATION
      ) {
         throw DomainError.conflict(msg.not_your_turn);
      }

      const organizationAsk = parseCollaborationBudget(organizationAskInput, 'organizationAsk');
      const negotiationExpiresAt = new Date(Date.now() + NEGOTIATION_TIMEOUT_MS);

      const updated = await runWrite(this.prisma, async (tx) => {
         const record = await tx.authorOrganizationCollaboration.update({
            where: { id: collaborationId },
            data: {
               status: AuthorOrganizationCollaborationStatus.NEGOTIATION,
               organizationAsk,
               turn: CollaborationTurn.AUTHOR,
               negotiationExpiresAt,
            },
            include: collaborationInclude,
         });

         await tx.authorOrganizationCollaborationRound.create({
            data: {
               collaborationId,
               actor: CollaborationActor.ORGANIZATION,
               organizationAsk,
            },
         });

         return record;
      });

      await this.emitUpdated(updated);
      return toAuthorOrganizationCollaborationForOrgDto(updated);
   }

   private async resolveExpiry(collaboration: CollaborationRecord): Promise<CollaborationRecord> {
      if (
         collaboration.status !== AuthorOrganizationCollaborationStatus.NEGOTIATION ||
         !collaboration.negotiationExpiresAt ||
         collaboration.negotiationExpiresAt.getTime() > Date.now()
      ) {
         return collaboration;
      }

      const now = new Date();
      const updated = await runWrite(this.prisma, async (tx) =>
         tx.authorOrganizationCollaboration.update({
            where: { id: collaboration.id },
            data: {
               status: AuthorOrganizationCollaborationStatus.ABORTED,
               abortedAt: now,
               negotiationExpiresAt: null,
            },
            include: collaborationInclude,
         }),
      );

      await this.emitUpdated(updated);
      return updated;
   }

   private async getAuthorByUserId(userId: string) {
      const author = await this.prisma.author.findUnique({
         where: { userId },
         select: { id: true },
      });
      if (!author) {
         throw DomainError.notFound(domainMessages.error.authors.not_found);
      }
      return author;
   }

   private async getCollaborationForAuthor(collaborationId: string, authorId: string) {
      const collaboration = await this.prisma.authorOrganizationCollaboration.findUnique({
         where: { id: collaborationId },
         include: collaborationInclude,
      });
      if (!collaboration) {
         throw DomainError.notFound(msg.not_found);
      }
      if (collaboration.authorId !== authorId) {
         throw DomainError.forbidden(msg.access_denied);
      }
      return collaboration;
   }

   private async getCollaborationForOrg(collaborationId: string, organizationId: string) {
      const collaboration = await this.prisma.authorOrganizationCollaboration.findUnique({
         where: { id: collaborationId },
         include: collaborationInclude,
      });
      if (!collaboration) {
         throw DomainError.notFound(msg.not_found);
      }
      if (collaboration.organizationId !== organizationId) {
         throw DomainError.notFound(msg.not_found);
      }
      return collaboration;
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

   private async emitUpdated(collaboration: CollaborationRecord): Promise<void> {
      await emitCacheInvalidation('author-organization-collaboration', 'updated', collaboration.id, {
         organizationId: collaboration.organizationId,
         authorId: collaboration.authorId,
      });
   }
}

export { successMsg as authorCollaborationSuccessMessages };

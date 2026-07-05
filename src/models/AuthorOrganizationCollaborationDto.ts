import {
   AuthorOrganizationCollaborationStatus,
   CollaborationActor,
   CollaborationTurn,
   Prisma,
} from '@prisma/client';
import { decimalToNumber } from '../utils/collaborationBudget';

export interface CollaborationOrganizationSummary {
   id: string;
   name: string;
}

export interface CollaborationAuthorSummary {
   id: string;
   firstName?: string | null;
   lastName?: string | null;
}

export interface AuthorOrganizationCollaborationAttachmentDto {
   id: string;
   originalName: string;
   mimeType: string;
   sizeBytes: number;
   uploadedBy: CollaborationActor;
   createdAt: Date;
}

export interface AuthorOrganizationCollaborationRoundDto {
   id: string;
   actor: CollaborationActor;
   authorBudget?: number | null;
   organizationAsk?: number | null;
   createdAt: Date;
}

export interface AuthorOrganizationCollaborationForAuthorDto {
   id: string;
   status: AuthorOrganizationCollaborationStatus;
   organization: CollaborationOrganizationSummary;
   description?: string | null;
   authorBudget: number;
   organizationAsk?: number | null;
   acceptedBudget?: number | null;
   currency: string;
   turn: CollaborationTurn;
   negotiationExpiresAt?: Date | null;
   rejectedAt?: Date | null;
   acceptedAt?: Date | null;
   abortedAt?: Date | null;
   attachments: AuthorOrganizationCollaborationAttachmentDto[];
   rounds: AuthorOrganizationCollaborationRoundDto[];
   createdAt: Date;
   updatedAt: Date;
}

export interface AuthorOrganizationCollaborationForOrgDto {
   id: string;
   status: AuthorOrganizationCollaborationStatus;
   author: CollaborationAuthorSummary;
   description?: string | null;
   authorBudget: number;
   organizationAsk?: number | null;
   acceptedBudget?: number | null;
   currency: string;
   turn: CollaborationTurn;
   negotiationExpiresAt?: Date | null;
   rejectedAt?: Date | null;
   acceptedAt?: Date | null;
   abortedAt?: Date | null;
   attachments: AuthorOrganizationCollaborationAttachmentDto[];
   rounds: AuthorOrganizationCollaborationRoundDto[];
   createdAt: Date;
   updatedAt: Date;
}

export interface CreateAuthorOrganizationCollaborationDto {
   organizationId: string;
   description?: string;
   authorBudget: number;
   currency: string;
}

export interface CounterCollaborationBudgetDto {
   authorBudget: number;
}

export interface NegotiateCollaborationDto {
   organizationAsk: number;
}

export const collaborationInclude = {
   organization: {
      select: {
         id: true,
         name: true,
      },
   },
   author: {
      include: {
         user: {
            select: {
               firstName: true,
               lastName: true,
            },
         },
      },
   },
   attachments: {
      orderBy: { createdAt: 'asc' as const },
   },
   rounds: {
      orderBy: { createdAt: 'asc' as const },
   },
} satisfies Prisma.AuthorOrganizationCollaborationInclude;

type CollaborationWithRelations = Prisma.AuthorOrganizationCollaborationGetPayload<{
   include: typeof collaborationInclude;
}>;

function toAttachmentDto(
   attachment: CollaborationWithRelations['attachments'][number],
): AuthorOrganizationCollaborationAttachmentDto {
   return {
      id: attachment.id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      uploadedBy: attachment.uploadedBy,
      createdAt: attachment.createdAt,
   };
}

function toRoundDto(
   round: CollaborationWithRelations['rounds'][number],
): AuthorOrganizationCollaborationRoundDto {
   return {
      id: round.id,
      actor: round.actor,
      authorBudget: decimalToNumber(round.authorBudget),
      organizationAsk: decimalToNumber(round.organizationAsk),
      createdAt: round.createdAt,
   };
}

function toCollaborationBaseFields(collaboration: CollaborationWithRelations) {
   return {
      id: collaboration.id,
      status: collaboration.status,
      description: collaboration.description,
      authorBudget: decimalToNumber(collaboration.authorBudget) ?? 0,
      organizationAsk: decimalToNumber(collaboration.organizationAsk),
      acceptedBudget: decimalToNumber(collaboration.acceptedBudget),
      currency: collaboration.currency,
      turn: collaboration.turn,
      negotiationExpiresAt: collaboration.negotiationExpiresAt,
      rejectedAt: collaboration.rejectedAt,
      acceptedAt: collaboration.acceptedAt,
      abortedAt: collaboration.abortedAt,
      attachments: collaboration.attachments.map(toAttachmentDto),
      rounds: collaboration.rounds.map(toRoundDto),
      createdAt: collaboration.createdAt,
      updatedAt: collaboration.updatedAt,
   };
}

export function toAuthorOrganizationCollaborationForAuthorDto(
   collaboration: CollaborationWithRelations,
): AuthorOrganizationCollaborationForAuthorDto {
   return {
      ...toCollaborationBaseFields(collaboration),
      organization: {
         id: collaboration.organization.id,
         name: collaboration.organization.name,
      },
   };
}

export function toAuthorOrganizationCollaborationForOrgDto(
   collaboration: CollaborationWithRelations,
): AuthorOrganizationCollaborationForOrgDto {
   return {
      ...toCollaborationBaseFields(collaboration),
      author: {
         id: collaboration.author.id,
         firstName: collaboration.author.user.firstName,
         lastName: collaboration.author.user.lastName,
      },
   };
}

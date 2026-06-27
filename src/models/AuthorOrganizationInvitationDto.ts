import {
   AuthorOrganizationInvitationStatus,
   Prisma,
} from '@prisma/client';

export interface InvitationOrganizationSummary {
   id: string;
   name: string;
}

export interface InvitationAuthorSummary {
   id: string;
   firstName?: string | null;
   lastName?: string | null;
   email?: string;
   contact?: string | null;
}

export interface AuthorOrganizationInvitationForAuthorDto {
   id: string;
   status: AuthorOrganizationInvitationStatus;
   organization: InvitationOrganizationSummary;
   contactRevealedAt?: Date | null;
   orgContactConfirmedAt?: Date | null;
   respondedAt?: Date | null;
   createdAt: Date;
   updatedAt: Date;
}

export interface AuthorOrganizationInvitationForOrgDto {
   id: string;
   status: AuthorOrganizationInvitationStatus;
   author: InvitationAuthorSummary;
   contactRevealedAt?: Date | null;
   orgContactConfirmedAt?: Date | null;
   respondedAt?: Date | null;
   createdAt: Date;
   updatedAt: Date;
}

export interface OrganizationAuthorMemberDto {
   id: string;
   firstName?: string | null;
   lastName?: string | null;
   email: string;
   contact?: string | null;
}

export interface CreateAuthorOrganizationInvitationDto {
   authorId: string;
}

export interface RevealContactDto {
   reveal: boolean;
}

export interface ConfirmOrgContactDto {
   contacted: boolean;
}

export interface JoinOrganizationInvitationDto {
   accept: boolean;
}

export const invitationInclude = {
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
               email: true,
               firstName: true,
               lastName: true,
               contact: true,
            },
         },
      },
   },
} as const;

type InvitationWithRelations = Prisma.AuthorOrganizationInvitationGetPayload<{
   include: typeof invitationInclude;
}>;

function contactIsVisible(status: AuthorOrganizationInvitationStatus, contactRevealedAt: Date | null): boolean {
   if (!contactRevealedAt) {
      return false;
   }
   return (
      status === AuthorOrganizationInvitationStatus.AWAITING_ORG_CONTACT ||
      status === AuthorOrganizationInvitationStatus.AWAITING_JOIN_DECISION ||
      status === AuthorOrganizationInvitationStatus.ACCEPTED
   );
}

export function toAuthorOrganizationInvitationForAuthorDto(
   invitation: InvitationWithRelations,
): AuthorOrganizationInvitationForAuthorDto {
   return {
      id: invitation.id,
      status: invitation.status,
      organization: {
         id: invitation.organization.id,
         name: invitation.organization.name,
      },
      contactRevealedAt: invitation.contactRevealedAt,
      orgContactConfirmedAt: invitation.orgContactConfirmedAt,
      respondedAt: invitation.respondedAt,
      createdAt: invitation.createdAt,
      updatedAt: invitation.updatedAt,
   };
}

export function toAuthorOrganizationInvitationForOrgDto(
   invitation: InvitationWithRelations,
): AuthorOrganizationInvitationForOrgDto {
   const showContact = contactIsVisible(invitation.status, invitation.contactRevealedAt);
   const author: InvitationAuthorSummary = {
      id: invitation.author.id,
      firstName: invitation.author.user.firstName,
      lastName: invitation.author.user.lastName,
   };

   if (showContact) {
      author.email = invitation.author.user.email;
      author.contact = invitation.author.user.contact;
   }

   return {
      id: invitation.id,
      status: invitation.status,
      author,
      contactRevealedAt: invitation.contactRevealedAt,
      orgContactConfirmedAt: invitation.orgContactConfirmedAt,
      respondedAt: invitation.respondedAt,
      createdAt: invitation.createdAt,
      updatedAt: invitation.updatedAt,
   };
}

export function toOrganizationAuthorMemberDto(
   author: {
      id: string;
      user: {
         email: string;
         firstName: string | null;
         lastName: string | null;
         contact: string | null;
      };
   },
): OrganizationAuthorMemberDto {
   return {
      id: author.id,
      firstName: author.user.firstName,
      lastName: author.user.lastName,
      email: author.user.email,
      contact: author.user.contact,
   };
}

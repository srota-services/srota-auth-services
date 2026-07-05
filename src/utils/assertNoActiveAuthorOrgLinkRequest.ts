import { PrismaClient } from '@prisma/client';
import { TERMINAL_COLLABORATION_STATUSES, TERMINAL_INVITATION_STATUSES } from '../constants/collaborationConstants';
import { domainMessages } from './domainMessages';
import { DomainError } from '../types/domain';

const msg = domainMessages.error.authorCollaborations;
const invitationMsg = domainMessages.error.authorInvitations;

export async function assertNoActiveAuthorOrgLinkRequest(
   prisma: PrismaClient,
   authorId: string,
   organizationId: string,
): Promise<void> {
   const link = await prisma.authorOrganization.findUnique({
      where: {
         authorId_organizationId: { authorId, organizationId },
      },
      select: { id: true },
   });
   if (link) {
      throw DomainError.conflict(invitationMsg.author_already_linked);
   }

   const invitation = await prisma.authorOrganizationInvitation.findUnique({
      where: {
         organizationId_authorId: { organizationId, authorId },
      },
      select: { status: true },
   });
   if (invitation && !TERMINAL_INVITATION_STATUSES.has(invitation.status)) {
      throw DomainError.conflict(invitationMsg.invitation_already_pending);
   }

   const collaboration = await prisma.authorOrganizationCollaboration.findUnique({
      where: {
         authorId_organizationId: { authorId, organizationId },
      },
      select: { status: true },
   });
   if (collaboration && !TERMINAL_COLLABORATION_STATUSES.has(collaboration.status)) {
      throw DomainError.conflict(msg.collaboration_already_pending);
   }
}

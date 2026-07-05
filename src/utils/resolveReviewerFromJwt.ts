import { Request } from 'express';
import { OrganizationRole, PrismaClient, ReviewerType } from '@prisma/client';
import {
   AuthRole,
   isGuestRole,
   isOrgAdminRole,
   isOrgCoordinatorRole,
   normalizeAuthRole,
} from '../constants/authRoles';
import { DomainError, AuthenticatedRequest } from '../types/domain';
import { ResolvedReviewer } from '../types/reviewer';
import { domainMessages } from './domainMessages';

const reviewMsg = domainMessages.error.reviews;

export async function resolveReviewerFromJwt(req: Request, prisma: PrismaClient): Promise<ResolvedReviewer> {
   const authReq = req as AuthenticatedRequest;
   const role = authReq.user?.role;
   const userId = authReq.user?.id;

   if (isGuestRole(role)) {
      throw DomainError.forbidden(reviewMsg.guest_forbidden);
   }

   if (!userId) {
      throw DomainError.forbidden('Authentication required');
   }

   const normalizedRole = normalizeAuthRole(role);

   if (
      normalizedRole === normalizeAuthRole(AuthRole.LISTENER) ||
      normalizedRole === normalizeAuthRole(AuthRole.GLOBAL_ADMIN)
   ) {
      return { type: ReviewerType.USER, id: userId };
   }

   if (normalizedRole === normalizeAuthRole(AuthRole.AUTHOR)) {
      const author = await prisma.author.findUnique({
         where: { userId },
         select: { id: true },
      });
      if (!author?.id) {
         throw DomainError.forbidden(reviewMsg.reviewer_author_required);
      }
      return { type: ReviewerType.AUTHOR, id: author.id };
   }

   if (isOrgAdminRole(role) || isOrgCoordinatorRole(role)) {
      const staffMembership = await prisma.organizationMember.findFirst({
         where: {
            userId,
            role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN] },
         },
         orderBy: { createdAt: 'asc' },
      });

      if (!staffMembership) {
         throw DomainError.forbidden(reviewMsg.reviewer_organization_required);
      }

      return { type: ReviewerType.ORGANIZATION, id: staffMembership.organizationId };
   }

   throw DomainError.forbidden(reviewMsg.reviewer_not_allowed);
}

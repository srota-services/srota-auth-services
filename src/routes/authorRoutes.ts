import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthorController } from '../controllers/AuthorController';
import { OrganizationController } from '../controllers/OrganizationController';
import { AuthorOrganizationInvitationController } from '../controllers/AuthorOrganizationInvitationController';
import { requireRole } from '../middleware';
import { AuthRoleGroups } from '../constants/authRoles';

export function createAuthorRoutes(prisma: PrismaClient): Router {
   const router = Router();
   const authorController = new AuthorController(prisma);
   const organizationController = new OrganizationController(prisma);
   const invitationController = new AuthorOrganizationInvitationController(prisma);

   router.get('/me', authorController.getMyAuthor);
   router.get('/me/organization-invitations', invitationController.listMyInvitations);
   router.patch(
      '/me/organization-invitations/:invitationId/reveal-contact',
      requireRole([...AuthRoleGroups.GLOBAL_ADMIN_OR_AUTHOR]),
      invitationController.revealContact,
   );
   router.patch(
      '/me/organization-invitations/:invitationId/confirm-contact',
      requireRole([...AuthRoleGroups.GLOBAL_ADMIN_OR_AUTHOR]),
      invitationController.confirmOrgContact,
   );
   router.patch(
      '/me/organization-invitations/:invitationId/join',
      requireRole([...AuthRoleGroups.GLOBAL_ADMIN_OR_AUTHOR]),
      invitationController.decideJoin,
   );
   router.get(
      '/:authorId/organizations/:organizationId/link',
      organizationController.checkAuthorOrganizationLink,
   );
   router.get('/', authorController.getAllAuthors);
   router.get('/:id', authorController.getAuthorById);
   router.post('/', requireRole([...AuthRoleGroups.GLOBAL_ADMIN_OR_AUTHOR]), authorController.createAuthor);
   router.put('/:id', requireRole([...AuthRoleGroups.GLOBAL_ADMIN_OR_AUTHOR]), authorController.updateAuthor);
   router.delete('/:id', requireRole([...AuthRoleGroups.GLOBAL_ADMIN_OR_AUTHOR]), authorController.deleteAuthor);

   return router;
}

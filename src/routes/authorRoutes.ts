import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthorController } from '../controllers/AuthorController';
import { OrganizationController } from '../controllers/OrganizationController';
import { AuthorOrganizationInvitationController } from '../controllers/AuthorOrganizationInvitationController';
import { AuthorOrganizationCollaborationController } from '../controllers/AuthorOrganizationCollaborationController';
import { handleOptionalCollaborationAttachmentsUpload } from '../middleware/CollaborationUploadMiddleware';
import { requireRole } from '../middleware';
import { AuthRoleGroups } from '../constants/authRoles';

export function createAuthorRoutes(prisma: PrismaClient): Router {
   const router = Router();
   const authorController = new AuthorController(prisma);
   const organizationController = new OrganizationController(prisma);
   const invitationController = new AuthorOrganizationInvitationController(prisma);
   const collaborationController = new AuthorOrganizationCollaborationController(prisma);

   router.get('/me', authorController.getMyAuthor);
   router.get('/me/organization-invitations', invitationController.listMyInvitations);
   router.post(
      '/me/organization-collaborations',
      requireRole([...AuthRoleGroups.GLOBAL_ADMIN_OR_AUTHOR]),
      handleOptionalCollaborationAttachmentsUpload,
      collaborationController.createRequest,
   );
   router.get(
      '/me/organization-collaborations',
      requireRole([...AuthRoleGroups.GLOBAL_ADMIN_OR_AUTHOR]),
      collaborationController.listMyCollaborations,
   );
   router.patch(
      '/me/organization-collaborations/:collaborationId/counter',
      requireRole([...AuthRoleGroups.GLOBAL_ADMIN_OR_AUTHOR]),
      collaborationController.counterBudget,
   );
   router.patch(
      '/me/organization-collaborations/:collaborationId/abort',
      requireRole([...AuthRoleGroups.GLOBAL_ADMIN_OR_AUTHOR]),
      collaborationController.abort,
   );
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

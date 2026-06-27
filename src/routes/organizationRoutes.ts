import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { OrganizationController } from '../controllers/OrganizationController';
import { AuthorOrganizationInvitationController } from '../controllers/AuthorOrganizationInvitationController';
import { handleOptionalOrganizationImageUpload } from '../middleware/OrganizationUploadMiddleware';

export function createOrganizationRoutes(prisma: PrismaClient): Router {
   const router = Router();
   const controller = new OrganizationController(prisma);
   const invitationController = new AuthorOrganizationInvitationController(prisma);

   router.get('/', controller.listMyOrganizations);
   router.get('/all', controller.listAllOrganizations);
   router.post('/', handleOptionalOrganizationImageUpload, controller.createOrganization);

   router.get('/:id', controller.getOrganizationById);
   router.put('/:id', handleOptionalOrganizationImageUpload, controller.updateOrganization);
   router.delete('/:id', controller.deleteOrganization);

   router.get('/:organizationId/author-invitations', invitationController.listOrganizationInvitations);
   router.post('/:organizationId/author-invitations', invitationController.createInvitation);
   router.get('/:organizationId/authors', invitationController.listOrganizationAuthors);

   router.get('/:id/members', controller.listMembers);
   router.get('/:id/members/me', controller.getMyMembership);
   router.post('/:id/members', controller.addMember);
   router.put('/:id/members/:userId', controller.updateMemberRole);
   router.delete('/:id/members/:userId', controller.removeMember);

   return router;
}
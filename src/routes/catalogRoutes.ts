import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { CatalogController } from '../controllers/CatalogController';

export function createCatalogRoutes(prisma: PrismaClient): Router {
   const router = Router();
   const controller = new CatalogController(prisma);

   router.get('/organizations/discoverable', controller.listDiscoverableOrganizations);
   router.get('/organizations/:id', controller.getOrganizationCatalog);
   router.get('/authors/discoverable', controller.listDiscoverableAuthors);
   router.get('/authors/:id', controller.getAuthorCatalog);

   return router;
}

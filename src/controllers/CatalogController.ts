import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { OrganizationService } from '../services/OrganizationService';
import { AuthorService } from '../services/AuthorService';
import { calculatePagination, handleDomainError } from '../utils/domainController';
import { domainMessages } from '../utils/domainMessages';
import { DomainError } from '../types/domain';

/**
 * Public catalog reads for cross-service owner hydration (any authenticated caller).
 */
export class CatalogController {
   private organizationService: OrganizationService;
   private authorService: AuthorService;

   constructor(prisma: PrismaClient) {
      this.organizationService = new OrganizationService(prisma);
      this.authorService = new AuthorService(prisma);
   }

   listDiscoverableOrganizations = async (req: Request, res: Response): Promise<void> => {
      try {
         const page = req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1;
         const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 10;
         const result = await this.organizationService.listDiscoverableOrganizations({ page, limit });
         res.status(200).json({
            message: domainMessages.success.organizations.discoverable_retrieved,
            organizations: result.organizations,
            pagination: calculatePagination(page, limit, result.totalCount),
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   getOrganizationCatalog = async (req: Request, res: Response): Promise<void> => {
      try {
         const { id } = req.params as { id: string };
         const organization = await this.organizationService.getOrganizationById(id);
         res.status(200).json({
            message: domainMessages.success.organizations.retrieved_by_id,
            organization,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   getAuthorCatalog = async (req: Request, res: Response): Promise<void> => {
      try {
         const { id } = req.params as { id: string };
         const author = await this.authorService.getAuthorById(id);
         res.status(200).json({
            message: domainMessages.success.authors.retrieved_by_id,
            author,
         });
      } catch (error) {
         if (error instanceof DomainError && error.statusCode === 404) {
            handleDomainError(res, error);
            return;
         }
         handleDomainError(res, error);
      }
   };
}

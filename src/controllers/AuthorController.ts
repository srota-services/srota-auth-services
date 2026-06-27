import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthorService } from '../services/AuthorService';
import { handleDomainError } from '../utils/domainController';
import { domainMessages } from '../utils/domainMessages';
import { DomainError, AuthenticatedRequest } from '../types/domain';
import { CreateAuthorDto, UpdateAuthorDto } from '../models/AuthorDto';
import { isGlobalAdminRole } from '../constants/authRoles';
import { AuthRoleGroups } from '../constants/authRoles';

function getUserId(req: Request): string {
   const authReq = req as AuthenticatedRequest;
   if (!authReq.user?.id) {
      throw DomainError.forbidden('Authentication required');
   }
   return authReq.user.id;
}

function assertAuthorSelfOrAdmin(req: Request, authorUserId: string): void {
   const authReq = req as AuthenticatedRequest;
   if (isGlobalAdminRole(authReq.user?.role)) {
      return;
   }
   if (authReq.user?.id === authorUserId) {
      return;
   }
   throw DomainError.forbidden('Insufficient permissions');
}

function parseFormDataStringArray(value: unknown): string[] | undefined {
   if (value === undefined || value === null || value === '') {
      return undefined;
   }
   if (Array.isArray(value)) {
      return value as string[];
   }
   if (typeof value === 'string') {
      try {
         const parsed = JSON.parse(value);
         if (Array.isArray(parsed)) {
            return parsed;
         }
         return value.split(',').map((id) => id.trim()).filter((id) => id.length > 0);
      } catch {
         return value.split(',').map((id) => id.trim()).filter((id) => id.length > 0);
      }
   }
   return undefined;
}

export class AuthorController {
   private authorService: AuthorService;

   constructor(prisma: PrismaClient) {
      this.authorService = new AuthorService(prisma);
   }

   getAllAuthors = async (_req: Request, res: Response): Promise<void> => {
      try {
         const authors = await this.authorService.getAllAuthors();
         res.status(200).json({
            message: domainMessages.success.authors.retrieved,
            authors,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   getAuthorById = async (req: Request, res: Response): Promise<void> => {
      try {
         const { id } = req.params as { id: string };
         const author = await this.authorService.getAuthorById(id);
         assertAuthorSelfOrAdmin(req, author.userId);
         res.status(200).json({
            message: domainMessages.success.authors.retrieved_by_id,
            author,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   getMyAuthor = async (req: Request, res: Response): Promise<void> => {
      try {
         const userId = getUserId(req);
         const author = await this.authorService.getAuthorByUserId(userId);
         if (!author) {
            throw DomainError.notFound(domainMessages.error.authors.not_found);
         }
         res.status(200).json({
            message: domainMessages.success.authors.retrieved_by_id,
            author,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   createAuthor = async (req: Request, res: Response): Promise<void> => {
      try {
         const authReq = req as AuthenticatedRequest;
         const isAdmin = isGlobalAdminRole(authReq.user?.role);
         const isAuthor = authReq.user?.role && AuthRoleGroups.GLOBAL_ADMIN_OR_AUTHOR.includes(
            authReq.user.role as (typeof AuthRoleGroups.GLOBAL_ADMIN_OR_AUTHOR)[number],
         );

         if (!isAdmin && !isAuthor) {
            throw DomainError.forbidden('Insufficient permissions');
         }

         const organizationIds = parseFormDataStringArray(req.body?.organizationIds);
         const createData: CreateAuthorDto = {
            userId: req.body.userId,
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            address: req.body.address,
            contact: req.body.contact,
            ...(organizationIds !== undefined ? { organizationIds } : {}),
         };

         if (!isAdmin) {
            createData.userId = getUserId(req);
         }

         const author = await this.authorService.createAuthor(createData, isAdmin);
         res.status(201).json({
            message: domainMessages.success.authors.created,
            author,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   updateAuthor = async (req: Request, res: Response): Promise<void> => {
      try {
         const { id } = req.params as { id: string };
         const existing = await this.authorService.getAuthorById(id);
         assertAuthorSelfOrAdmin(req, existing.userId);

         const organizationIds = parseFormDataStringArray(req.body?.organizationIds);
         const updateData: UpdateAuthorDto = {
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            address: req.body.address,
            contact: req.body.contact,
            ...(organizationIds !== undefined ? { organizationIds } : {}),
         };

         const authReq = req as AuthenticatedRequest;
         const isAdmin = isGlobalAdminRole(authReq.user?.role);

         const author = await this.authorService.updateAuthor(id, updateData, isAdmin);
         res.status(200).json({
            message: domainMessages.success.authors.updated,
            author,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };

   deleteAuthor = async (req: Request, res: Response): Promise<void> => {
      try {
         const { id } = req.params as { id: string };
         const existing = await this.authorService.getAuthorById(id);
         assertAuthorSelfOrAdmin(req, existing.userId);
         await this.authorService.deleteAuthor(id);
         res.status(200).json({
            message: domainMessages.success.authors.deleted,
            deleted: true,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   };
}

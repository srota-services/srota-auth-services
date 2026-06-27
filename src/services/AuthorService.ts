import { Prisma, PrismaClient } from '@prisma/client';
import {
   AuthorDto,
   CreateAuthorDto,
   UpdateAuthorDto,
   authorInclude,
   toAuthorDto,
} from '../models/AuthorDto';
import { DomainError } from '../types/domain';
import { domainMessages } from '../utils/domainMessages';
import { generateAuthorSlug } from '../utils/slug';
import { runInTransaction, runWrite, type TransactionClient } from '../utils/prismaTransaction';
import { rethrowServiceError } from '../utils/serviceError';
import { rabbitmqService } from './rabbitmq';
import { emitCacheInvalidation } from './DomainEventPublisher';

const msg = domainMessages.error.authors;
const validationMsg = domainMessages.error.validation;

export class AuthorService {
   constructor(private prisma: PrismaClient) {}

   private async syncAuthorOrganizations(
      authorId: string,
      organizationIds?: string[],
      allowNewLinks = false,
      tx?: TransactionClient,
   ): Promise<void> {
      if (organizationIds === undefined) {
         return;
      }

      const client = tx ?? this.prisma;
      const uniqueIds = [...new Set(organizationIds.map((id) => id.trim()).filter(Boolean))];

      if (uniqueIds.length > 0) {
         const organizations = await client.organization.findMany({
            where: { id: { in: uniqueIds } },
            select: { id: true },
         });

         if (organizations.length !== uniqueIds.length) {
            throw DomainError.notFound(msg.organization_not_found);
         }
      }

      if (!allowNewLinks) {
         const currentLinks = await client.authorOrganization.findMany({
            where: { authorId },
            select: { organizationId: true },
         });
         const currentIds = new Set(currentLinks.map((link) => link.organizationId));
         const hasNewLinks = uniqueIds.some((organizationId) => !currentIds.has(organizationId));
         if (hasNewLinks) {
            throw DomainError.conflict(msg.direct_org_link_not_allowed);
         }
      }

      await client.authorOrganization.deleteMany({ where: { authorId } });

      if (uniqueIds.length > 0) {
         await client.authorOrganization.createMany({
            data: uniqueIds.map((organizationId) => ({
               authorId,
               organizationId,
            })),
         });
      }
   }

   private async getAuthorRecord(id: string) {
      const author = await this.prisma.author.findUnique({
         where: { id },
         include: authorInclude,
      });
      if (!author) {
         throw DomainError.notFound(msg.not_found);
      }
      return author;
   }

   async getAllAuthors(): Promise<AuthorDto[]> {
      try {
         const authors = await this.prisma.author.findMany({
            include: authorInclude,
            orderBy: { createdAt: 'desc' },
         });
         return authors.map((author) => toAuthorDto(author));
      } catch (error) {
         rethrowServiceError(error, { operation: 'getAllAuthors' }, msg.fetch_failed);
      }
   }

   async getAuthorById(id: string): Promise<AuthorDto> {
      try {
         const author = await this.getAuthorRecord(id);
         return toAuthorDto(author);
      } catch (error) {
         rethrowServiceError(error, { operation: 'getAuthorById' }, msg.fetch_failed);
      }
   }

   async getAuthorByUserId(userId: string): Promise<AuthorDto | null> {
      const author = await this.prisma.author.findUnique({
         where: { userId },
         include: authorInclude,
      });
      return author ? toAuthorDto(author) : null;
   }

   async getAuthorBySlug(slug: string): Promise<AuthorDto | null> {
      const author = await this.prisma.author.findUnique({
         where: { slug },
         include: authorInclude,
      });
      return author ? toAuthorDto(author) : null;
   }

   async createAuthorForUser(
      userId: string,
      firstName: string,
      lastName: string,
      tx?: TransactionClient,
   ): Promise<AuthorDto> {
      const client = tx ?? this.prisma;
      const existingAuthor = await client.author.findUnique({ where: { userId } });
      if (existingAuthor) {
         const record = await client.author.findUnique({
            where: { id: existingAuthor.id },
            include: authorInclude,
         });
         if (!record) {
            throw DomainError.notFound(msg.not_found);
         }
         return toAuthorDto(record);
      }

      const slug = await generateAuthorSlug(client as PrismaClient, firstName, lastName);
      const author = await client.author.create({
         data: { userId, slug },
         include: authorInclude,
      });
      if (!tx) {
         emitCacheInvalidation('author', 'created', author.id);
      }
      return toAuthorDto(author);
   }

   async createAuthor(createAuthorDto: CreateAuthorDto, allowDirectOrgLink = false): Promise<AuthorDto> {
      try {
         if (!createAuthorDto.userId || createAuthorDto.userId.trim().length === 0) {
            throw DomainError.validation(validationMsg.author_user_id_required);
         }

         const trimmedUserId = createAuthorDto.userId.trim();

         const existingAuthor = await this.prisma.author.findUnique({
            where: { userId: trimmedUserId },
         });
         if (existingAuthor) {
            throw DomainError.conflict(msg.user_id_exists);
         }

         const user = await this.prisma.user.findUnique({ where: { id: trimmedUserId } });
         if (!user) {
            throw DomainError.notFound(domainMessages.error.users.not_found);
         }

         const firstName = (createAuthorDto.firstName ?? user.firstName ?? '').trim();
         const lastName = (createAuthorDto.lastName ?? user.lastName ?? '').trim();
         if (!firstName) {
            throw DomainError.validation(validationMsg.author_first_name_required);
         }
         if (!lastName) {
            throw DomainError.validation(validationMsg.author_last_name_required);
         }

         const author = await runInTransaction(this.prisma, async (tx) => {
            await tx.user.update({
               where: { id: trimmedUserId },
               data: {
                  firstName,
                  lastName,
                  ...(createAuthorDto.address !== undefined
                     ? { address: createAuthorDto.address.trim() || null }
                     : {}),
                  ...(createAuthorDto.contact !== undefined
                     ? { contact: createAuthorDto.contact.trim() || null }
                     : {}),
               },
            });

            const slug = await generateAuthorSlug(tx as PrismaClient, firstName, lastName);
            const created = await tx.author.create({
               data: { userId: trimmedUserId, slug },
               include: authorInclude,
            });

            await this.syncAuthorOrganizations(
               created.id,
               createAuthorDto.organizationIds,
               allowDirectOrgLink,
               tx,
            );

            return created;
         });

         const created = await this.getAuthorRecord(author.id);
         emitCacheInvalidation('author', 'created', author.id);
         return toAuthorDto(created);
      } catch (error) {
         rethrowServiceError(error, { operation: 'createAuthor' }, msg.create_failed);
      }
   }

   async updateAuthor(
      id: string,
      updateAuthorDto: UpdateAuthorDto,
      allowDirectOrgLink = false,
   ): Promise<AuthorDto> {
      try {
         const existingAuthor = await this.prisma.author.findUnique({
            where: { id },
            include: { user: true },
         });

         if (!existingAuthor) {
            throw DomainError.notFound(msg.not_found);
         }

         const userUpdates: Prisma.UserUpdateInput = {};

         if (updateAuthorDto.firstName !== undefined) {
            const trimmed = updateAuthorDto.firstName.trim();
            if (trimmed.length === 0) {
               throw DomainError.validation(validationMsg.author_first_name_required);
            }
            userUpdates.firstName = trimmed;
         }

         if (updateAuthorDto.lastName !== undefined) {
            const trimmed = updateAuthorDto.lastName.trim();
            if (trimmed.length === 0) {
               throw DomainError.validation(validationMsg.author_last_name_required);
            }
            userUpdates.lastName = trimmed;
         }

         if (updateAuthorDto.address !== undefined) {
            const trimmed = updateAuthorDto.address.trim();
            userUpdates.address = trimmed.length > 0 ? trimmed : null;
         }

         if (updateAuthorDto.contact !== undefined) {
            const trimmed = updateAuthorDto.contact.trim();
            userUpdates.contact = trimmed.length > 0 ? trimmed : null;
         }

         const hasUserUpdates = Object.keys(userUpdates).length > 0;
         const hasOrgUpdates = updateAuthorDto.organizationIds !== undefined;

         if (!hasUserUpdates && !hasOrgUpdates) {
            throw DomainError.validation(validationMsg.no_update_fields);
         }

         await runInTransaction(this.prisma, async (tx) => {
            if (hasUserUpdates) {
               await tx.user.update({
                  where: { id: existingAuthor.userId },
                  data: userUpdates,
               });
            }

            if (hasOrgUpdates) {
               await this.syncAuthorOrganizations(
                  id,
                  updateAuthorDto.organizationIds,
                  allowDirectOrgLink,
                  tx,
               );
            }
         });

         const updated = await this.getAuthorRecord(id);
         emitCacheInvalidation('author', 'updated', id);
         return toAuthorDto(updated);
      } catch (error) {
         rethrowServiceError(error, { operation: 'updateAuthor' }, msg.update_failed);
      }
   }

   async deleteAuthor(id: string): Promise<void> {
      try {
         const existingAuthor = await this.prisma.author.findUnique({ where: { id } });
         if (!existingAuthor) {
            throw DomainError.notFound(msg.not_found);
         }

         const { userId } = existingAuthor;
         await runWrite(this.prisma, (tx) => tx.author.delete({ where: { id } }));

         try {
            await rabbitmqService.publishAuthorDeleted({ authorId: id, userId });
         } catch (error) {
            console.error(`Failed to publish author.deleted for author ${id}:`, error);
         }
         emitCacheInvalidation('author', 'deleted', id, { userId });
      } catch (error) {
         rethrowServiceError(error, { operation: 'deleteAuthor' }, msg.delete_failed);
      }
   }
}

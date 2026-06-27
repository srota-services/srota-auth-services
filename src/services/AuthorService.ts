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
   ): Promise<void> {
      if (organizationIds === undefined) {
         return;
      }

      const uniqueIds = [...new Set(organizationIds.map((id) => id.trim()).filter(Boolean))];

      if (uniqueIds.length > 0) {
         const organizations = await this.prisma.organization.findMany({
            where: { id: { in: uniqueIds } },
            select: { id: true },
         });

         if (organizations.length !== uniqueIds.length) {
            throw DomainError.notFound(msg.organization_not_found);
         }
      }

      if (!allowNewLinks) {
         const currentLinks = await this.prisma.authorOrganization.findMany({
            where: { authorId },
            select: { organizationId: true },
         });
         const currentIds = new Set(currentLinks.map((link) => link.organizationId));
         const hasNewLinks = uniqueIds.some((organizationId) => !currentIds.has(organizationId));
         if (hasNewLinks) {
            throw DomainError.conflict(msg.direct_org_link_not_allowed);
         }
      }

      await this.prisma.authorOrganization.deleteMany({ where: { authorId } });

      if (uniqueIds.length > 0) {
         await this.prisma.authorOrganization.createMany({
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
      } catch {
         throw DomainError.internal(msg.fetch_failed);
      }
   }

   async getAuthorById(id: string): Promise<AuthorDto> {
      try {
         const author = await this.getAuthorRecord(id);
         return toAuthorDto(author);
      } catch (error) {
         if (error instanceof DomainError) {
            throw error;
         }
         throw DomainError.internal(msg.fetch_failed);
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
   ): Promise<AuthorDto> {
      const existingAuthor = await this.prisma.author.findUnique({ where: { userId } });
      if (existingAuthor) {
         return toAuthorDto(await this.getAuthorRecord(existingAuthor.id));
      }

      const slug = await generateAuthorSlug(this.prisma, firstName, lastName);
      const author = await this.prisma.author.create({
         data: { userId, slug },
         include: authorInclude,
      });
      emitCacheInvalidation('author', 'created', author.id);
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

         const author = await this.prisma.$transaction(async (tx) => {
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
            return tx.author.create({
               data: { userId: trimmedUserId, slug },
               include: authorInclude,
            });
         });

         await this.syncAuthorOrganizations(author.id, createAuthorDto.organizationIds, allowDirectOrgLink);

         const created = await this.getAuthorRecord(author.id);
         emitCacheInvalidation('author', 'created', author.id);
         return toAuthorDto(created);
      } catch (error) {
         if (error instanceof DomainError) {
            throw error;
         }
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw DomainError.conflict(msg.user_id_exists);
         }
         throw DomainError.internal(msg.create_failed);
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

         if (hasUserUpdates) {
            await this.prisma.user.update({
               where: { id: existingAuthor.userId },
               data: userUpdates,
            });
         }

         await this.syncAuthorOrganizations(id, updateAuthorDto.organizationIds, allowDirectOrgLink);

         const updated = await this.getAuthorRecord(id);
         emitCacheInvalidation('author', 'updated', id);
         return toAuthorDto(updated);
      } catch (error) {
         if (error instanceof DomainError) {
            throw error;
         }
         throw DomainError.internal(msg.update_failed);
      }
   }

   async deleteAuthor(id: string): Promise<void> {
      try {
         const existingAuthor = await this.prisma.author.findUnique({ where: { id } });
         if (!existingAuthor) {
            throw DomainError.notFound(msg.not_found);
         }

         const { userId } = existingAuthor;
         await this.prisma.author.delete({ where: { id } });

         try {
            await rabbitmqService.publishAuthorDeleted({ authorId: id, userId });
         } catch (error) {
            console.error(`Failed to publish author.deleted for author ${id}:`, error);
         }
         emitCacheInvalidation('author', 'deleted', id, { userId });
      } catch (error) {
         if (error instanceof DomainError) {
            throw error;
         }
         throw DomainError.internal(msg.delete_failed);
      }
   }
}

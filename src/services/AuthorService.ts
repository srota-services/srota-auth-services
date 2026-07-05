import { Prisma, PrismaClient } from '@prisma/client';
import {
   AuthorDto,
   CreateAuthorDto,
   DiscoverableAuthorDto,
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
import { fileUrlService } from './FileUrlService';
import { ImageAssetService } from './ImageAssetService';
import { mediaCleanupService } from './MediaCleanupService';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env';

const msg = domainMessages.error.authors;
const validationMsg = domainMessages.error.validation;

export class AuthorService {
   private imageAssetService: ImageAssetService;

   constructor(private prisma: PrismaClient) {
      this.imageAssetService = new ImageAssetService(prisma);
   }

   private async resolveAuthorDto(author: AuthorDto): Promise<AuthorDto> {
      const resolved = await fileUrlService.resolveAuthorMedia(author);
      return {
         ...resolved,
         imageAssets: resolved.imageAssets,
      };
   }

   private async resolveAuthorDtoList(authors: AuthorDto[]): Promise<AuthorDto[]> {
      const resolved = await fileUrlService.resolveAuthorMediaList(authors);
      return resolved.map((author) => ({
         ...author,
         imageAssets: author.imageAssets,
      }));
   }

   private resolveRegistrationImagePath(stored: string): string {
      const trimmed = stored.trim();
      if (path.isAbsolute(trimmed) && fs.existsSync(trimmed)) {
         return trimmed;
      }

      if (trimmed.startsWith('/uploads/')) {
         const localPath = path.join(config.DEV_UPLOAD_DIR, trimmed.replace('/uploads/', ''));
         if (fs.existsSync(localPath)) {
            return localPath;
         }
      }

      const key = fileUrlService.normalizeToS3Key(trimmed);
      if (key && config.NODE_ENV === 'development') {
         const localPath = path.join(
            config.DEV_UPLOAD_DIR,
            key.startsWith('uploads/') ? key.slice('uploads/'.length) : key,
         );
         if (fs.existsSync(localPath)) {
            return localPath;
         }
      }

      throw DomainError.validation('Invalid author profile image source');
   }

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
         return this.resolveAuthorDtoList(authors.map((author) => toAuthorDto(author)));
      } catch (error) {
         rethrowServiceError(error, { operation: 'getAllAuthors' }, msg.fetch_failed);
      }
   }

   async getAuthorById(id: string): Promise<AuthorDto> {
      try {
         const author = await this.getAuthorRecord(id);
         return this.resolveAuthorDto(toAuthorDto(author));
      } catch (error) {
         rethrowServiceError(error, { operation: 'getAuthorById' }, msg.fetch_failed);
      }
   }

   async getAuthorByUserId(userId: string): Promise<AuthorDto | null> {
      const author = await this.prisma.author.findUnique({
         where: { userId },
         include: authorInclude,
      });
      if (!author) {
         return null;
      }
      return this.resolveAuthorDto(toAuthorDto(author));
   }

   async getAuthorBySlug(slug: string): Promise<AuthorDto | null> {
      const author = await this.prisma.author.findUnique({
         where: { slug },
         include: authorInclude,
      });
      if (!author) {
         return null;
      }
      return this.resolveAuthorDto(toAuthorDto(author));
   }

   async listDiscoverableAuthors(params: { page?: number; limit?: number } = {}): Promise<{
      authors: DiscoverableAuthorDto[];
      totalCount: number;
   }> {
      const page = Math.max(1, params.page ?? 1);
      const limit = Math.min(100, Math.max(1, params.limit ?? 10));
      const skip = (page - 1) * limit;

      try {
         const where = { discoverable: true };
         const [authors, totalCount] = await Promise.all([
            this.prisma.author.findMany({
               where,
               skip,
               take: limit,
               orderBy: { updatedAt: 'desc' },
               include: authorInclude,
            }),
            this.prisma.author.count({ where }),
         ]);

         const dtos = await this.resolveAuthorDtoList(authors.map((author) => toAuthorDto(author)));
         return {
            authors: dtos.map((author) => ({
               authorId: author.id,
               slug: author.slug,
               firstName: author.firstName ?? null,
               lastName: author.lastName ?? null,
               avatar: author.avatar ?? null,
               discoverable: author.discoverable ?? true,
               ...(author.imageAssets ? { imageAssets: author.imageAssets } : {}),
            })),
            totalCount,
         };
      } catch (error) {
         rethrowServiceError(error, { operation: 'listDiscoverableAuthors' }, msg.fetch_failed);
      }
   }

   async applyAuthorAvatarFromSource(authorId: string, source: string): Promise<void> {
      const localPath = this.resolveRegistrationImagePath(source);
      try {
         const { primaryStorageKey } = await this.imageAssetService.generateAndStoreVariants(
            'author',
            authorId,
            localPath,
         );
         await runWrite(this.prisma, (tx) =>
            tx.author.update({
               where: { id: authorId },
               data: { avatar: primaryStorageKey },
            }),
         );
         emitCacheInvalidation('author', 'updated', authorId);
      } finally {
         if (localPath.includes('source-image-') && fs.existsSync(localPath)) {
            fs.unlinkSync(localPath);
         }
      }
   }

   async updateMyAuthorProfile(
      authorId: string,
      data: UpdateAuthorDto,
      avatarSourcePath?: string,
   ): Promise<AuthorDto> {
      try {
         const existingAuthor = await this.prisma.author.findUnique({ where: { id: authorId } });
         if (!existingAuthor) {
            throw DomainError.notFound(msg.not_found);
         }

         if (data.discoverable !== undefined) {
            const discoverable = data.discoverable;
            await runWrite(this.prisma, (tx) =>
               tx.author.update({
                  where: { id: authorId },
                  data: { discoverable },
               }),
            );
         }

         if (avatarSourcePath) {
            const { primaryStorageKey } = await this.imageAssetService.generateAndStoreVariants(
               'author',
               authorId,
               avatarSourcePath,
            );
            await runWrite(this.prisma, (tx) =>
               tx.author.update({
                  where: { id: authorId },
                  data: { avatar: primaryStorageKey },
               }),
            );
         } else if (data.avatar !== undefined) {
            if (data.avatar !== existingAuthor.avatar) {
               await this.imageAssetService.deleteAssetsForEntity('author', authorId);
               await mediaCleanupService.deleteStoredFile(existingAuthor.avatar);
            }
            await runWrite(this.prisma, (tx) =>
               tx.author.update({
                  where: { id: authorId },
                  data: { avatar: data.avatar ?? null },
               }),
            );
         }

         const userUpdates: Prisma.UserUpdateInput = {};
         if (data.firstName !== undefined) {
            userUpdates.firstName = data.firstName.trim();
         }
         if (data.lastName !== undefined) {
            userUpdates.lastName = data.lastName.trim();
         }
         if (data.address !== undefined) {
            userUpdates.address = data.address.trim() || null;
         }
         if (data.contact !== undefined) {
            userUpdates.contact = data.contact.trim() || null;
         }
         if (Object.keys(userUpdates).length > 0) {
            await runWrite(this.prisma, (tx) =>
               tx.user.update({
                  where: { id: existingAuthor.userId },
                  data: userUpdates,
               }),
            );
         }

         emitCacheInvalidation('author', 'updated', authorId);
         const record = await this.getAuthorRecord(authorId);
         return this.resolveAuthorDto(toAuthorDto(record));
      } catch (error) {
         rethrowServiceError(error, { operation: 'updateMyAuthorProfile' }, msg.update_failed);
      }
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
         return this.resolveAuthorDto(toAuthorDto(created));
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
         return this.resolveAuthorDto(toAuthorDto(updated));
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

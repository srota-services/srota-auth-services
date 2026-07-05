import { Gender, Prisma, PrismaClient } from '@prisma/client';
import { runWrite } from '../utils/prismaTransaction';
import { UpdateUserProfileRequest, UserResponse, PublicUserProfileResponse } from '../types';
import { LocationResolverService } from './LocationResolverService';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { fileUrlService } from './FileUrlService';
import { ImageAssetService } from './ImageAssetService';
import { mediaCleanupService } from './MediaCleanupService';
import { UsernameGenerator } from '../utils/UsernameGenerator';
import { DomainError } from '../types/domain';
import { prisma } from '../lib/prisma';

const DEFAULT_PREFERENCES = {
   theme: 'light',
   language: 'en',
   autoPlay: false,
   playbackSpeed: 1.0,
};

export class UserProfileService {
   private locationResolver: LocationResolverService;
   private imageAssetService: ImageAssetService;
   private usernameGenerator: UsernameGenerator;

   constructor(
      private readonly db: PrismaClient = prisma,
      locationResolver?: LocationResolverService,
   ) {
      this.locationResolver = locationResolver ?? new LocationResolverService();
      this.imageAssetService = new ImageAssetService(this.db);
      this.usernameGenerator = new UsernameGenerator(this.db);
   }

   async initializeUserProfile(userId: string, options?: { avatar?: string }): Promise<UserResponse> {
      const existing = await this.db.user.findUnique({ where: { id: userId } });
      if (!existing) {
         throw DomainError.notFound('User not found');
      }

      if (existing.username) {
         return this.getUserProfile(userId);
      }

      const { username } = await this.usernameGenerator.generateUniqueUsername();
      const user = await runWrite(this.db, (tx) =>
         tx.user.update({
            where: { id: userId },
            data: {
               username,
               preferences: DEFAULT_PREFERENCES as Prisma.InputJsonValue,
               ...(options?.avatar ? { avatar: options.avatar } : {}),
            },
         }),
      );

      emitCacheInvalidation('user-profile', 'created', userId, { userId });
      return this.resolveUserResponse(user);
   }

   async getUserProfile(userId: string): Promise<UserResponse> {
      const user = await this.db.user.findUnique({ where: { id: userId } });
      if (!user) {
         throw DomainError.notFound('User not found');
      }
      return this.resolveUserResponse(user);
   }

   async getPublicUserProfile(userId: string): Promise<PublicUserProfileResponse | null> {
      const user = await this.db.user.findUnique({
         where: { id: userId },
         select: { id: true, username: true, avatar: true },
      });
      if (!user?.username) {
         return null;
      }

      const resolved = await fileUrlService.resolveUserMedia({
         id: user.id,
         avatar: user.avatar,
      });

      return {
         userId: user.id,
         username: user.username,
         ...(resolved.avatar ? { avatar: resolved.avatar } : {}),
         imageAssets: resolved.imageAssets,
      };
   }

   async updateUserProfile(
      userId: string,
      data: UpdateUserProfileRequest,
      avatarSourcePath?: string,
   ): Promise<UserResponse> {
      const existing = await this.db.user.findUnique({ where: { id: userId } });
      if (!existing) {
         throw DomainError.notFound('User not found');
      }

      const updateData: Prisma.UserUpdateInput = {};

      if (data.firstName !== undefined) updateData.firstName = data.firstName;
      if (data.lastName !== undefined) updateData.lastName = data.lastName;
      if (data.address !== undefined) updateData.address = data.address;
      if (data.contact !== undefined) updateData.contact = data.contact;
      if (data.gender !== undefined) updateData.gender = data.gender;
      if (data.age !== undefined) updateData.age = data.age;
      if (data.preferences !== undefined && data.preferences !== null) {
         updateData.preferences = data.preferences as Prisma.InputJsonValue;
      }
      if (data.username !== undefined) {
         if (!UsernameGenerator.isValidUsername(data.username)) {
            throw DomainError.validation('Invalid username format');
         }
         updateData.username = data.username;
      }
      if (data.location !== undefined) {
         if (data.location === null) {
            updateData.location = null;
         } else {
            updateData.location = await this.locationResolver.resolveFromCoordinates(
               Number(data.location.latitude),
               Number(data.location.longitude),
            );
         }
      }

      let user = await runWrite(this.db, (tx) =>
         tx.user.update({
            where: { id: userId },
            data: updateData,
         }),
      );

      if (avatarSourcePath) {
         const { primaryStorageKey } = await this.imageAssetService.generateAndStoreVariants(
            'user',
            userId,
            avatarSourcePath,
         );
         user = await runWrite(this.db, (tx) =>
            tx.user.update({
               where: { id: userId },
               data: { avatar: primaryStorageKey },
            }),
         );
      } else if (data.avatar !== undefined && data.avatar !== existing.avatar) {
         await this.imageAssetService.deleteAssetsForEntity('user', userId);
         await mediaCleanupService.deleteStoredFile(existing.avatar);
         user = await runWrite(this.db, (tx) =>
            tx.user.update({
               where: { id: userId },
               data: { avatar: data.avatar ?? null },
            }),
         );
      }

      emitCacheInvalidation('user-profile', 'updated', userId, { userId });
      return this.resolveUserResponse(user);
   }

   private async resolveUserResponse(user: {
      id: string;
      email: string;
      role: UserResponse['role'];
      emailVerified: boolean;
      firstName: string | null;
      lastName: string | null;
      address: string | null;
      contact: string | null;
      gender: Gender | null;
      location: string | null;
      age: number | null;
      username: string | null;
      avatar: string | null;
      preferences: unknown;
      createdAt: Date;
      updatedAt: Date;
   }): Promise<UserResponse> {
      const base = toUserResponse(user);
      const resolved = await fileUrlService.resolveUserMedia({
         id: user.id,
         avatar: user.avatar,
      });
      return {
         ...base,
         ...(user.username ? { username: user.username } : {}),
         ...(resolved.avatar ? { avatar: resolved.avatar } : {}),
         ...(user.preferences ? { preferences: user.preferences as Record<string, unknown> } : {}),
         imageAssets: resolved.imageAssets,
      };
   }
}

export function toUserResponse(user: {
   id: string;
   email: string;
   role: UserResponse['role'];
   emailVerified: boolean;
   firstName: string | null;
   lastName: string | null;
   address: string | null;
   contact: string | null;
   gender: Gender | null;
   location: string | null;
   age: number | null;
   username?: string | null;
   avatar?: string | null;
   preferences?: unknown;
   createdAt: Date;
   updatedAt: Date;
}): UserResponse {
   const response: UserResponse = {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
   };

   if (user.firstName !== null) response.firstName = user.firstName;
   if (user.lastName !== null) response.lastName = user.lastName;
   if (user.address !== null) response.address = user.address;
   if (user.contact !== null) response.contact = user.contact;
   if (user.gender !== null) response.gender = user.gender;
   if (user.location !== null) response.location = user.location;
   if (user.age !== null) response.age = user.age;
   if (user.username) response.username = user.username;
   if (user.preferences) response.preferences = user.preferences as Record<string, unknown>;

   return response;
}

export const userProfileService = new UserProfileService();

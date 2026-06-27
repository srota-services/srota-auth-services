import { Gender, PrismaClient } from '@prisma/client';
import { runWrite } from '../utils/prismaTransaction';
import { UpdateUserProfileRequest, UserResponse } from '../types';
import { LocationResolverService } from './LocationResolverService';
import { emitCacheInvalidation } from './DomainEventPublisher';

const prisma = new PrismaClient();

export class UserProfileService {
   private locationResolver: LocationResolverService;

   constructor(locationResolver?: LocationResolverService) {
      this.locationResolver = locationResolver ?? new LocationResolverService();
   }

   async updateUserProfile(
      userId: string,
      data: UpdateUserProfileRequest,
   ): Promise<UserResponse> {
      const updateData: {
         firstName?: string;
         lastName?: string;
         address?: string | null;
         contact?: string | null;
         gender?: Gender | null;
         location?: string | null;
         age?: number | null;
      } = {};

      if (data.firstName !== undefined) {
         updateData.firstName = data.firstName;
      }
      if (data.lastName !== undefined) {
         updateData.lastName = data.lastName;
      }
      if (data.address !== undefined) {
         updateData.address = data.address;
      }
      if (data.contact !== undefined) {
         updateData.contact = data.contact;
      }
      if (data.gender !== undefined) {
         updateData.gender = data.gender;
      }
      if (data.age !== undefined) {
         updateData.age = data.age;
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

      const user = await runWrite(prisma, (tx) =>
         tx.user.update({
            where: { id: userId },
            data: updateData,
         }),
      );

      emitCacheInvalidation('user-profile', 'updated', userId, { userId });

      return toUserResponse(user);
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

   return response;
}

export const userProfileService = new UserProfileService();

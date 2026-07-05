import {
   PrismaClient,
   Role,
   UserDevice,
   UserDeviceChangeType,
   SubscriptionStatus,
   OtpPurpose,
} from '@prisma/client';
import { AuthError } from '../types';
import type { DeviceContext, DeviceRequestMeta } from '../types';
import { isDeviceLimitEnforcedRole } from '../constants/authRoles';
import { emitCacheInvalidation } from './DomainEventPublisher';
import {
   getCalendarMonthBounds,
   parsePlanFeatures,
   PLATFORM_MAX_DEVICES,
   resolveDeviceChangesPerMonth,
   resolveMaxDevices,
} from '../utils/deviceLimits';
import { otpService } from './otp';
import { appLogger } from '../utils/logger';
import { runWrite, runInTransaction } from '../utils/prismaTransaction';

export const DEVICE_REMOVAL_OTP_GENERIC_MESSAGE =
   'If the account and device are eligible, an OTP has been sent to your email.';

export interface UserDeviceDto {
   id: string;
   deviceId: string;
   deviceName: string | null;
   platform: string | null;
   lastSeenAt: Date;
   createdAt: Date;
}

export interface DeviceLimitInfo {
   maxDevices: number;
   registeredCount: number;
   remainingDeviceChanges: number;
}

function toUserDeviceDto(device: UserDevice): UserDeviceDto {
   return {
      id: device.id,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      platform: device.platform,
      lastSeenAt: device.lastSeenAt,
      createdAt: device.createdAt,
   };
}

export class UserDeviceService {
   constructor(private prisma: PrismaClient) { }

   async getMaxDevicesForUser(userId: string): Promise<number> {
      const features = await this.getPlanFeaturesForUser(userId);
      return resolveMaxDevices(features);
   }

   async getDeviceLimitInfo(userId: string, role?: Role): Promise<DeviceLimitInfo> {
      const registeredCount = await this.countDevices(userId);

      if (role !== undefined && !isDeviceLimitEnforcedRole(role)) {
         return {
            maxDevices: PLATFORM_MAX_DEVICES,
            registeredCount,
            remainingDeviceChanges: PLATFORM_MAX_DEVICES,
         };
      }

      const [maxDevices, remainingDeviceChanges] = await Promise.all([
         this.getMaxDevicesForUser(userId),
         this.getRemainingDeviceChanges(userId),
      ]);
      return { maxDevices, registeredCount, remainingDeviceChanges };
   }

   async countDevices(userId: string): Promise<number> {
      return this.prisma.userDevice.count({ where: { userId } });
   }

   async listDevices(userId: string): Promise<UserDeviceDto[]> {
      const devices = await this.prisma.userDevice.findMany({
         where: { userId },
         orderBy: { lastSeenAt: 'desc' },
      });
      return devices.map(toUserDeviceDto);
   }

   /**
    * Register or touch a device during auth. Skipped for GLOBAL_ADMIN (returns null).
    * Max device count is enforced for LISTENER only.
    */
   async resolveDeviceForAuth(
      userId: string,
      role: Role,
      device: DeviceContext,
      meta?: DeviceRequestMeta,
   ): Promise<UserDevice | null> {
      if (role === Role.GLOBAL_ADMIN) {
         return null;
      }

      const existing = await this.prisma.userDevice.findUnique({
         where: { userId_deviceId: { userId, deviceId: device.deviceId } },
      });

      if (existing) {
         return runWrite(this.prisma, (tx) =>
            tx.userDevice.update({
               where: { id: existing.id },
               data: {
                  lastSeenAt: new Date(),
                  ...(device.deviceName !== undefined ? { deviceName: device.deviceName } : {}),
                  ...(device.platform !== undefined ? { platform: device.platform } : {}),
                  ...(meta?.userAgent !== undefined ? { userAgent: meta.userAgent } : {}),
                  ...(meta?.ipAddress !== undefined ? { ipAddress: meta.ipAddress } : {}),
               },
            }),
         );
      }

      if (isDeviceLimitEnforcedRole(role)) {
         const maxDevices = await this.getMaxDevicesForUser(userId);
         const currentCount = await this.countDevices(userId);
         if (currentCount >= maxDevices) {
            const registeredDevices = await this.listDevices(userId);
            throw new AuthError(
               'Device limit reached for your subscription plan',
               403,
               'DEVICE_LIMIT_EXCEEDED',
               { maxDevices, registeredDevices },
            );
         }
      }

      return runWrite(this.prisma, (tx) =>
         tx.userDevice.create({
            data: {
               userId,
               deviceId: device.deviceId,
               deviceName: device.deviceName ?? null,
               platform: device.platform ?? null,
               userAgent: meta?.userAgent ?? null,
               ipAddress: meta?.ipAddress ?? null,
            },
         }),
      );
   }

   async assertDeviceExistsForRefresh(userDeviceId: string | null): Promise<void> {
      if (!userDeviceId) {
         return;
      }

      const device = await this.prisma.userDevice.findUnique({
         where: { id: userDeviceId },
      });

      if (!device) {
         throw new AuthError(
            'Device is no longer registered. Please sign in again.',
            403,
            'DEVICE_NOT_REGISTERED',
         );
      }

      await runWrite(this.prisma, (tx) =>
         tx.userDevice.update({
            where: { id: userDeviceId },
            data: { lastSeenAt: new Date() },
         }),
      );
   }

   async removeDevice(userId: string, deviceRowId: string, role: Role): Promise<void> {
      const device = await this.findDeviceForUser(userId, deviceRowId);

      if (!device) {
         throw new AuthError('Device not found', 404, 'DEVICE_NOT_FOUND');
      }

      await this.assertUserCanRemoveDevice(userId, role);

      await runInTransaction(this.prisma, async (tx) => {
         await tx.refreshToken.updateMany({
            where: { userDeviceId: device.id, isRevoked: false },
            data: { isRevoked: true },
         });

         await tx.userDeviceChange.create({
            data: {
               userId,
               type: UserDeviceChangeType.REMOVED,
               userDeviceId: device.id,
            },
         });

         await tx.userDevice.delete({ where: { id: device.id } });
      });

      emitCacheInvalidation('user-device', 'deleted', device.id, { userId });
   }

   /**
    * Request OTP for device removal. Silent no-op when email/device/quota checks fail.
    */
   async requestDeviceRemovalOtp(email: string, deviceRowId: string): Promise<void> {
      const user = await this.prisma.user.findUnique({
         where: { email: email.toLowerCase() },
      });

      if (!user) {
         return;
      }

      const device = await this.findDeviceForUser(user.id, deviceRowId);
      if (!device) {
         return;
      }

      const canRemove = await this.userCanRemoveDevice(user.id, user.role);
      if (!canRemove) {
         return;
      }

      try {
         await otpService.createOTP(user.id, OtpPurpose.DEVICE_REMOVAL, user.email);
      } catch (error) {
         appLogger.error({ err: error }, 'Failed to create device removal OTP');
      }
   }

   /**
    * Resend device removal OTP. Requires an active OTP and 30s since it was generated.
    */
   async resendDeviceRemovalOtp(email: string, deviceRowId: string): Promise<void> {
      const user = await this.prisma.user.findUnique({
         where: { email: email.toLowerCase() },
      });

      if (!user) {
         throw new AuthError('User not found', 404, 'USER_NOT_FOUND');
      }

      const device = await this.findDeviceForUser(user.id, deviceRowId);
      if (!device) {
         throw new AuthError('Device not found', 404, 'DEVICE_NOT_FOUND');
      }

      await this.assertUserCanRemoveDevice(user.id, user.role);

      const cooldown = await otpService.getResendCooldownState(
         user.id,
         OtpPurpose.DEVICE_REMOVAL,
      );

      if (!cooldown.hasActiveOtp) {
         throw new AuthError(
            'No active device removal OTP found. Request a new OTP first.',
            400,
            'DEVICE_REMOVAL_OTP_NOT_FOUND',
         );
      }

      if (cooldown.remainingSeconds > 0) {
         throw new AuthError(
            `Please wait ${cooldown.remainingSeconds} seconds before resending the OTP`,
            429,
            'OTP_RESEND_COOLDOWN',
            { remainingSeconds: cooldown.remainingSeconds },
         );
      }

      await otpService.createOTP(user.id, OtpPurpose.DEVICE_REMOVAL, user.email);
   }

   /**
    * Verify OTP and remove a device without JWT authentication.
    */
   async removeDeviceWithOtp(email: string, otp: string, deviceRowId: string): Promise<void> {
      const user = await this.prisma.user.findUnique({
         where: { email: email.toLowerCase() },
      });

      if (!user) {
         throw new AuthError('User not found', 404, 'USER_NOT_FOUND');
      }

      try {
         await otpService.verifyOTP(user.id, otp, OtpPurpose.DEVICE_REMOVAL);
      } catch (error) {
         const message = error instanceof Error ? error.message : 'Invalid OTP';
         throw new AuthError(message, 400, 'INVALID_OTP');
      }

      await this.removeDevice(user.id, deviceRowId, user.role);
   }

   private async findDeviceForUser(userId: string, deviceRowId: string): Promise<UserDevice | null> {
      return this.prisma.userDevice.findFirst({
         where: { id: deviceRowId, userId },
      });
   }

   private async userCanRemoveDevice(userId: string, role: Role): Promise<boolean> {
      if (!isDeviceLimitEnforcedRole(role)) {
         return true;
      }

      const deviceChangesPerMonth = await this.getDeviceChangesPerMonthForUser(userId);
      if (deviceChangesPerMonth === 0) {
         return false;
      }

      const remaining = await this.getRemainingDeviceChanges(userId);
      return remaining > 0;
   }

   private async assertUserCanRemoveDevice(userId: string, role: Role): Promise<void> {
      if (!isDeviceLimitEnforcedRole(role)) {
         return;
      }

      const deviceChangesPerMonth = await this.getDeviceChangesPerMonthForUser(userId);

      if (deviceChangesPerMonth === 0) {
         throw new AuthError(
            'Your plan does not allow removing devices',
            403,
            'DEVICE_CHANGES_NOT_ALLOWED',
         );
      }

      const remaining = await this.getRemainingDeviceChanges(userId);
      if (remaining <= 0) {
         throw new AuthError(
            'Monthly device change limit reached',
            403,
            'DEVICE_CHANGE_QUOTA_EXCEEDED',
         );
      }
   }

   async revokeRefreshTokensForDevice(userDeviceId: string): Promise<void> {
      await runWrite(this.prisma, (tx) =>
         tx.refreshToken.updateMany({
            where: { userDeviceId, isRevoked: false },
            data: { isRevoked: true },
         }),
      );
   }

   async getRemainingDeviceChanges(userId: string): Promise<number> {
      const allowance = await this.getDeviceChangesPerMonthForUser(userId);
      const used = await this.countDeviceChangesThisMonth(userId);
      return Math.max(0, allowance - used);
   }

   private async countDeviceChangesThisMonth(userId: string): Promise<number> {
      const { start, end } = getCalendarMonthBounds();
      return this.prisma.userDeviceChange.count({
         where: {
            userId,
            createdAt: { gte: start, lt: end },
         },
      });
   }

   private async getDeviceChangesPerMonthForUser(userId: string): Promise<number> {
      const features = await this.getPlanFeaturesForUser(userId);
      return resolveDeviceChangesPerMonth(features);
   }

   private async getPlanFeaturesForUser(userId: string) {
      const sub = await this.prisma.userSubscription.findFirst({
         where: {
            userId,
            status: {
               in: [
                  SubscriptionStatus.ACTIVE,
                  SubscriptionStatus.TRIALING,
                  SubscriptionStatus.PAST_DUE,
               ],
            },
         },
         orderBy: { createdAt: 'desc' },
         include: { plan: true },
      });

      if (!sub?.plan.features) {
         return null;
      }

      const features = parsePlanFeatures(sub.plan.features);
      if (!features) {
         appLogger.warn(
            { userId, planId: sub.plan.id },
            'Subscription plan has invalid features JSON; using free-tier device defaults'
         );
         return null;
      }

      return features;
   }
}

import { PrismaClient, OtpPurpose } from '@prisma/client';
import type { OtpToken } from '@prisma/client';
import { PasswordUtils } from '../utils/crypto';
import { emailLogger } from '../utils/logger';
import { runInTransaction, runWrite } from '../utils/prismaTransaction';
import { emailService } from './email';

// Prisma 7 reads connection from prisma.config.ts automatically
const prisma = new PrismaClient();

/**
 * OTP Service for generating, storing, and verifying OTP codes
 */
export class OTPService {
   private readonly OTP_EXPIRY_MINUTES = 10;
   private readonly RESEND_COOLDOWN_SECONDS = 30;
   private readonly MAX_ATTEMPTS = 3;

   /**
    * Generate a 6-digit numeric OTP
    */
   generateOTP(): string {
      // Generate random 6-digit number (000000-999999)
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      return otp;
   }

   /**
    * Create and send OTP for a user
    * @param userId - User ID
    * @param purpose - Purpose of OTP
    * @param userEmail - User email for sending OTP
    * @returns Created OTP token
    */
   async createOTP(userId: string, purpose: OtpPurpose, userEmail: string): Promise<OtpToken> {
      // Check for existing unexpired OTP for same purpose
      const existingOTP = await prisma.otpToken.findFirst({
         where: {
            userId,
            purpose,
            isVerified: false,
            invalidatedAt: null,
            expiresAt: {
               gt: new Date(),
            },
         },
         orderBy: {
            createdAt: 'desc',
         },
      });

      // Check 30-second cooldown for resend
      if (existingOTP) {
         const timeSinceCreation = Date.now() - existingOTP.createdAt.getTime();
         const cooldownMs = this.RESEND_COOLDOWN_SECONDS * 1000;

         if (timeSinceCreation < cooldownMs) {
            const remainingSeconds = Math.ceil((cooldownMs - timeSinceCreation) / 1000);
            throw new Error(`Please wait ${remainingSeconds} seconds before requesting a new OTP`);
         }

      }

      // Generate OTP
      const otpCode = this.generateOTP();

      if (purpose === OtpPurpose.DEVICE_REMOVAL) {
         emailLogger.info({ email: userEmail, purpose }, 'Device removal OTP created');
      }

      // Hash OTP using Argon2 (same as passwords for security)
      const otpHash = await PasswordUtils.hashPassword(otpCode);

      // Calculate expiration time (10 minutes from now)
      const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

      const otpToken = await runInTransaction(prisma, async (tx) => {
         if (existingOTP) {
            await tx.otpToken.update({
               where: { id: existingOTP.id },
               data: { invalidatedAt: new Date() },
            });
         }

         return tx.otpToken.create({
            data: {
               codeHash: otpHash,
               userId,
               purpose,
               expiresAt,
               attempts: 0,
               isVerified: false,
            },
         });
      });

      // Send OTP email (don't fail if email fails)
      try {
         await emailService.sendOTPEmail(userEmail, otpCode, purpose, userId);
         emailLogger.debug({ userId, purpose }, 'OTP email sent');
      } catch (error) {
         emailLogger.error({ err: error, userId, userEmail, purpose }, 'Failed to send OTP email, but OTP was created');
         // OTP is still created and stored, user can request resend if needed
      }

      return otpToken;
   }

   /**
    * Verify OTP code for a user
    * @param userId - User ID
    * @param code - OTP code to verify
    * @param purpose - Purpose of OTP
    * @returns True if OTP is valid, false otherwise
    * @throws Error if OTP is expired, max attempts reached, or invalid
    */
   async verifyOTP(userId: string, code: string, purpose: OtpPurpose): Promise<boolean> {
      // Find valid OTP (not expired, not verified, not invalidated, attempts < 3)
      const otpToken = await prisma.otpToken.findFirst({
         where: {
            userId,
            purpose,
            isVerified: false,
            invalidatedAt: null,
            expiresAt: {
               gt: new Date(),
            },
            attempts: {
               lt: this.MAX_ATTEMPTS,
            },
         },
         orderBy: {
            createdAt: 'desc',
         },
      });

      if (!otpToken) {
         throw new Error('Invalid or expired OTP. Please request a new one.');
      }

      // Verify OTP by comparing hashed code
      const isValid = await PasswordUtils.verifyPassword(code, otpToken.codeHash);

      if (!isValid) {
         // Increment attempts on failure
         const newAttempts = otpToken.attempts + 1;
         const remainingAttempts = this.MAX_ATTEMPTS - newAttempts;

         await runWrite(prisma, (tx) =>
            tx.otpToken.update({
               where: { id: otpToken.id },
               data: { attempts: newAttempts },
            }),
         );

         if (remainingAttempts <= 0) {
            throw new Error('Maximum OTP verification attempts reached. Please request a new OTP.');
         }

         throw new Error(`Invalid OTP. ${remainingAttempts} attempt(s) remaining.`);
      }

      await runWrite(prisma, (tx) =>
         tx.otpToken.update({
            where: { id: otpToken.id },
            data: { isVerified: true },
         }),
      );

      return true;
   }

   /**
    * Invalidate an OTP token
    * @param otpId - OTP token ID
    */
   async invalidateOTP(otpId: string): Promise<void> {
      await runWrite(prisma, (tx) =>
         tx.otpToken.update({
            where: { id: otpId },
            data: { invalidatedAt: new Date() },
         }),
      );
   }

   /**
    * Check if user can resend OTP (30-second cooldown)
    * @param userId - User ID
    * @param purpose - Purpose of OTP
    * @returns True if can resend, false otherwise
    */
   async canResendOTP(userId: string, purpose: OtpPurpose): Promise<boolean> {
      const existingOTP = await prisma.otpToken.findFirst({
         where: {
            userId,
            purpose,
            isVerified: false,
            invalidatedAt: null,
            expiresAt: {
               gt: new Date(),
            },
         },
         orderBy: {
            createdAt: 'desc',
         },
      });

      if (!existingOTP) {
         return true; // No existing OTP, can create new one
      }

      const timeSinceCreation = Date.now() - existingOTP.createdAt.getTime();
      const cooldownMs = this.RESEND_COOLDOWN_SECONDS * 1000;

      return timeSinceCreation >= cooldownMs;
   }

   /**
    * Resend cooldown state for an active (unexpired, unverified) OTP.
    * remainingSeconds is 0 when resend is allowed; >0 when still in cooldown.
    */
   async getResendCooldownState(
      userId: string,
      purpose: OtpPurpose,
   ): Promise<{ hasActiveOtp: boolean; remainingSeconds: number }> {
      const existingOTP = await prisma.otpToken.findFirst({
         where: {
            userId,
            purpose,
            isVerified: false,
            invalidatedAt: null,
            expiresAt: { gt: new Date() },
         },
         orderBy: { createdAt: 'desc' },
      });

      if (!existingOTP) {
         return { hasActiveOtp: false, remainingSeconds: 0 };
      }

      const elapsedMs = Date.now() - existingOTP.createdAt.getTime();
      const cooldownMs = this.RESEND_COOLDOWN_SECONDS * 1000;
      const remainingMs = Math.max(0, cooldownMs - elapsedMs);

      return {
         hasActiveOtp: true,
         remainingSeconds: Math.ceil(remainingMs / 1000),
      };
   }

   /**
    * Get remaining attempts for an OTP
    * @param userId - User ID
    * @param purpose - Purpose of OTP
    * @returns Remaining attempts or null if no valid OTP
    */
   async getRemainingAttempts(userId: string, purpose: OtpPurpose): Promise<number | null> {
      const otpToken = await prisma.otpToken.findFirst({
         where: {
            userId,
            purpose,
            isVerified: false,
            invalidatedAt: null,
            expiresAt: {
               gt: new Date(),
            },
         },
         orderBy: {
            createdAt: 'desc',
         },
      });

      if (!otpToken) {
         return null;
      }

      return this.MAX_ATTEMPTS - otpToken.attempts;
   }
}

export const otpService = new OTPService();


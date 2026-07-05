import { PrismaClient, User, Role, OtpPurpose } from '@prisma/client';
import { PasswordUtils, TokenUtils } from '../utils/crypto';
import { redisService } from './redis';
import { googleOAuthService } from './google-oauth';
import { otpService } from './otp';
import { userDeviceService } from './userDevice';
import { appLogger } from '../utils/logger';
import { runWrite, runInTransaction, type TransactionClient } from '../utils/prismaTransaction';
import { logServiceError } from '../utils/serviceError';
import { ClientType } from '../constants/clientType';
import { OAuthClientApp } from '../constants/oauthClientApp';
import { isPartnerAppRole, isOrgAdminRole, isOrgCoordinatorRole, isGlobalAuthorRole } from '../constants/authRoles';
import { buildGuestEmail, isGuestEmail } from '../constants/guestUser';
import { AuthorService } from './AuthorService';
import { OrganizationService } from './OrganizationService';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { toUserResponse, userProfileService } from './userProfile';
import {
   RegisterRequest,
   LoginRequest,
   MobileLoginRequest,
   RefreshTokenRequest,
   AuthResponse,
   UserResponse,
   VerifyEmailRequest,
   ForgotPasswordRequest,
   ResetPasswordRequest,
   GoogleOAuthRequest,
   GuestAuthRequest,
   VerifyOTPRequest,
   ChangePasswordRequest,
   UpdateEmailRequest,
   VerifyPasswordChangeOTPRequest,
   VerifyEmailUpdateOTPRequest,
   VerifyForgotPasswordOTPRequest,
   DeviceContext,
   DeviceRequestMeta,
} from '../types';

// Prisma 7 reads connection from prisma.config.ts automatically
const prisma = new PrismaClient();

/**
 * Authentication service handling user registration, login, and token management
 */
export class AuthService {
   /**
    * Register a new user
    */
   async register(data: RegisterRequest): Promise<{ user: UserResponse; otpSent: boolean }> {
      const {
         email,
         password,
         role,
         firstName,
         lastName,
         address,
         contact,
         avatar,
         profileImage,
      } = data;
      const userRole = role ?? Role.LISTENER;
      const isAuthor = userRole === Role.AUTHOR;

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
         where: { email: email.toLowerCase() },
      });

      if (existingUser) {
         if (existingUser.role === Role.LISTENER) {
            throw new Error(
               'This email is already registered as a listener account. Organization staff must use a separate email address.',
            );
         }
         throw new Error('User with this email already exists');
      }

      // Hash password
      const hashedPassword = await PasswordUtils.hashPassword(password);

      // Create user
      const user = await runWrite(prisma, (tx) =>
         tx.user.create({
            data: {
               email: email.toLowerCase(),
               password: hashedPassword,
               role: userRole,
               emailVerified: false,
            },
         }),
      );

      if (isAuthor) {
         await redisService.setPendingAuthorRegistration(user.id, {
            firstName: firstName!,
            lastName: lastName!,
            address: address!,
            ...(contact !== undefined ? { contact } : {}),
            ...(profileImage !== undefined ? { profileImage } : {}),
         });
      } else {
         await redisService.setPendingUserRegistration(user.id, {
            address: address!,
            contact: contact!,
            ...(avatar !== undefined ? { avatar } : {}),
         });
      }

      // Generate and send OTP for registration (RabbitMQ will be published after OTP verification)
      try {
         await otpService.createOTP(user.id, OtpPurpose.REGISTRATION, user.email);
      } catch (error) {
         if (isAuthor) {
            await redisService.deletePendingAuthorRegistration(user.id);
         } else {
            await redisService.deletePendingUserRegistration(user.id);
         }
         logServiceError(error, { operation: 'register.createOTP' });
         throw new Error('Failed to send OTP. Please try again.');
      }

      return {
         user: toUserResponse(user),
         otpSent: true,
      };
   }

   /**
    * Login user (browser or mobile)
    */
   async login(data: LoginRequest & { meta?: DeviceRequestMeta }): Promise<AuthResponse> {
      const { email, password, app } = data;

      // Find user
      const user = await prisma.user.findUnique({
         where: { email: email.toLowerCase() },
      });

      if (!user) {
         // Use constant time to prevent timing attacks
         await PasswordUtils.hashPassword('dummy');
         throw new Error('Invalid email or password');
      }

      // Check if user has a password (OAuth users don't have passwords)
      if (!user.password) {
         throw new Error('Invalid email or password. Please use Google OAuth to sign in.');
      }

      // Verify password
      const isValidPassword = await PasswordUtils.verifyPassword(password, user.password);
      if (!isValidPassword) {
         throw new Error('Invalid email or password');
      }

      // Check if user is verified
      if (!user.emailVerified) {
         throw new Error('Email not verified. Please check your email for verification link.');
      }

      this.assertAppAccess(user, app);

      const appType = await this.resolveLoginAppType(user, data.slug);

      return this.issueAuthTokens(user, data.device, data.meta, appType);
   }

   /**
    * Verify registration OTP and publish to RabbitMQ
    * Returns access and refresh tokens
    */
   async verifyRegistrationOTP(
      data: VerifyOTPRequest & { meta?: DeviceRequestMeta },
   ): Promise<AuthResponse> {
      const { email, otp, firstName, lastName } = data;

      // Find user
      const user = await prisma.user.findUnique({
         where: { email: email.toLowerCase() },
      });

      if (!user) {
         throw new Error('User not found');
      }

      // Verify OTP
      await otpService.verifyOTP(user.id, otp, OtpPurpose.REGISTRATION);

      if (user.role === Role.AUTHOR) {
         const pendingAuthor = await redisService.getPendingAuthorRegistration(user.id);
         if (!pendingAuthor) {
            throw new Error('Author registration data expired, please register again');
         }

         const authorService = new AuthorService(prisma);
         const { updatedUser, author } = await runInTransaction(prisma, async (tx) => {
            const updated = await tx.user.update({
               where: { id: user.id },
               data: {
                  emailVerified: true,
                  firstName: pendingAuthor.firstName,
                  lastName: pendingAuthor.lastName,
                  address: pendingAuthor.address,
                  ...(pendingAuthor.contact !== undefined ? { contact: pendingAuthor.contact } : {}),
               },
            });

            const authorDto = await authorService.createAuthorForUser(
               updated.id,
               pendingAuthor.firstName,
               pendingAuthor.lastName,
               tx,
            );

            return { updatedUser: updated, author: authorDto };
         });

         emitCacheInvalidation('author', 'created', author.id);

         if (pendingAuthor.profileImage) {
            try {
               await authorService.applyAuthorAvatarFromSource(author.id, pendingAuthor.profileImage);
            } catch (error) {
               appLogger.error({ err: error }, 'Failed to persist author registration avatar');
            }
         }

         const authResponse = await this.issueAuthTokens(updatedUser, data.device, data.meta);

         try {
            await authorService.bootstrapDefaultAuthorTier(author.id);
         } catch (error) {
            appLogger.error({ err: error }, 'Failed to bootstrap author tier');
         } finally {
            await redisService.deletePendingAuthorRegistration(updatedUser.id);
         }

         return authResponse;
      }

      const pendingUser = await redisService.getPendingUserRegistration(user.id);
      if (!pendingUser) {
         throw new Error('User registration data expired, please register again');
      }

      const updatedUser = await runWrite(prisma, (tx) =>
         tx.user.update({
            where: { id: user.id },
            data: {
               emailVerified: true,
               address: pendingUser.address,
               contact: pendingUser.contact,
               ...(firstName !== undefined && firstName.trim().length > 0 ? { firstName: firstName.trim() } : {}),
               ...(lastName !== undefined && lastName.trim().length > 0 ? { lastName: lastName.trim() } : {}),
            },
         }),
      );

      await userProfileService.initializeUserProfile(updatedUser.id, {
         ...(pendingUser.avatar ? { avatar: pendingUser.avatar } : {}),
      });

      const authResponse = await this.issueAuthTokens(updatedUser, data.device, data.meta);

      try {
         emitCacheInvalidation('user', 'created', updatedUser.id);
      } catch (error) {
         appLogger.error({ err: error }, 'Failed to emit user created cache event');
      } finally {
         await redisService.deletePendingUserRegistration(updatedUser.id);
      }

      return authResponse;
   }

   /**
    * Mobile login with PKCE
    */
   async mobileLogin(data: MobileLoginRequest & { meta?: DeviceRequestMeta }): Promise<AuthResponse> {
      const { email, password, codeChallenge, codeChallengeMethod, app } = data;

      // Validate PKCE parameters
      if (codeChallengeMethod !== 'S256') {
         throw new Error('Unsupported code challenge method');
      }

      // Perform regular login first (pass app attribute if present)
      const loginData: LoginRequest & { meta?: DeviceRequestMeta } = {
         email,
         password,
         clientType: ClientType.MOBILE,
         device: data.device,
      };
      if (data.meta) {
         loginData.meta = data.meta;
      }
      if (app) {
         loginData.app = app;
      }
      const loginResult = await this.login(loginData);

      // Store PKCE session for token exchange
      const sessionId = TokenUtils.generateToken();
      await redisService.storePKCESession(sessionId, {
         codeChallenge,
         userId: loginResult.user.id,
         expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      });

      return loginResult;
   }

   /**
    * Refresh access token
    */
   async refreshToken(data: RefreshTokenRequest): Promise<AuthResponse> {
      const { refreshToken } = data;

      // Find refresh token
      const tokenRecord = await prisma.refreshToken.findUnique({
         where: { token: refreshToken },
         include: { user: true },
      });

      if (!tokenRecord || tokenRecord.isRevoked || tokenRecord.expiresAt < new Date()) {
         throw new Error('Invalid or expired refresh token');
      }

      // Check for token reuse (security feature)
      if (tokenRecord.replacedBy) {
         // Token has been replaced, revoke all tokens for this user
         await this.revokeAllUserTokens(tokenRecord.userId);
         throw new Error('Token has been reused. All sessions revoked for security.');
      }

      await userDeviceService.assertDeviceExistsForRefresh(tokenRecord.userDeviceId);

      // Generate new tokens
      const newAccessToken = this.generateAccessToken(tokenRecord.user);
      const newRefreshToken = TokenUtils.generateRefreshToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await runInTransaction(prisma, async (tx) => {
         await tx.refreshToken.update({
            where: { id: tokenRecord.id },
            data: { replacedBy: newRefreshToken },
         });

         await tx.refreshToken.create({
            data: {
               token: newRefreshToken,
               userId: tokenRecord.userId,
               userDeviceId: tokenRecord.userDeviceId,
               expiresAt,
            },
         });
      });

      return {
         accessToken: newAccessToken,
         refreshToken: newRefreshToken,
         user: {
            id: tokenRecord.user.id,
            email: tokenRecord.user.email,
            role: tokenRecord.user.role,
            emailVerified: tokenRecord.user.emailVerified,
         },
      };
   }

   /**
    * Logout user (revoke refresh token)
    */
   async logout(refreshToken: string): Promise<void> {
      await runWrite(prisma, (tx) =>
         tx.refreshToken.updateMany({
            where: { token: refreshToken },
            data: { isRevoked: true },
         }),
      );
   }

   /**
    * Verify email with token
    */
   async verifyEmail(data: VerifyEmailRequest): Promise<void> {
      const { token } = data;

      const verificationRecord = await prisma.emailVerificationToken.findUnique({
         where: { token },
         include: { user: true },
      });

      if (!verificationRecord || verificationRecord.used || verificationRecord.expiresAt < new Date()) {
         throw new Error('Invalid or expired verification token');
      }

      await runInTransaction(prisma, async (tx) => {
         await tx.user.update({
            where: { id: verificationRecord.userId },
            data: { emailVerified: true },
         });

         await tx.emailVerificationToken.update({
            where: { id: verificationRecord.id },
            data: { used: true },
         });
      });
   }

   /**
    * Request password reset OTP
    */
   async forgotPassword(data: ForgotPasswordRequest): Promise<void> {
      const { email } = data;

      if (isGuestEmail(email)) {
         return;
      }

      const user = await prisma.user.findUnique({
         where: { email: email.toLowerCase() },
      });

      if (!user) {
         // Don't reveal if user exists
         return;
      }

      // Generate and send OTP
      try {
         await otpService.createOTP(user.id, OtpPurpose.PASSWORD_RESET, user.email);
      } catch (error) {
         logServiceError(error, { operation: 'forgotPassword.createOTP' });
         throw new Error('Failed to send OTP. Please try again.');
      }
   }

   /**
    * Verify forgot password OTP
    */
   async verifyForgotPasswordOTP(data: VerifyForgotPasswordOTPRequest): Promise<void> {
      const { email, otp } = data;

      const user = await prisma.user.findUnique({
         where: { email: email.toLowerCase() },
      });

      if (!user) {
         throw new Error('User not found');
      }

      // Verify OTP
      await otpService.verifyOTP(user.id, otp, OtpPurpose.PASSWORD_RESET);
   }

   /**
    * Reset password (no OTP check required)
    */
   async resetPassword(data: ResetPasswordRequest): Promise<void> {
      const { email, newPassword } = data;

      const user = await prisma.user.findUnique({
         where: { email: email.toLowerCase() },
      });

      if (!user) {
         throw new Error('User not found');
      }

      // Hash new password
      const hashedPassword = await PasswordUtils.hashPassword(newPassword);

      await runInTransaction(prisma, async (tx) => {
         await tx.user.update({
            where: { id: user.id },
            data: { password: hashedPassword },
         });

         await tx.refreshToken.updateMany({
            where: { userId: user.id },
            data: { isRevoked: true },
         });
      });
   }

   /**
    * Request OTP for password change
    */
   async requestPasswordChangeOTP(userId: string): Promise<void> {
      const user = await prisma.user.findUnique({
         where: { id: userId },
      });

      if (!user) {
         throw new Error('User not found');
      }

      // Check if user has a password (OAuth users can't change password this way)
      if (!user.password) {
         throw new Error('Password change not available for OAuth users');
      }

      // Generate and send OTP
      try {
         await otpService.createOTP(userId, OtpPurpose.PASSWORD_UPDATE, user.email);
      } catch (error) {
         logServiceError(error, { operation: 'requestPasswordChangeOTP.createOTP' });
         throw new Error('Failed to send OTP. Please try again.');
      }
   }

   /**
    * Verify password change OTP
    */
   async verifyPasswordChangeOTP(userId: string, data: VerifyPasswordChangeOTPRequest): Promise<void> {
      const { otp } = data;

      // Verify OTP
      await otpService.verifyOTP(userId, otp, OtpPurpose.PASSWORD_UPDATE);
   }

   /**
    * Change password (authenticated user) - no OTP check required
    */
   async changePassword(userId: string, data: ChangePasswordRequest): Promise<void> {
      const { currentPassword, newPassword } = data;

      const user = await prisma.user.findUnique({
         where: { id: userId },
      });

      if (!user) {
         throw new Error('User not found');
      }

      // Check if user has a password (OAuth users can't change password this way)
      if (!user.password) {
         throw new Error('Password change not available for OAuth users');
      }

      // Verify current password
      const isValidPassword = await PasswordUtils.verifyPassword(currentPassword, user.password);
      if (!isValidPassword) {
         throw new Error('Current password is incorrect');
      }

      // Hash new password
      const hashedPassword = await PasswordUtils.hashPassword(newPassword);

      await runInTransaction(prisma, async (tx) => {
         await tx.user.update({
            where: { id: userId },
            data: { password: hashedPassword },
         });

         await tx.refreshToken.updateMany({
            where: { userId },
            data: { isRevoked: true },
         });
      });
   }

   /**
    * Request OTP for email update
    */
   async requestEmailUpdateOTP(userId: string, data: { email: string }): Promise<void> {
      const { email } = data;

      const user = await prisma.user.findUnique({
         where: { id: userId },
      });

      if (!user) {
         throw new Error('User not found');
      }
      // Generate and send OTP to current email address
      try {
         await otpService.createOTP(userId, OtpPurpose.EMAIL_UPDATE, email.toLowerCase());
      } catch (error) {
         logServiceError(error, { operation: 'requestEmailUpdateOTP.createOTP' });
         throw new Error('Failed to send OTP. Please try again.');
      }
   }

   /**
    * Verify email update OTP
    */
   async verifyEmailUpdateOTP(userId: string, data: VerifyEmailUpdateOTPRequest): Promise<void> {
      const { otp } = data;

      // Verify OTP
      await otpService.verifyOTP(userId, otp, OtpPurpose.EMAIL_UPDATE);
   }

   /**
    * Update email (no OTP check required)
    */
   async updateEmail(userId: string, data: UpdateEmailRequest): Promise<void> {
      const { newEmail } = data;

      const user = await prisma.user.findUnique({
         where: { id: userId },
      });

      if (!user) {
         throw new Error('User not found');
      }

      // Check if new email is different
      if (user.email.toLowerCase() === newEmail.toLowerCase()) {
         throw new Error('New email must be different from current email');
      }

      // Check if new email is already in use
      const existingUser = await prisma.user.findUnique({
         where: { email: newEmail.toLowerCase() },
      });

      if (existingUser) {
         throw new Error('Email already in use');
      }

      await runInTransaction(prisma, async (tx) => {
         await tx.user.update({
            where: { id: userId },
            data: {
               email: newEmail.toLowerCase(),
               emailVerified: false,
            },
         });

         await tx.refreshToken.updateMany({
            where: { userId },
            data: { isRevoked: true },
         });
      });
   }

   /**
    * Google OAuth authentication
    * Verifies Google token and handles signup/login flow
    */
   async googleOAuth(data: GoogleOAuthRequest & { meta?: DeviceRequestMeta }): Promise<AuthResponse> {
      const { token, app } = data;

      // Verify Google token
      const googleUser = await googleOAuthService.verifyGoogleToken(token);

      // Check if user exists by email
      let user = await prisma.user.findUnique({
         where: { email: googleUser.email },
      });

      if (user) {
         const needsGoogleIdLink = !user.googleId;
         const needsEmailVerify = !user.emailVerified && googleUser.emailVerified;

         if (needsGoogleIdLink || needsEmailVerify) {
            user = await runWrite(prisma, (tx) =>
               tx.user.update({
                  where: { id: user!.id },
                  data: {
                     ...(needsGoogleIdLink ? { googleId: googleUser.googleId } : {}),
                     ...(needsEmailVerify ? { emailVerified: true } : {}),
                  },
               }),
            );
         }

         if (user.googleId !== googleUser.googleId) {
            throw new Error('Google account mismatch. Please use the correct Google account.');
         }

         if (!user.emailVerified) {
            throw new Error('Email not verified. Please check your email for verification link.');
         }

         this.assertAppAccess(user, app);
      } else {
         // User doesn't exist - signup flow
         // Create new user with auto-verified email (Google already verified it)
         let firstName: string | undefined;
         let lastName: string | undefined;
         if (googleUser.name) {
            const nameParts = googleUser.name.trim().split(/\s+/);
            firstName = nameParts[0] || undefined;
            lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;
         }

         user = await runWrite(prisma, (tx) =>
            tx.user.create({
               data: {
                  email: googleUser.email,
                  password: null,
                  googleId: googleUser.googleId,
                  role: Role.LISTENER,
                  emailVerified: googleUser.emailVerified,
                  ...(firstName !== undefined ? { firstName } : {}),
                  ...(lastName !== undefined ? { lastName } : {}),
               },
            }),
         );

         try {
            await userProfileService.initializeUserProfile(user.id);
            emitCacheInvalidation('user', 'created', user.id);
         } catch (error) {
            appLogger.error({ err: error }, 'Failed to initialize user profile');
         }
      }

      return this.issueAuthTokens(user, data.device, data.meta);
   }

   /**
    * Create or resume an anonymous guest session bound to a device.
    */
   async createOrResumeGuestSession(
      data: GuestAuthRequest & { meta?: DeviceRequestMeta },
   ): Promise<AuthResponse> {
      const { device } = data;

      const existingDevice = await prisma.userDevice.findFirst({
         where: {
            deviceId: device.deviceId,
            user: { role: Role.GUEST },
         },
         include: { user: true },
         orderBy: { lastSeenAt: 'desc' },
      });

      const user = existingDevice?.user ?? await runWrite(prisma, (tx) =>
         tx.user.create({
            data: {
               email: buildGuestEmail(),
               password: null,
               role: Role.GUEST,
               emailVerified: true,
            },
         }),
      );

      if (!existingDevice?.user) {
         await userProfileService.initializeUserProfile(user.id);
      }

      return this.issueAuthTokens(user, device, data.meta);
   }

   /**
    * Get user by ID
    */
   async getUserById(userId: string): Promise<UserResponse | null> {
      try {
         return await userProfileService.getUserProfile(userId);
      } catch {
         return null;
      }
   }

   /**
    * Restrict login/OAuth by client app.
    */
   private assertAppAccess(user: User, app?: string): void {
      if (app === OAuthClientApp.PARTNER && !isPartnerAppRole(user.role)) {
         throw new Error(
            'Access denied. Global admin, author, or organization staff role required.',
         );
      }
   }

   private async resolveLoginAppType(
      user: User,
      slug?: string,
   ): Promise<'organization' | 'author' | undefined> {
      if (!slug || slug.trim().length === 0) {
         return undefined;
      }

      const trimmedSlug = slug.trim();
      const organizationService = new OrganizationService(prisma);
      const authorService = new AuthorService(prisma);

      if (isOrgAdminRole(user.role) || isOrgCoordinatorRole(user.role)) {
         const isMember = await organizationService.isUserMemberOfOrganizationBySlug(
            user.id,
            trimmedSlug,
         );
         if (!isMember) {
            throw new Error('You are not a member of this organization');
         }
         return 'organization';
      }

      if (isGlobalAuthorRole(user.role)) {
         const author = await authorService.getAuthorBySlug(trimmedSlug);
         if (!author || author.userId !== user.id) {
            throw new Error('Invalid author credentials');
         }
         return 'author';
      }

      throw new Error('Invalid login slug for this account type');
   }

   /**
    * Resolve device, issue access + refresh tokens, persist refresh token.
    */
   private async issueAuthTokens(
      user: User,
      device?: DeviceContext,
      meta?: DeviceRequestMeta,
      appType?: 'organization' | 'author',
   ): Promise<AuthResponse> {
      const userDevice = device
         ? await userDeviceService.resolveDeviceForAuth(
            user.id,
            user.role,
            device,
            meta,
         )
         : null;

      const accessToken = this.generateAccessToken(user);
      const refreshToken = TokenUtils.generateRefreshToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await runWrite(prisma, (tx) =>
         tx.refreshToken.create({
            data: {
               token: refreshToken,
               userId: user.id,
               userDeviceId: userDevice?.id ?? null,
               expiresAt,
               userAgent: meta?.userAgent ?? null,
               ipAddress: meta?.ipAddress ?? null,
            },
         }),
      );

      return {
         accessToken,
         refreshToken,
         ...(appType !== undefined ? { appType } : {}),
         user: {
            id: user.id,
            email: user.email,
            role: user.role,
            emailVerified: user.emailVerified,
         },
      };
   }

   /**
    * Generate access token for user
    */
   private generateAccessToken(user: User): string {
      const { JWTUtils } = require('../utils/crypto');
      return JWTUtils.generateAccessToken({
         sub: user.id,
         email: user.email,
         role: user.role,
      });
   }

   /**
    * Revoke all tokens for a user
    */
   private async revokeAllUserTokens(userId: string, tx?: TransactionClient): Promise<void> {
      const revoke = async (client: TransactionClient) => {
         await client.refreshToken.updateMany({
            where: { userId },
            data: { isRevoked: true },
         });
      };

      if (tx) {
         await revoke(tx);
         return;
      }

      await runWrite(prisma, revoke);
   }
}

export const authService = new AuthService();

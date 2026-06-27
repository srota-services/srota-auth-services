import { Request, Response } from 'express';
import { CookieOptions } from 'express-serve-static-core';
import { config } from '../config/env';
import { authService } from '../services/auth';
import { redisService } from '../services/redis';
import { otpService } from '../services/otp';
import { JWTUtils } from '../utils/crypto';
import { OtpPurpose } from '@prisma/client';
import { ClientType } from '../constants/clientType';
import {
   RegisterRequest,
   LoginRequest,
   MobileLoginRequest,
   RefreshTokenRequest,
   VerifyEmailRequest,
   ForgotPasswordRequest,
   ResetPasswordRequest,
   RevokeTokenRequest,
   GoogleOAuthRequest,
   GuestAuthRequest,
   VerifyOTPRequest,
   ResendOTPRequest,
   VerifyPasswordChangeOTPRequest,
   ChangePasswordRequest,
   VerifyEmailUpdateOTPRequest,
   UpdateEmailRequest,
   VerifyForgotPasswordOTPRequest,
} from '../types';
import {
   resolveDeviceContextForRegistrationVerify,
   validateDeviceContext,
   validateLegacyRegistrationVerifyType,
} from '../utils/deviceValidation';
import { validateRegisterRequest } from '../utils/registerValidation';
import { fileUrlService } from '../services/FileUrlService';
import { getDeviceRequestMeta, handleAuthControllerError } from '../utils/authController';
import { generateCsrfToken, getCsrfCookieOptions } from '../utils/csrf';
import { ValidationError } from '../types';

const REFRESH_TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function getRefreshTokenCookieOptions(maxAge = REFRESH_TOKEN_COOKIE_MAX_AGE): CookieOptions {
   return {
      httpOnly: true,
      secure: config.USE_SECURE_COOKIES,
      sameSite: config.USE_SECURE_COOKIES ? 'strict' : 'lax',
      path: '/',
      maxAge,
   };
}

/**
 * Authentication controller handling all auth-related endpoints
 */
export class AuthController {
   /**
    * Issue a CSRF token for browser clients (double-submit cookie pattern)
    */
   async getCsrfToken(_req: Request, res: Response): Promise<void> {
      const token = generateCsrfToken();
      res.cookie('csrfToken', token, getCsrfCookieOptions());
      res.json({ csrfToken: token });
   }

   /**
    * Register a new user
    */
   async register(req: Request, res: Response): Promise<void> {
      try {
         const registerBody = { ...req.body } as RegisterRequest;

         const profileImageFile = (req as Request & { profileImageFile?: Express.Multer.File }).profileImageFile;

         if (profileImageFile) {
            registerBody.profileImage = await fileUrlService.processUploadedImageFile(
               profileImageFile.path,
               'uploads/images/authors',
               profileImageFile.mimetype,
               'profile',
            );
         }

         const contentType = req.headers['content-type'] ?? '';
         const isMultipart = contentType.startsWith('multipart/form-data');
         const data = validateRegisterRequest(registerBody, { isMultipart });
         const result = await authService.register(data);

         res.status(201).json({
            message: 'User registered successfully. Please check your email for OTP verification.',
            user: result.user,
            otpSent: result.otpSent,
         });
      } catch (error) {
         if (error instanceof ValidationError) {
            res.status(error.statusCode).json({
               error: error.message,
               code: error.code,
               details: error.details,
            });
            return;
         }

         res.status(400).json({
            error: error instanceof Error ? error.message : 'Registration failed',
         });
      }
   }

   /**
    * Login user (browser or mobile)
    */
   async login(req: Request, res: Response): Promise<void> {
      try {
         const device = validateDeviceContext(req.body.device);
         const data: LoginRequest = { ...req.body, device };
         const result = await authService.login({ ...data, meta: getDeviceRequestMeta(req) });

         // Set refresh token as httpOnly cookie for browser clients
         if (data.clientType === ClientType.BROWSER && result.refreshToken) {
            res.cookie('refreshToken', result.refreshToken, getRefreshTokenCookieOptions());

            // Remove refresh token from response body for browser clients
            delete result.refreshToken;
         }

         res.json({
            message: 'Login successful',
            ...result,
         });
      } catch (error) {
         handleAuthControllerError(res, error, 'Login failed');
      }
   }

   /**
    * Verify registration OTP and complete user profile creation
    */
   async verifyRegistrationOTP(req: Request, res: Response): Promise<void> {
      try {
         const { email, type } = req.body as { email?: string; type?: string };

         if (!email || typeof email !== 'string') {
            res.status(400).json({ error: 'Email is required' });
            return;
         }

         const { PrismaClient } = await import('@prisma/client');
         const prisma = new PrismaClient();
         const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
         });

         if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
         }

         validateLegacyRegistrationVerifyType(type, user.role);
         const device = resolveDeviceContextForRegistrationVerify(req.body.device, user.role);
         const data: VerifyOTPRequest = { ...req.body, device };
         const result = await authService.verifyRegistrationOTP({
            ...data,
            meta: getDeviceRequestMeta(req),
         });

         res.json({
            message: 'Registration OTP verified successfully. User profile created.',
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            user: result.user,
         });
      } catch (error) {
         handleAuthControllerError(res, error, 'OTP verification failed');
      }
   }

   /**
    * Resend OTP (for registration, password change, or email update)
    */
   async resendOTP(req: Request, res: Response): Promise<void> {
      try {
         const data: ResendOTPRequest = req.body;
         const { email } = data;

         // Find user by email
         const { PrismaClient } = await import('@prisma/client');
         const prisma = new PrismaClient();
         const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
         });

         if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
         }

         // Purpose must be specified (REGISTRATION, EMAIL_UPDATE, PASSWORD_UPDATE, or DEVICE_REMOVAL)
         const purpose = (req.body as any).purpose;
         if (!purpose || purpose === OtpPurpose.LOGIN) {
            res.status(400).json({
               error: 'Purpose is required and must be REGISTRATION, EMAIL_UPDATE, PASSWORD_UPDATE, or DEVICE_REMOVAL',
            });
            return;
         }

         // Check if can resend
         const canResend = await otpService.canResendOTP(user.id, purpose);
         if (!canResend) {
            res.status(429).json({
               error: 'Please wait 30 seconds before requesting a new OTP',
            });
            return;
         }

         // Create new OTP
         await otpService.createOTP(user.id, purpose, user.email);

         res.json({
            message: 'OTP resent successfully',
         });
      } catch (error) {
         res.status(400).json({
            error: error instanceof Error ? error.message : 'Failed to resend OTP',
         });
      }
   }

   /**
    * Mobile login with PKCE
    */
   async mobileLogin(req: Request, res: Response): Promise<void> {
      try {
         const device = validateDeviceContext(req.body.device);
         const data: MobileLoginRequest = { ...req.body, device };
         const result = await authService.mobileLogin({ ...data, meta: getDeviceRequestMeta(req) });

         res.json({
            message: 'Mobile login successful',
            ...result,
         });
      } catch (error) {
         handleAuthControllerError(res, error, 'Mobile login failed');
      }
   }

   /**
    * Google OAuth authentication
    */
   async googleOAuth(req: Request, res: Response): Promise<void> {
      try {
         const device = validateDeviceContext(req.body.device);
         const data: GoogleOAuthRequest = { ...req.body, device };
         const result = await authService.googleOAuth({ ...data, meta: getDeviceRequestMeta(req) });

         // Set refresh token as httpOnly cookie for browser clients
         if (data.clientType === ClientType.BROWSER && result.refreshToken) {
            res.cookie('refreshToken', result.refreshToken, getRefreshTokenCookieOptions());

            // Remove refresh token from response body for browser clients
            delete result.refreshToken;
         }

         res.json({
            message: 'Google OAuth authentication successful',
            ...result,
         });
      } catch (error) {
         handleAuthControllerError(res, error, 'Google OAuth authentication failed');
      }
   }

   /**
    * Create or resume an anonymous guest session
    */
   async createGuestSession(req: Request, res: Response): Promise<void> {
      try {
         const device = validateDeviceContext(req.body.device);
         const data: GuestAuthRequest = { ...req.body, device };
         const result = await authService.createOrResumeGuestSession({
            ...data,
            meta: getDeviceRequestMeta(req),
         });

         if (data.clientType === ClientType.BROWSER && result.refreshToken) {
            res.cookie('refreshToken', result.refreshToken, getRefreshTokenCookieOptions());
            delete result.refreshToken;
         }

         res.json({
            message: 'Guest session created successfully',
            ...result,
         });
      } catch (error) {
         handleAuthControllerError(res, error, 'Guest session creation failed');
      }
   }

   /**
    * Refresh access token
    */
   async refreshToken(req: Request, res: Response): Promise<void> {
      try {
         let refreshToken: string;

         // Check for refresh token in cookie (browser) or body (mobile)
         if (req.cookies['refreshToken']) {
            refreshToken = req.cookies['refreshToken'];
         } else {
            const data: RefreshTokenRequest = req.body;
            refreshToken = data.refreshToken;
         }

         if (!refreshToken) {
            res.status(401).json({ error: 'Refresh token required' });
            return;
         }

         const result = await authService.refreshToken({ refreshToken });

         // Update refresh token cookie for browser clients
         if (req.cookies['refreshToken'] && result.refreshToken) {
            res.cookie('refreshToken', result.refreshToken, getRefreshTokenCookieOptions());
         }

         res.json({
            message: 'Token refreshed successfully',
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            user: result.user,
         });
      } catch (error) {
         handleAuthControllerError(res, error, 'Token refresh failed');
      }
   }

   /**
    * Logout user
    */
   async logout(req: Request, res: Response): Promise<void> {
      try {
         let refreshToken: string;

         // Check for refresh token in cookie (browser) or body (mobile)
         if (req.cookies['refreshToken']) {
            refreshToken = req.cookies['refreshToken'];
         } else {
            const data: RefreshTokenRequest = req.body;
            refreshToken = data.refreshToken;
         }

         if (refreshToken) {
            await authService.logout(refreshToken);
         }

         // Clear refresh token cookie (options must match set-cookie for secure cookies)
         res.clearCookie('refreshToken', {
            path: '/',
            secure: config.USE_SECURE_COOKIES,
            sameSite: config.USE_SECURE_COOKIES ? 'strict' : 'lax',
         });

         res.json({ message: 'Logout successful' });
      } catch (error) {
         res.status(400).json({
            error: error instanceof Error ? error.message : 'Logout failed',
         });
      }
   }

   /**
    * Verify email with token
    */
   async verifyEmail(req: Request, res: Response): Promise<void> {
      try {
         const data: VerifyEmailRequest = req.body;
         await authService.verifyEmail(data);

         res.json({ message: 'Email verified successfully' });
      } catch (error) {
         res.status(400).json({
            error: error instanceof Error ? error.message : 'Email verification failed',
         });
      }
   }

   /**
    * Request password reset OTP (POST endpoint)
    */
   async forgotPassword(req: Request, res: Response): Promise<void> {
      try {
         const data: ForgotPasswordRequest = req.body;
         await authService.forgotPassword(data);

         res.json({
            message: 'If the email exists, an OTP has been sent to your email'
         });
      } catch (error) {
         res.status(400).json({
            error: error instanceof Error ? error.message : 'Password reset request failed',
         });
      }
   }

   /**
    * Verify forgot password OTP
    */
   async verifyForgotPasswordOTP(req: Request, res: Response): Promise<void> {
      try {
         const data: VerifyForgotPasswordOTPRequest = req.body;
         await authService.verifyForgotPasswordOTP(data);

         res.json({ message: 'OTP verified successfully' });
      } catch (error) {
         res.status(400).json({
            error: error instanceof Error ? error.message : 'OTP verification failed',
         });
      }
   }

   /**
    * Reset password (no OTP check required)
    */
   async resetPassword(req: Request, res: Response): Promise<void> {
      try {
         const data: ResetPasswordRequest = req.body;
         await authService.resetPassword(data);

         res.json({ message: 'Password reset successfully' });
      } catch (error) {
         res.status(400).json({
            error: error instanceof Error ? error.message : 'Password reset failed',
         });
      }
   }

   /**
    * Request OTP for password change (GET endpoint)
    */
   async requestPasswordChangeOTP(req: Request, res: Response): Promise<void> {
      try {
         const userId = (req as any).user.id;

         await authService.requestPasswordChangeOTP(userId);

         res.json({ message: 'OTP sent to your email for password change' });
      } catch (error) {
         res.status(400).json({
            error: error instanceof Error ? error.message : 'Failed to send OTP',
         });
      }
   }

   /**
    * Verify password change OTP
    */
   async verifyPasswordChangeOTP(req: Request, res: Response): Promise<void> {
      try {
         const data: VerifyPasswordChangeOTPRequest = req.body;
         const userId = (req as any).user.id;

         await authService.verifyPasswordChangeOTP(userId, data);

         res.json({ message: 'OTP verified successfully' });
      } catch (error) {
         res.status(400).json({
            error: error instanceof Error ? error.message : 'OTP verification failed',
         });
      }
   }

   /**
    * Change password (authenticated user) - no OTP check required
    */
   async changePassword(req: Request, res: Response): Promise<void> {
      try {
         const data: ChangePasswordRequest = req.body;
         const userId = (req as any).user.id;

         await authService.changePassword(userId, data);

         res.json({ message: 'Password changed successfully' });
      } catch (error) {
         res.status(400).json({
            error: error instanceof Error ? error.message : 'Password change failed',
         });
      }
   }

   /**
    * Request OTP for email update (GET endpoint)
    */
   async requestEmailUpdateOTP(req: Request, res: Response): Promise<void> {
      try {
         const email = req.query['email'] as string;
         if (!email) {
            res.status(400).json({ error: 'Current email is required' });
            return;
         }
         const userId = (req as any).user.id;

         await authService.requestEmailUpdateOTP(userId, { email });

         res.json({ message: 'OTP sent to current email address for verification' });
      } catch (error) {
         res.status(400).json({
            error: error instanceof Error ? error.message : 'Failed to send OTP',
         });
      }
   }

   /**
    * Verify email update OTP
    */
   async verifyEmailUpdateOTP(req: Request, res: Response): Promise<void> {
      try {
         const data: VerifyEmailUpdateOTPRequest = req.body;
         const userId = (req as any).user.id;

         await authService.verifyEmailUpdateOTP(userId, data);

         res.json({ message: 'OTP verified successfully' });
      } catch (error) {
         res.status(400).json({
            error: error instanceof Error ? error.message : 'OTP verification failed',
         });
      }
   }

   /**
    * Update email (no OTP check required)
    */
   async updateEmail(req: Request, res: Response): Promise<void> {
      try {
         const data: UpdateEmailRequest = req.body;
         const userId = (req as any).user.id;

         await authService.updateEmail(userId, data);

         res.json({ message: 'Email updated successfully. Please verify your new email.' });
      } catch (error) {
         res.status(400).json({
            error: error instanceof Error ? error.message : 'Email update failed',
         });
      }
   }

   /**
    * Get current user info
    */
   async getMe(req: Request, res: Response): Promise<void> {
      try {
         const userId = (req as any).user.id;
         const user = await authService.getUserById(userId);

         if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
         }

         res.json({ user });
      } catch (error) {
         res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to get user info',
         });
      }
   }

   /**
    * Get user's role by userId
    */
   async getRole(req: Request, res: Response): Promise<void> {
      try {
         const { userId } = req.params;

         if (!userId) {
            res.status(400).json({ error: 'User ID is required' });
            return;
         }

         const user = await authService.getUserById(userId);

         if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
         }

         res.json({ role: user.role, email: user.email });
      } catch (error) {
         res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to get user role',
         });
      }
   }

   /**
    * Revoke token by JTI (admin only)
    */
   async revokeToken(req: Request, res: Response): Promise<void> {
      try {
         const data: RevokeTokenRequest = req.body;
         const { jti } = data;

         // Decode token to get user ID
         const token = (req as any).token;
         const payload = JWTUtils.decodeToken(token);

         if (!payload) {
            res.status(400).json({ error: 'Invalid token' });
            return;
         }

         await redisService.revokeToken(jti, payload.sub, 'Admin revocation');

         res.json({ message: 'Token revoked successfully' });
      } catch (error) {
         res.status(400).json({
            error: error instanceof Error ? error.message : 'Token revocation failed',
         });
      }
   }

   /**
    * Emergency revoke all user tokens (admin only)
    */
   async emergencyRevoke(req: Request, res: Response): Promise<void> {
      try {
         const { userId } = req.body;

         if (!userId) {
            res.status(400).json({ error: 'User ID required' });
            return;
         }

         await redisService.revokeAllUserTokens(userId, 'Emergency revocation by admin');

         res.json({ message: 'All user tokens revoked successfully' });
      } catch (error) {
         res.status(400).json({
            error: error instanceof Error ? error.message : 'Emergency revocation failed',
         });
      }
   }
}

export const authController = new AuthController();

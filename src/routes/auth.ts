import { Router } from 'express';
import { authController } from '../controllers/auth';
import { jwksController } from '../controllers/jwks';
import userDeviceRoutes from './userDevice';
import {
   authenticateToken,
   blockGuestMutations,
   requireGlobalAdmin,
   loginRateLimit,
   passwordResetRateLimit,
   registerRateLimit,
   guestRateLimit,
   generalRateLimit,
   validateCsrf,
} from '../middleware';
import { handleAuthorRegistrationUpload } from '../middleware/RegisterUploadMiddleware';
import { validateUserProfileUpdate } from '../middleware/profileValidation';
import { userProfileController } from '../controllers/userProfile';
import { handleOptionalUserAvatarUpload } from '../middleware/ProfileUploadMiddleware';

const router = Router();

// Apply general rate limiting to all routes
router.use(generalRateLimit);

// Public routes
router.get('/csrf-token', authController.getCsrfToken.bind(authController));
router.post(
   '/register',
   registerRateLimit,
   handleAuthorRegistrationUpload,
   authController.register.bind(authController)
);
router.post('/login', loginRateLimit, validateCsrf, authController.login.bind(authController));
router.post('/verify-registration-otp', loginRateLimit, authController.verifyRegistrationOTP.bind(authController));
router.post('/resend-otp', loginRateLimit, authController.resendOTP.bind(authController));
router.post('/login/mobile', loginRateLimit, authController.mobileLogin.bind(authController));
router.post('/google', loginRateLimit, validateCsrf, authController.googleOAuth.bind(authController));
router.post('/guest', guestRateLimit, validateCsrf, authController.createGuestSession.bind(authController));
router.post('/refresh', validateCsrf, authController.refreshToken.bind(authController));
router.post('/logout', validateCsrf, authController.logout.bind(authController));
router.post('/verify-email', authController.verifyEmail.bind(authController));
router.post('/forgot-password', passwordResetRateLimit, authController.forgotPassword.bind(authController));
router.post('/verify-forgot-password-otp', passwordResetRateLimit, authController.verifyForgotPasswordOTP.bind(authController));
router.post('/reset-password', authController.resetPassword.bind(authController));

// JWKS endpoint (public, no authentication required)
router.get('/.well-known/jwks.json', jwksController.getJWKS.bind(jwksController));

// Device management (authenticated)
router.use('/devices', userDeviceRoutes);

// Protected routes (require authentication; guests blocked from mutations except location-only profile update)
const protectedRouter = Router();
protectedRouter.use(authenticateToken);
protectedRouter.use(blockGuestMutations());

protectedRouter.get('/me', authController.getMe.bind(authController));
protectedRouter.get('/user/profile', userProfileController.getProfile.bind(userProfileController));
protectedRouter.put(
   '/user/profile',
   handleOptionalUserAvatarUpload,
   validateUserProfileUpdate,
   userProfileController.updateProfile.bind(userProfileController),
);
protectedRouter.get('/users/:userId/profile', userProfileController.getPublicProfile.bind(userProfileController));
protectedRouter.get('/user/:userId', authController.getRole.bind(authController));
protectedRouter.get('/request-password-change-otp', authController.requestPasswordChangeOTP.bind(authController));
protectedRouter.post('/verify-password-change-otp', authController.verifyPasswordChangeOTP.bind(authController));
protectedRouter.post('/change-password', authController.changePassword.bind(authController));
protectedRouter.get('/request-email-update-otp', authController.requestEmailUpdateOTP.bind(authController));
protectedRouter.post('/verify-email-update-otp', authController.verifyEmailUpdateOTP.bind(authController));
protectedRouter.post('/update-email', authController.updateEmail.bind(authController));

// Admin only routes
protectedRouter.post('/revoke', requireGlobalAdmin, authController.revokeToken.bind(authController));
protectedRouter.post('/emergency-revoke', requireGlobalAdmin, authController.emergencyRevoke.bind(authController));

router.use(protectedRouter);

export default router;

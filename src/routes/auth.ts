import { Router } from 'express';
import { authController } from '../controllers/auth';
import { jwksController } from '../controllers/jwks';
import userDeviceRoutes from './userDevice';
import {
   authenticateToken,
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

// Protected routes (require authentication)
router.get('/me', authenticateToken, authController.getMe.bind(authController));
router.get('/user/profile', authenticateToken, userProfileController.getProfile.bind(userProfileController));
router.put('/user/profile', authenticateToken, validateUserProfileUpdate, userProfileController.updateProfile.bind(userProfileController));
router.get('/user/:userId', authenticateToken, authController.getRole.bind(authController));
router.get('/request-password-change-otp', authenticateToken, authController.requestPasswordChangeOTP.bind(authController));
router.post('/verify-password-change-otp', authenticateToken, authController.verifyPasswordChangeOTP.bind(authController));
router.post('/change-password', authenticateToken, authController.changePassword.bind(authController));
router.get('/request-email-update-otp', authenticateToken, authController.requestEmailUpdateOTP.bind(authController));
router.post('/verify-email-update-otp', authenticateToken, authController.verifyEmailUpdateOTP.bind(authController));
router.post('/update-email', authenticateToken, authController.updateEmail.bind(authController));

// Admin only routes
router.post('/revoke', authenticateToken, requireGlobalAdmin, authController.revokeToken.bind(authController));
router.post('/emergency-revoke', authenticateToken, requireGlobalAdmin, authController.emergencyRevoke.bind(authController));

export default router;

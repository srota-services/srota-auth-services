import { User, Role, OtpPurpose, EmailType, Gender } from '@prisma/client';
import { ClientTypeValue } from '../constants/clientType';

// JWT Payload interface
export interface JWTPayload {
   sub: string; // User ID
   email: string;
   role: Role;
   iat: number;
   exp: number;
   jti: string; // JWT ID for revocation
   iss: string; // Issuer
}

// JWT Header interface
export interface JWTHeader {
   alg: 'RS256';
   typ: 'JWT';
   kid: string; // Key ID
}

// JWKS Key interface
export interface JWK {
   kid: string;
   kty: 'RSA';
   use: 'sig';
   alg: 'RS256';
   n: string; // Modulus
   e: string; // Exponent
}

export interface JWKS {
   keys: JWK[];
}

// Request/Response interfaces
export interface RegisterRequest {
   email: string;
   password: string;
   confirmPassword?: string;
   role?: Role;
   firstName?: string;
   lastName?: string;
   address?: string;
   contact?: string;
   profileImage?: string;
   avatar?: string;
}

export interface PendingUserRegistration {
   address: string;
   contact: string;
   avatar?: string;
}

export interface PendingAuthorRegistration {
   firstName: string;
   lastName: string;
   address: string;
   contact?: string;
   profileImage?: string;
}

export interface UserCreatedEvent {
   userId: string;
   avatar?: string;
}

export interface AuthorCreatedEvent {
   authorId: string;
   avatar?: string;
}

export interface DeviceContext {
   deviceId: string;
   deviceName?: string;
   platform?: string;
}

export interface DeviceRequestMeta {
   userAgent?: string;
   ipAddress?: string;
}

export interface LoginRequest {
   email: string;
   password: string;
   clientType?: ClientTypeValue;
   app?: string;
   slug?: string;
   device: DeviceContext;
}

export interface MobileLoginRequest extends LoginRequest {
   codeChallenge: string;
   codeChallengeMethod: 'S256';
}

export interface RefreshTokenRequest {
   refreshToken: string;
}

export interface VerifyEmailRequest {
   token: string;
}

export interface ForgotPasswordRequest {
   email: string;
}

export interface RevokeTokenRequest {
   jti: string;
}

export interface GoogleOAuthRequest {
   token: string;
   clientType?: ClientTypeValue;
   app?: string;
   device: DeviceContext;
}

export interface GuestAuthRequest {
   clientType?: ClientTypeValue;
   device: DeviceContext;
}

// Response interfaces
export interface AuthResponse {
   accessToken: string;
   refreshToken?: string; // Only for mobile clients
   appType?: 'organization' | 'author';
   user: {
      id: string;
      email: string;
      role: Role;
      emailVerified: boolean;
   };
}

export interface UserResponse {
   id: string;
   email: string;
   role: Role;
   emailVerified: boolean;
   firstName?: string;
   lastName?: string;
   address?: string;
   contact?: string;
   gender?: Gender;
   location?: string;
   age?: number;
   username?: string;
   avatar?: string;
   preferences?: Record<string, unknown>;
   imageAssets?: Record<string, string>;
   createdAt: Date;
   updatedAt: Date;
}

export interface PublicUserProfileResponse {
   userId: string;
   username: string;
   avatar?: string;
   imageAssets?: Record<string, string>;
}

export interface LocationCoordinatesInput {
   latitude: string | number;
   longitude: string | number;
}

export interface UpdateUserProfileRequest {
   firstName?: string;
   lastName?: string;
   address?: string | null;
   contact?: string | null;
   gender?: Gender | null;
   location?: LocationCoordinatesInput | null;
   age?: number | null;
   username?: string;
   avatar?: string | null;
   preferences?: Record<string, unknown> | null;
}

// Error classes
export class AuthError extends Error {
   statusCode: number;
   code: string;
   details?: Record<string, unknown> | undefined;

   constructor(
      message: string,
      statusCode: number = 401,
      code: string = 'AUTH_ERROR',
      details?: Record<string, unknown> | undefined,
   ) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
      if (details !== undefined) {
         this.details = details;
      }
      this.name = 'AuthError';
   }
}

export class ValidationError extends Error {
   statusCode: number;
   code: string;
   details: Record<string, string[]>;

   constructor(message: string, details: Record<string, string[]> = {}, statusCode: number = 400, code: string = 'VALIDATION_ERROR') {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
      this.details = details;
      this.name = 'ValidationError';
   }
}

// Middleware interfaces
export interface AuthenticatedRequest {
   user?: User;
   token?: string;
}

// PKCE interfaces
export interface PKCESession {
   codeChallenge: string;
   codeChallengeMethod: string;
   userId?: string;
   expiresAt: Date;
}

// Token rotation interfaces
export interface TokenFamily {
   userId: string;
   tokens: string[];
   createdAt: Date;
}

// Redis interfaces
export interface RevokedToken {
   jti: string;
   userId: string;
   revokedAt: Date;
   reason?: string;
}

// Email interfaces
export interface EmailTemplate {
   to: string;
   subject: string;
   html: string;
   text: string;
}

export interface EmailVerificationData {
   email: string;
   token: string;
   expiresAt: Date;
}

export interface PasswordResetData {
   email: string;
   token: string;
   expiresAt: Date;
}

// OTP interfaces
export { OtpPurpose, EmailType };

export interface VerifyOTPRequest {
   email: string;
   otp: string;
   firstName?: string;
   lastName?: string;
   type?: string;
   device?: DeviceContext;
}

export interface ResendOTPRequest {
   email: string;
}

export interface VerifyPasswordChangeOTPRequest {
   otp: string;
}

export interface VerifyEmailUpdateOTPRequest {
   otp: string;
}

export interface ChangePasswordRequest {
   currentPassword: string;
   newPassword: string;
}

export interface UpdateEmailRequest {
   newEmail: string;
}

export interface VerifyForgotPasswordOTPRequest {
   email: string;
   otp: string;
}

export interface ResetPasswordRequest {
   email: string;
   newPassword: string;
}

export interface RequestDeviceRemovalOtpRequest {
   email: string;
   deviceId: string;
}

export interface RemoveDeviceWithOtpRequest {
   email: string;
   otp: string;
}

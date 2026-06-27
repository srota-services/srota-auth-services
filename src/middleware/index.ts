import { Request, Response, NextFunction } from 'express';
import { appLogger } from '../utils/logger';
import rateLimit from 'express-rate-limit';
import { JWTUtils } from '../utils/crypto';
import { redisService } from '../services/redis';
import { config } from '../config/env';
import { AuthError, ValidationError } from '../types';
import { SubscriptionError } from '../types/subscription';
import { DomainError } from '../types/domain';
import { AuthRoleGroups } from '../constants/authRoles';

export { validateCsrf, requiresCsrfProtection } from './csrf';

/**
 * Authentication middleware
 */
export const authenticateToken = async (
   req: Request,
   res: Response,
   next: NextFunction
): Promise<void> => {
   try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

      if (!token) {
         res.status(401).json({ error: 'Access token required' });
         return;
      }

      // Verify token
      const payload = JWTUtils.verifyAccessToken(token);

      // Check if token is revoked
      const isRevoked = await redisService.isTokenRevoked(payload.jti);
      if (isRevoked) {
         res.status(401).json({ error: 'Token has been revoked' });
         return;
      }

      // Check for emergency revoke
      const hasEmergencyRevoke = await redisService.hasEmergencyRevoke(payload.sub);
      if (hasEmergencyRevoke) {
         res.status(401).json({ error: 'Account access revoked' });
         return;
      }

      // Attach user info to request
      (req as any).user = {
         id: payload.sub,
         email: payload.email,
         role: payload.role,
      };
      (req as any).token = token;

      next();
   } catch (_error) {
      res.status(401).json({ error: 'Invalid or expired token' });
   }
};

/**
 * Role-based authorization middleware
 */
export const requireRole = (roles: string[]) => {
   return (req: Request, res: Response, next: NextFunction): void => {
      const authReq = req as any;
      if (!authReq.user) {
         res.status(401).json({ error: 'Authentication required' });
         return;
      }

      if (!roles.includes(authReq.user.role)) {
         res.status(403).json({ error: 'Insufficient permissions' });
         return;
      }

      next();
   };
};

/**
 * Global admin only middleware
 */
export const requireGlobalAdmin = requireRole([...AuthRoleGroups.GLOBAL_ADMIN_ONLY]);

/** @deprecated Use requireGlobalAdmin */
export const requireAdmin = requireGlobalAdmin;

/**
 * Rate limiting middleware for login attempts
 */
export const loginRateLimit = rateLimit({
   windowMs: 15 * 60 * 1000, // 15 minutes
   max: 5000, // 5 attempts per window
   message: {
      error: 'Too many login attempts, please try again later',
   },
   standardHeaders: true,
   legacyHeaders: false,
   skipSuccessfulRequests: true,
});

/**
 * Rate limiting middleware for password reset
 */
export const passwordResetRateLimit = rateLimit({
   windowMs: 60 * 60 * 1000, // 1 hour
   max: 3, // 3 attempts per hour
   message: {
      error: 'Too many password reset attempts, please try again later',
   },
   standardHeaders: true,
   legacyHeaders: false,
});

/**
 * Rate limiting middleware for registration
 */
export const registerRateLimit = rateLimit({
   windowMs: 60 * 60 * 1000, // 1 hour
   max: 10, // 10 registrations per hour
   message: {
      error: 'Too many registration attempts, please try again later',
   },
   standardHeaders: true,
   legacyHeaders: false,
});

/**
 * General rate limiting middleware
 */
export const generalRateLimit = rateLimit({
   windowMs: config.RATE_LIMIT_WINDOW_MS,
   max: config.RATE_LIMIT_MAX_REQUESTS,
   message: {
      error: 'Too many requests, please try again later',
   },
   standardHeaders: true,
   legacyHeaders: false,
});

/**
 * Error handling middleware
 */
export const errorHandler = (
   error: Error,
   _req: Request,
   res: Response,
   _next: NextFunction
): void => {
   appLogger.error({ err: error }, 'Request error');

   // Handle specific error types
   if (error instanceof ValidationError) {
      res.status(error.statusCode).json({
         error: error.message,
         code: error.code,
         details: error.details,
      });
      return;
   }

   if (error instanceof AuthError) {
      res.status(error.statusCode).json({
         error: error.message,
         code: error.code,
      });
      return;
   }

   if (error instanceof SubscriptionError) {
      res.status(error.statusCode).json({
         error: error.message,
         code: error.code,
      });
      return;
   }

   if (error instanceof DomainError) {
      res.status(error.statusCode).json({
         error: error.message,
         code: error.code,
      });
      return;
   }

   // Handle Prisma errors
   if (error.name === 'PrismaClientKnownRequestError') {
      const prismaError = error as any;
      if (prismaError.code === 'P2002') {
         res.status(409).json({
            error: 'Resource already exists',
            code: 'DUPLICATE_RESOURCE',
         });
         return;
      }
   }

   // Handle JWT errors
   if (error.name === 'JsonWebTokenError') {
      res.status(401).json({
         error: 'Invalid token',
         code: 'INVALID_TOKEN',
      });
      return;
   }

   if (error.name === 'TokenExpiredError') {
      res.status(401).json({
         error: 'Token expired',
         code: 'TOKEN_EXPIRED',
      });
      return;
   }

   // Default error response
   res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
   });
};

/**
 * Not found middleware
 */
export const notFound = (_req: Request, res: Response): void => {
   res.status(404).json({
      error: 'Route not found',
      code: 'NOT_FOUND',
   });
};

/**
 * Request logging middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
   const start = Date.now();

   res.on('finish', () => {
      const duration = Date.now() - start;
      appLogger.info(
         { method: req.method, path: req.path, statusCode: res.statusCode, durationMs: duration },
         'HTTP request'
      );
   });

   next();
};

/**
 * CORS middleware configuration — allow any origin (reflects request origin for credentials)
 */
export const corsOptions = {
   origin: true,
   credentials: true,
   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
   allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
};

/**
 * Security headers middleware
 */
export const securityHeaders = (_req: Request, res: Response, next: NextFunction): void => {
   // Prevent clickjacking
   res.setHeader('X-Frame-Options', 'DENY');

   // Prevent MIME type sniffing
   res.setHeader('X-Content-Type-Options', 'nosniff');

   // Enable XSS protection
   res.setHeader('X-XSS-Protection', '1; mode=block');

   // Strict Transport Security (only in production)
   if (config.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
   }

   next();
};

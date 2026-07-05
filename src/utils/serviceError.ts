import { Prisma } from '@prisma/client';
import { errorLogger } from './logger';
import { DomainError } from '../types/domain';
import { SubscriptionError } from '../types/subscription';
import { AuthError, ValidationError } from '../types';

export interface ServiceErrorContext extends Record<string, unknown> {
   operation?: string;
}

const GENERIC_INTERNAL_MESSAGE = 'An unexpected error occurred';

function isPrismaKnownError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
   return error instanceof Prisma.PrismaClientKnownRequestError;
}

function isPrismaValidationError(error: unknown): error is Prisma.PrismaClientValidationError {
   return error instanceof Prisma.PrismaClientValidationError;
}

export function logServiceError(error: unknown, context: ServiceErrorContext = {}): void {
   const base = { ...context, err: error };

   if (isPrismaKnownError(error)) {
      errorLogger.error(
         {
            ...base,
            prismaCode: error.code,
            prismaMeta: error.meta,
            clientVersion: error.clientVersion,
         },
         'Database error',
      );
      return;
   }

   if (isPrismaValidationError(error)) {
      errorLogger.error(
         {
            ...base,
            prismaClientVersion: error.clientVersion,
         },
         'Database validation error',
      );
      return;
   }

   errorLogger.error(base, 'Unhandled service error');
}

function mapPrismaError(error: Prisma.PrismaClientKnownRequestError): DomainError | SubscriptionError {
   switch (error.code) {
      case 'P2002':
         return DomainError.conflict('Resource already exists');
      case 'P2025':
         return DomainError.notFound('Resource not found');
      default:
         return DomainError.internal(GENERIC_INTERNAL_MESSAGE);
   }
}

export function rethrowServiceError(
   error: unknown,
   context: ServiceErrorContext = {},
   internalMessage: string = GENERIC_INTERNAL_MESSAGE,
): never {
   if (
      error instanceof DomainError ||
      error instanceof SubscriptionError ||
      error instanceof AuthError ||
      error instanceof ValidationError
   ) {
      throw error;
   }

   if (isPrismaKnownError(error)) {
      logServiceError(error, context);
      throw mapPrismaError(error);
   }

   logServiceError(error, context);
   throw DomainError.internal(internalMessage);
}

import { Prisma } from '@prisma/client';
import { DomainError } from '../../src/types/domain';
import { SubscriptionError } from '../../src/types/subscription';
import { rethrowServiceError, logServiceError } from '../../src/utils/serviceError';

jest.mock('../../src/utils/logger', () => ({
   errorLogger: {
      error: jest.fn(),
   },
}));

import { errorLogger } from '../../src/utils/logger';

describe('rethrowServiceError', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('rethrows typed DomainError unchanged', () => {
      const err = DomainError.notFound('missing');
      expect(() => rethrowServiceError(err, { operation: 'test' })).toThrow(err);
      expect(errorLogger.error).not.toHaveBeenCalled();
   });

   it('rethrows SubscriptionError unchanged', () => {
      const err = SubscriptionError.conflict('dup');
      expect(() => rethrowServiceError(err, { operation: 'test' })).toThrow(err);
   });

   it('maps Prisma P2002 to conflict and logs to errorLogger', () => {
      const prismaErr = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
         code: 'P2002',
         clientVersion: '5.0.0',
         meta: { target: ['email'] },
      });

      expect(() => rethrowServiceError(prismaErr, { operation: 'createUser' })).toThrow(DomainError);
      try {
         rethrowServiceError(prismaErr, { operation: 'createUser' });
      } catch (e) {
         expect(e).toBeInstanceOf(DomainError);
         expect((e as DomainError).statusCode).toBe(409);
      }

      expect(errorLogger.error).toHaveBeenCalledWith(
         expect.objectContaining({
            operation: 'createUser',
            prismaCode: 'P2002',
            err: prismaErr,
         }),
         'Database error',
      );
   });

   it('maps unknown errors to internal DomainError and logs full error', () => {
      const err = new Error('boom');
      expect(() => rethrowServiceError(err, { operation: 'fail' }, 'custom internal')).toThrow(
         DomainError,
      );
      try {
         rethrowServiceError(err, { operation: 'fail' }, 'custom internal');
      } catch (e) {
         expect((e as DomainError).message).toBe('custom internal');
         expect((e as DomainError).statusCode).toBe(500);
      }
      expect(errorLogger.error).toHaveBeenCalledWith(
         expect.objectContaining({ operation: 'fail', err }),
         'Unhandled service error',
      );
   });
});

describe('logServiceError', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('logs Prisma validation errors with clientVersion', () => {
      const err = new Prisma.PrismaClientValidationError('Invalid data', { clientVersion: '5.0.0' });
      logServiceError(err, { operation: 'badInput' });
      expect(errorLogger.error).toHaveBeenCalledWith(
         expect.objectContaining({ operation: 'badInput', err }),
         'Database validation error',
      );
   });
});

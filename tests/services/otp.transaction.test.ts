jest.mock('../../src/utils/crypto', () => ({
   PasswordUtils: {
      hashPassword: jest.fn().mockResolvedValue('hashed-otp'),
   },
}));

jest.mock('../../src/services/email', () => ({
   emailService: {
      sendOTPEmail: jest.fn().mockResolvedValue(undefined),
   },
}));

jest.mock('../../src/utils/logger', () => ({
   emailLogger: { info: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

const mockFindFirst = jest.fn();
const mockUpdate = jest.fn();
const mockCreate = jest.fn();
const mockTransaction = jest.fn();

jest.mock('@prisma/client', () => {
   const actual = jest.requireActual('@prisma/client');
   return {
      ...actual,
      PrismaClient: jest.fn().mockImplementation(() => ({
         otpToken: {
            findFirst: mockFindFirst,
            update: mockUpdate,
            create: mockCreate,
         },
         $transaction: mockTransaction,
      })),
   };
});

import { OtpPurpose } from '@prisma/client';
import { OTPService } from '../../src/services/otp';

describe('OTPService createOTP transaction', () => {
   let service: OTPService;

   beforeEach(() => {
      jest.clearAllMocks();
      service = new OTPService();
      mockFindFirst.mockResolvedValue(null);
      mockCreate.mockResolvedValue({ id: 'otp-1' });
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
         fn({
            otpToken: {
               update: mockUpdate,
               create: mockCreate,
            },
         }),
      );
   });

   it('invalidates existing OTP and creates new one in a single transaction', async () => {
      const existing = {
         id: 'old-otp',
         createdAt: new Date(Date.now() - 60_000),
      };
      mockFindFirst.mockResolvedValue(existing);
      mockUpdate.mockResolvedValue(existing);
      mockCreate.mockResolvedValue({ id: 'new-otp' });

      await service.createOTP('user-1', OtpPurpose.REGISTRATION, 'user@test.com');

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledWith({
         where: { id: 'old-otp' },
         data: { invalidatedAt: expect.any(Date) },
      });
      expect(mockCreate).toHaveBeenCalledWith({
         data: expect.objectContaining({
            userId: 'user-1',
            purpose: OtpPurpose.REGISTRATION,
            codeHash: 'hashed-otp',
         }),
      });
   });
});

jest.mock('../../src/utils/crypto', () => ({
   PasswordUtils: {
      hashPassword: jest.fn(),
      verifyPassword: jest.fn(),
   },
   TokenUtils: {
      generateRefreshToken: jest.fn().mockReturnValue('new-refresh-token'),
      generateToken: jest.fn(),
   },
   JWTUtils: {
      generateAccessToken: jest.fn().mockReturnValue('new-access-token'),
   },
}));

jest.mock('../../src/services/redis', () => ({
   redisService: {},
}));

jest.mock('../../src/services/rabbitmq', () => ({
   rabbitmqService: {},
}));

jest.mock('../../src/services/google-oauth', () => ({
   googleOAuthService: {},
}));

jest.mock('../../src/services/otp', () => ({
   otpService: {},
}));

jest.mock('../../src/services/userDevice', () => ({
   userDeviceService: {
      assertDeviceExistsForRefresh: jest.fn().mockResolvedValue(undefined),
      resolveDeviceForAuth: jest.fn(),
   },
}));

jest.mock('../../src/utils/logger', () => ({
   appLogger: { error: jest.fn(), warn: jest.fn() },
   errorLogger: { error: jest.fn() },
}));

const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
const mockCreate = jest.fn();
const mockUpdateMany = jest.fn();
const mockTransaction = jest.fn();

jest.mock('@prisma/client', () => {
   const actual = jest.requireActual('@prisma/client');
   return {
      ...actual,
      PrismaClient: jest.fn().mockImplementation(() => ({
         refreshToken: {
            findUnique: mockFindUnique,
            update: mockUpdate,
            create: mockCreate,
            updateMany: mockUpdateMany,
         },
         $transaction: mockTransaction,
      })),
   };
});

import { AuthService } from '../../src/services/auth';

describe('AuthService refreshToken rotation', () => {
   let authService: AuthService;

   beforeEach(() => {
      jest.clearAllMocks();
      authService = new AuthService();
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
         fn({
            refreshToken: {
               update: mockUpdate,
               create: mockCreate,
            },
         }),
      );
   });

   it('marks old refresh token replaced and creates new token atomically', async () => {
      const user = {
         id: 'user-1',
         email: 'user@test.com',
         role: 'LISTENER',
         emailVerified: true,
      };
      mockFindUnique.mockResolvedValue({
         id: 'token-row-1',
         token: 'old-refresh',
         userId: user.id,
         userDeviceId: 'device-1',
         isRevoked: false,
         replacedBy: null,
         expiresAt: new Date(Date.now() + 86_400_000),
         user,
      });
      mockUpdate.mockResolvedValue({});
      mockCreate.mockResolvedValue({});

      const result = await authService.refreshToken({ refreshToken: 'old-refresh' });

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledWith({
         where: { id: 'token-row-1' },
         data: { replacedBy: 'new-refresh-token' },
      });
      expect(mockCreate).toHaveBeenCalledWith({
         data: expect.objectContaining({
            token: 'new-refresh-token',
            userId: user.id,
            userDeviceId: 'device-1',
         }),
      });
      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
   });
});

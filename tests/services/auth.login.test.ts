import { Role } from '@prisma/client';
import { attachPrismaTransaction } from '../helpers/prismaMock';

const mockPrisma = attachPrismaTransaction({
   user: {
      findUnique: jest.fn(),
   },
   refreshToken: {
      create: jest.fn(),
   },
});

jest.mock('@prisma/client', () => ({
   PrismaClient: jest.fn(() => mockPrisma),
   Role: {
      LISTENER: 'LISTENER',
      GLOBAL_ADMIN: 'GLOBAL_ADMIN',
      ORG_ADMIN: 'ORG_ADMIN',
      ORG_COORDINATOR: 'ORG_COORDINATOR',
      AUTHOR: 'AUTHOR',
   },
   OtpPurpose: { REGISTRATION: 'REGISTRATION' },
   OrganizationRole: {
      OWNER: 'OWNER',
      ADMIN: 'ADMIN',
   },
   OrganizationTeamSize: {
      SIZE_1_10: 'SIZE_1_10',
      SIZE_11_50: 'SIZE_11_50',
      SIZE_51_200: 'SIZE_51_200',
      SIZE_200_PLUS: 'SIZE_200_PLUS',
   },
   ReputationTierLevel: {
      TIER_1: 'TIER_1',
      TIER_2: 'TIER_2',
      TIER_3: 'TIER_3',
      TIER_4: 'TIER_4',
      TIER_5: 'TIER_5',
   },
   ReviewerType: {
      USER: 'USER',
      AUTHOR: 'AUTHOR',
      ORGANIZATION: 'ORGANIZATION',
   },
}));

jest.mock('../../src/utils/crypto', () => ({
   PasswordUtils: {
      hashPassword: jest.fn().mockResolvedValue('hashed-password'),
      verifyPassword: jest.fn().mockResolvedValue(true),
   },
   TokenUtils: {
      generateRefreshToken: jest.fn().mockReturnValue('refresh-token'),
   },
   JWTUtils: {
      generateAccessToken: jest.fn().mockReturnValue('access-token'),
   },
}));

jest.mock('../../src/services/userDevice', () => ({
   userDeviceService: {
      resolveDeviceForAuth: jest.fn().mockResolvedValue({ id: 'device-1' }),
   },
}));

jest.mock('../../src/services/google-oauth', () => ({
   googleOAuthService: {
      verifyIdToken: jest.fn(),
   },
}));

import { AuthService } from '../../src/services/auth';

describe('AuthService login app access', () => {
   let authService: AuthService;

   const verifiedUser = {
      id: 'user-1',
      email: 'user@example.com',
      password: 'hashed-password',
      emailVerified: true,
   };

   beforeEach(() => {
      jest.clearAllMocks();
      authService = new AuthService();
      mockPrisma.refreshToken.create.mockResolvedValue({});
   });

   test('should allow admin users for partner app', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
         ...verifiedUser,
         role: Role.GLOBAL_ADMIN,
      });

      await expect(
         authService.login({
            email: 'admin@example.com',
            password: 'password123',
            app: 'partner',
            device: { deviceId: 'device-1' },
         }),
      ).resolves.toEqual(
         expect.objectContaining({
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
         }),
      );
   });

   test('should allow author users for partner app', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
         ...verifiedUser,
         role: Role.AUTHOR,
      });

      await expect(
         authService.login({
            email: 'author@example.com',
            password: 'password123',
            app: 'partner',
            device: { deviceId: 'device-1' },
         }),
      ).resolves.toEqual(
         expect.objectContaining({
            accessToken: 'access-token',
         }),
      );
   });

   test('should reject regular users for partner app', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
         ...verifiedUser,
         role: Role.LISTENER,
      });

      await expect(
         authService.login({
            email: 'user@example.com',
            password: 'password123',
            app: 'partner',
            device: { deviceId: 'device-1' },
         }),
      ).rejects.toThrow('Access denied. Global admin, author, or organization staff role required.');
   });

   test('should allow ORG_ADMIN users for partner app', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
         ...verifiedUser,
         role: Role.ORG_ADMIN,
      });

      await expect(
         authService.login({
            email: 'org@example.com',
            password: 'password123',
            app: 'partner',
            device: { deviceId: 'device-1' },
         }),
      ).resolves.toEqual(
         expect.objectContaining({
            accessToken: 'access-token',
         }),
      );
   });

});

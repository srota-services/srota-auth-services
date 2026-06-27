import { Role } from '@prisma/client';
import { attachPrismaTransaction } from '../helpers/prismaMock';

const mockPrisma = attachPrismaTransaction({
   user: {
      create: jest.fn(),
   },
   userDevice: {
      findFirst: jest.fn(),
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
      GUEST: 'GUEST',
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
}));

jest.mock('../../src/utils/crypto', () => ({
   PasswordUtils: {
      hashPassword: jest.fn(),
      verifyPassword: jest.fn(),
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
      verifyGoogleToken: jest.fn(),
   },
}));

jest.mock('../../src/services/rabbitmq', () => ({
   rabbitmqService: {
      publishUserCreated: jest.fn(),
   },
}));

import { AuthService } from '../../src/services/auth';
import { GUEST_EMAIL_DOMAIN } from '../../src/constants/guestUser';

describe('AuthService createOrResumeGuestSession', () => {
   let authService: AuthService;

   const device = {
      deviceId: 'guest-device-001',
      deviceName: 'Test Device',
      platform: 'ios',
   };

   beforeEach(() => {
      jest.clearAllMocks();
      authService = new AuthService();
      mockPrisma.refreshToken.create.mockResolvedValue({});
   });

   test('creates a new guest user when no existing guest device is found', async () => {
      mockPrisma.userDevice.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
         id: 'guest-user-1',
         email: `guest+uuid@${GUEST_EMAIL_DOMAIN}`,
         role: Role.GUEST,
         emailVerified: true,
      });

      const result = await authService.createOrResumeGuestSession({ device });

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               role: Role.GUEST,
               password: null,
               emailVerified: true,
            }),
         }),
      );
      expect(result.accessToken).toBe('access-token');
      expect(result.user.role).toBe(Role.GUEST);
   });

   test('reuses existing guest user for the same device', async () => {
      const existingGuest = {
         id: 'guest-user-existing',
         email: `guest+existing@${GUEST_EMAIL_DOMAIN}`,
         role: Role.GUEST,
         emailVerified: true,
      };

      mockPrisma.userDevice.findFirst.mockResolvedValue({
         id: 'device-record-1',
         user: existingGuest,
      });

      const result = await authService.createOrResumeGuestSession({ device });

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(result.user.id).toBe('guest-user-existing');
      expect(result.accessToken).toBe('access-token');
   });
});

import { Role } from '@prisma/client';
import { attachPrismaTransaction } from '../helpers/prismaMock';

const mockPrisma = attachPrismaTransaction({
   user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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
   OtpPurpose: {
      REGISTRATION: 'REGISTRATION',
   },
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
      hashPassword: jest.fn().mockResolvedValue('hashed-password'),
      verifyPassword: jest.fn(),
   },
   TokenUtils: {
      generateRefreshToken: jest.fn().mockReturnValue('refresh-token'),
   },
   JWTUtils: {
      generateAccessToken: jest.fn().mockReturnValue('access-token'),
   },
}));

jest.mock('../../src/services/redis', () => ({
   redisService: {
      setPendingAuthorRegistration: jest.fn().mockResolvedValue(undefined),
      getPendingAuthorRegistration: jest.fn(),
      deletePendingAuthorRegistration: jest.fn().mockResolvedValue(undefined),
      setPendingUserRegistration: jest.fn().mockResolvedValue(undefined),
      getPendingUserRegistration: jest.fn(),
      deletePendingUserRegistration: jest.fn().mockResolvedValue(undefined),
   },
}));

jest.mock('../../src/services/rabbitmq', () => ({
   rabbitmqService: {
      publishUserCreated: jest.fn().mockResolvedValue(undefined),
      publishAuthorCreated: jest.fn().mockResolvedValue(undefined),
   },
}));

jest.mock('../../src/services/otp', () => ({
   otpService: {
      createOTP: jest.fn().mockResolvedValue(undefined),
      verifyOTP: jest.fn().mockResolvedValue(undefined),
   },
}));

jest.mock('../../src/services/userProfile', () => ({
   userProfileService: {
      initializeUserProfile: jest.fn().mockResolvedValue({ id: 'user-1' }),
      getUserProfile: jest.fn(),
   },
   toUserResponse: jest.fn((user) => user),
}));

jest.mock('../../src/services/userDevice', () => ({
   userDeviceService: {
      resolveDeviceForAuth: jest.fn().mockResolvedValue({ id: 'device-1' }),
   },
}));

jest.mock('../../src/services/AuthorService', () => ({
   AuthorService: jest.fn().mockImplementation(() => ({
      createAuthorForUser: jest.fn().mockResolvedValue({
         id: 'author-1',
         userId: 'author-user-1',
         slug: 'jane-doe-abc12345',
      }),
      applyAuthorAvatarFromSource: jest.fn().mockResolvedValue(undefined),
   })),
}));

jest.mock('../../src/services/google-oauth', () => ({
   googleOAuthService: {
      verifyIdToken: jest.fn(),
   },
}));

import { AuthService } from '../../src/services/auth';
import { redisService } from '../../src/services/redis';
import { rabbitmqService } from '../../src/services/rabbitmq';
import { userProfileService } from '../../src/services/userProfile';
import { userDeviceService } from '../../src/services/userDevice';

describe('AuthService register/verify author flow', () => {
   let authService: AuthService;

   beforeEach(() => {
      jest.clearAllMocks();
      authService = new AuthService();
   });

   test('should store pending author metadata on author registration', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
         id: 'author-user-1',
         email: 'author@example.com',
         role: Role.AUTHOR,
         emailVerified: false,
         createdAt: new Date(),
         updatedAt: new Date(),
      });

      await authService.register({
         email: 'author@example.com',
         password: 'Password1!',
         role: Role.AUTHOR,
         firstName: 'Jane',
         lastName: 'Doe',
         address: '123 Main St',
         contact: '+919876543210',
      });

      expect(redisService.setPendingAuthorRegistration).toHaveBeenCalledWith('author-user-1', {
         firstName: 'Jane',
         lastName: 'Doe',
         address: '123 Main St',
         contact: '+919876543210',
      });
   });

   test('should store profileImage in pending author metadata when provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
         id: 'author-user-1',
         email: 'author@example.com',
         role: Role.AUTHOR,
         emailVerified: false,
         createdAt: new Date(),
         updatedAt: new Date(),
      });

      await authService.register({
         email: 'author@example.com',
         password: 'Password1!',
         role: Role.AUTHOR,
         firstName: 'Jane',
         lastName: 'Doe',
         address: '123 Main St',
         profileImage: '/uploads/images/authors/image-1.jpg',
      });

      expect(redisService.setPendingAuthorRegistration).toHaveBeenCalledWith('author-user-1', {
         firstName: 'Jane',
         lastName: 'Doe',
         address: '123 Main St',
         profileImage: '/uploads/images/authors/image-1.jpg',
      });
   });

   test('should publish author.created after OTP verification for author users', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
         id: 'author-user-1',
         email: 'author@example.com',
         role: Role.AUTHOR,
         emailVerified: false,
      });
      mockPrisma.user.update.mockResolvedValue({
         id: 'author-user-1',
         email: 'author@example.com',
         role: Role.AUTHOR,
         emailVerified: true,
      });
      mockPrisma.refreshToken.create.mockResolvedValue({});

      (redisService.getPendingAuthorRegistration as jest.Mock).mockResolvedValue({
         firstName: 'Jane',
         lastName: 'Doe',
         address: '123 Main St',
         contact: '+919876543210',
         profileImage: '/uploads/images/authors/image-1.jpg',
      });

      await authService.verifyRegistrationOTP({
         email: 'author@example.com',
         otp: '123456',
         device: { deviceId: 'device-1' },
      });

      expect(rabbitmqService.publishAuthorCreated).toHaveBeenCalledWith({
         authorId: 'author-1',
      });
      expect(rabbitmqService.publishUserCreated).not.toHaveBeenCalled();
      expect(redisService.deletePendingAuthorRegistration).toHaveBeenCalledWith('author-user-1');
   });

   test('should skip device registration for author OTP verification without device', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
         id: 'author-user-1',
         email: 'author@example.com',
         role: Role.AUTHOR,
         emailVerified: false,
      });
      mockPrisma.user.update.mockResolvedValue({
         id: 'author-user-1',
         email: 'author@example.com',
         role: Role.AUTHOR,
         emailVerified: true,
      });
      mockPrisma.refreshToken.create.mockResolvedValue({});

      (redisService.getPendingAuthorRegistration as jest.Mock).mockResolvedValue({
         firstName: 'Jane',
         lastName: 'Doe',
         address: '123 Main St',
      });

      await authService.verifyRegistrationOTP({
         email: 'author@example.com',
         otp: '123456',
         type: 'author',
      });

      expect(userDeviceService.resolveDeviceForAuth).not.toHaveBeenCalled();
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
         data: expect.objectContaining({
            userDeviceId: null,
         }),
      });
   });

   test('should publish user.created for regular users after OTP verification', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
         id: 'user-1',
         email: 'user@example.com',
         role: Role.LISTENER,
         emailVerified: false,
      });
      mockPrisma.user.update.mockResolvedValue({
         id: 'user-1',
         email: 'user@example.com',
         role: Role.LISTENER,
         emailVerified: true,
      });
      mockPrisma.refreshToken.create.mockResolvedValue({});

      (redisService.getPendingUserRegistration as jest.Mock).mockResolvedValue({
         address: '456 Oak Ave',
         contact: '+919123456789',
         avatar: 'uploads/images/users/avatar-1.jpg',
      });

      await authService.verifyRegistrationOTP({
         email: 'user@example.com',
         otp: '123456',
         firstName: 'John',
         lastName: 'Doe',
         device: { deviceId: 'device-1' },
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
         expect.objectContaining({
            where: { id: 'user-1' },
            data: expect.objectContaining({
               emailVerified: true,
               address: '456 Oak Ave',
               contact: '+919123456789',
               firstName: 'John',
               lastName: 'Doe',
            }),
         }),
      );
      expect(userProfileService.initializeUserProfile).toHaveBeenCalledWith('user-1', {
         avatar: 'uploads/images/users/avatar-1.jpg',
      });
      expect(rabbitmqService.publishUserCreated).not.toHaveBeenCalled();
      expect(rabbitmqService.publishAuthorCreated).not.toHaveBeenCalled();
      expect(redisService.deletePendingUserRegistration).toHaveBeenCalledWith('user-1');
   });
});

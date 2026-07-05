// Test setup file
// IMPORTANT: Set environment variables BEFORE any imports that depend on config
// This prevents env validation errors during test initialization

import forge from 'node-forge';

// Set NODE_ENV to test first
process.env['NODE_ENV'] = 'test';

// Generate RSA key pair for JWT testing (before importing anything that uses config)
const keypair = forge.pki.rsa.generateKeyPair(2048);
const testKeys = {
   privateKey: forge.pki.privateKeyToPem(keypair.privateKey),
   publicKey: forge.pki.publicKeyToPem(keypair.publicKey),
};

// Set all required environment variables before any config-dependent imports
process.env['PORT'] = '8082';
process.env['TRUST_PROXY'] = '0';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test_auth_service';
process.env['SUBSCRIPTION_CURRENCY'] = 'INR';
process.env['REDIS_URL'] = 'redis://localhost:6379';
process.env['RABBITMQ_URL'] = 'amqp://localhost:5672';
process.env['RABBITMQ_EXCHANGE'] = 'users';
process.env['RABBITMQ_AUTHORS_EXCHANGE'] = 'authors';
process.env['RABBITMQ_ORGANIZATIONS_EXCHANGE'] = 'organizations';
process.env['JWT_PRIVATE_KEY'] = testKeys.privateKey;
process.env['JWT_PUBLIC_KEY'] = testKeys.publicKey;
process.env['JWT_KEY_ID'] = 'test-key-1';
process.env['JWT_ISSUER'] = 'test-auth-service';
process.env['JWT_ACCESS_TOKEN_EXPIRY'] = '7d';
process.env['JWT_REFRESH_TOKEN_EXPIRY'] = '7d';
process.env['RATE_LIMIT_WINDOW_MS'] = '900000';
process.env['RATE_LIMIT_MAX_REQUESTS'] = '100';
process.env['EMAIL_FROM'] = 'test@example.com';
process.env['EMAIL_SERVICE_URL'] = '';
process.env['GOOGLE_CLIENT_ID'] = 'test-google-client-id';
process.env['ARGON2_MEMORY'] = '65536';
process.env['ARGON2_ITERATIONS'] = '3';
process.env['ARGON2_PARALLELISM'] = '4';
process.env['LOG_LEVEL'] = 'error';
process.env['HEALTH_SUPPORT_EMAIL'] = 'no-reply@srota-support.com';
process.env['HEALTH_SUPPORT_PASSWORD'] = 'test-health-password';
process.env['MAX_FILE_SIZE'] = '52428800';
process.env['AWS_S3_BUCKET'] = 'test-bucket';
process.env['AWS_S3_REGION'] = 'us-east-1';
process.env['AWS_S3_ENDPOINT'] = '';
process.env['AWS_SIGNED_URL_EXPIRES_IN'] = '3600';
process.env['MAX_FILE_SIZE'] = '52428800';
process.env['AWS_S3_BUCKET'] = 'test-bucket';
process.env['AWS_S3_REGION'] = 'us-east-1';
process.env['AWS_S3_ENDPOINT'] = 'https://s3.amazonaws.com';
process.env['AWS_SIGNED_URL_EXPIRES_IN'] = '3600';
process.env['NOMINATIM_BASE_URL'] = 'https://nominatim.openstreetmap.org';
process.env['NOMINATIM_USER_AGENT'] = 'SrotaAuthTest/1.0';

// Now safe to import modules that depend on config
// (No imports needed here - tests can import what they need)

// Mock Prisma client for tests
jest.mock('@prisma/client', () => {
   const actual = jest.requireActual('@prisma/client');
   class MockDecimal {
      constructor(private value: string | number) { }
      toString(): string {
         return String(this.value);
      }
   }
   return {
      ...actual,
      Prisma: {
         ...actual.Prisma,
         Decimal: MockDecimal,
         JsonNull: null,
      },
      PrismaClient: jest.fn().mockImplementation(() => {
         const client = {
            user: {
               findUnique: jest.fn(),
               create: jest.fn(),
               update: jest.fn(),
               findMany: jest.fn(),
            },
            refreshToken: {
               findUnique: jest.fn(),
               create: jest.fn(),
               update: jest.fn(),
               updateMany: jest.fn(),
            },
            emailVerificationToken: {
               findUnique: jest.fn(),
               create: jest.fn(),
               update: jest.fn(),
            },
            passwordResetToken: {
               findUnique: jest.fn(),
               create: jest.fn(),
               update: jest.fn(),
            },
            userDevice: {
               findFirst: jest.fn(),
               findUnique: jest.fn(),
               create: jest.fn(),
               update: jest.fn(),
            },
            otpToken: {
               findFirst: jest.fn(),
               create: jest.fn(),
               update: jest.fn(),
            },
         };
         const clientWithTx = client as typeof client & {
            $transaction: jest.Mock;
         };
         clientWithTx.$transaction = jest.fn(async (arg: unknown) => {
            if (typeof arg === 'function') {
               return (arg as (tx: typeof client) => Promise<unknown>)(client);
            }
            return Promise.all(arg as Promise<unknown>[]);
         });
         return clientWithTx;
      }),
      Role: {
         LISTENER: 'LISTENER',
         GLOBAL_ADMIN: 'GLOBAL_ADMIN',
         ORG_ADMIN: 'ORG_ADMIN',
         ORG_COORDINATOR: 'ORG_COORDINATOR',
         AUTHOR: 'AUTHOR',
         GUEST: 'GUEST',
      },
      BillingInterval: {
         MONTHLY: 'MONTHLY',
         QUARTERLY: 'QUARTERLY',
         YEARLY: 'YEARLY',
         LIFETIME: 'LIFETIME',
      },
      SubscriptionStatus: {
         PENDING: 'PENDING',
         TRIALING: 'TRIALING',
         ACTIVE: 'ACTIVE',
         PAST_DUE: 'PAST_DUE',
         PAUSED: 'PAUSED',
         CANCELED: 'CANCELED',
         EXPIRED: 'EXPIRED',
      },
      PlanChangeType: {
         UPGRADE: 'UPGRADE',
         DOWNGRADE: 'DOWNGRADE',
      },
      BillingEventType: {
         PRORATION_CHARGE: 'PRORATION_CHARGE',
         RENEWAL_CHARGE: 'RENEWAL_CHARGE',
         RENEWAL_FAILED: 'RENEWAL_FAILED',
         RENEWAL_RETRY_FAILED: 'RENEWAL_RETRY_FAILED',
         PLAN_CHANGE_SCHEDULED: 'PLAN_CHANGE_SCHEDULED',
      },
      UserDeviceChangeType: {
         ADDED: 'ADDED',
         REMOVED: 'REMOVED',
      },
      OtpPurpose: {
         LOGIN: 'LOGIN',
         REGISTRATION: 'REGISTRATION',
         EMAIL_UPDATE: 'EMAIL_UPDATE',
         PASSWORD_UPDATE: 'PASSWORD_UPDATE',
         PASSWORD_RESET: 'PASSWORD_RESET',
         DEVICE_REMOVAL: 'DEVICE_REMOVAL',
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
      AuthorOrganizationInvitationStatus: {
         PENDING_CONTACT_CONSENT: 'PENDING_CONTACT_CONSENT',
         AWAITING_ORG_CONTACT: 'AWAITING_ORG_CONTACT',
         AWAITING_JOIN_DECISION: 'AWAITING_JOIN_DECISION',
         DECLINED: 'DECLINED',
         ACCEPTED: 'ACCEPTED',
      },
      AuthorOrganizationCollaborationStatus: {
         PENDING_ORG_REVIEW: 'PENDING_ORG_REVIEW',
         NEGOTIATION: 'NEGOTIATION',
         ACCEPTED: 'ACCEPTED',
         REJECTED: 'REJECTED',
         ABORTED: 'ABORTED',
      },
      CollaborationActor: {
         AUTHOR: 'AUTHOR',
         ORGANIZATION: 'ORGANIZATION',
      },
      CollaborationTurn: {
         AUTHOR: 'AUTHOR',
         ORGANIZATION: 'ORGANIZATION',
      },
   };
});

// Mock Redis service
jest.mock('../src/services/redis', () => ({
   redisService: {
      connect: jest.fn(),
      disconnect: jest.fn(),
      revokeToken: jest.fn(),
      isTokenRevoked: jest.fn().mockResolvedValue(false),
      hasEmergencyRevoke: jest.fn().mockResolvedValue(false),
      storePKCESession: jest.fn(),
      getPKCESession: jest.fn(),
      deletePKCESession: jest.fn(),
      healthCheck: jest.fn().mockResolvedValue(true),
   },
}));

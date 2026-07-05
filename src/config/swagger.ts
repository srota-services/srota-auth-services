/**
 * Swagger/OpenAPI configuration for auth-service
 */
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import { config } from './env';

const options: swaggerJsdoc.Options = {
   definition: {
      openapi: '3.0.0',
      info: {
         title: 'Srota Auth Service API',
         version: '1.0.0',
         description: 'Authentication, organizations, authors, subscriptions, and catalog APIs for the Srota platform.',
      },
      servers: [
         {
            url: `http://localhost:${config.PORT}`,
            description: 'Development server',
         },
      ],
      components: {
         securitySchemes: {
            bearerAuth: {
               type: 'http',
               scheme: 'bearer',
               bearerFormat: 'JWT',
               description: 'JWT access token (Authorization: Bearer <token>)',
            },
            csrfToken: {
               type: 'apiKey',
               in: 'header',
               name: 'X-CSRF-Token',
               description: 'CSRF token required for cookie-based login/refresh/logout',
            },
            healthBasicAuth: {
               type: 'http',
               scheme: 'basic',
               description: 'Support credentials for health endpoints',
            },
         },
         schemas: {
            ImageAssetsMap: {
               type: 'object',
               additionalProperties: { type: 'string' },
               description: 'Map of image variantKey to resolved URL',
               example: { square_512: 'https://cdn.example.com/uploads/images/organization/org1/square_512.jpg' },
            },
            ApiResponse: {
               type: 'object',
               properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Operation successful' },
                  data: { type: 'object' },
                  timestamp: { type: 'string', format: 'date-time' },
               },
            },
            ErrorResponse: {
               type: 'object',
               properties: {
                  success: { type: 'boolean', example: false },
                  message: { type: 'string', example: 'Request failed' },
                  timestamp: { type: 'string', format: 'date-time' },
               },
            },
            Organization: {
               type: 'object',
               required: ['id', 'name', 'slug'],
               properties: {
                  id: { type: 'string', example: 'corg1234567890abcdefghij' },
                  name: { type: 'string', example: 'Acme Publishing' },
                  slug: { type: 'string', example: 'acme-publishing' },
                  description: { type: 'string', nullable: true, example: 'Independent audiobook publisher' },
                  image: { type: 'string', nullable: true, example: '/uploads/orgs/logo.jpg', description: 'Primary organization image (square_512 variant)' },
                  imageAssets: { $ref: '#/components/schemas/ImageAssetsMap' },
                  preferredGenre: { type: 'string', nullable: true, example: 'Fiction' },
                  websiteUrl: { type: 'string', nullable: true, example: 'https://acme.example.com' },
                  teamSize: { type: 'string', nullable: true, enum: ['1-10', '11-50', '51-200', '200+'] },
                  discoverable: { type: 'boolean', default: false },
                  memberCount: { type: 'integer', example: 12 },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
               },
            },
            Author: {
               type: 'object',
               required: ['id', 'userId', 'slug'],
               properties: {
                  id: { type: 'string', example: 'cauthor1234567890abcdefgh' },
                  userId: { type: 'string', example: 'cuser1234567890abcdefghij' },
                  slug: { type: 'string', example: 'jane-doe-a1b2c3d4' },
                  firstName: { type: 'string', nullable: true, example: 'Jane' },
                  lastName: { type: 'string', nullable: true, example: 'Doe' },
                  address: { type: 'string', nullable: true },
                  contact: { type: 'string', nullable: true },
                  avatar: { type: 'string', nullable: true, example: 'https://cdn.example.com/avatar.jpg' },
                  discoverable: { type: 'boolean', default: false },
                  imageAssets: { $ref: '#/components/schemas/ImageAssetsMap' },
                  organizations: {
                     type: 'array',
                     items: {
                        type: 'object',
                        properties: {
                           id: { type: 'string' },
                           name: { type: 'string' },
                           slug: { type: 'string' },
                        },
                     },
                  },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
               },
            },
            DiscoverableAuthor: {
               type: 'object',
               properties: {
                  authorId: { type: 'string', example: 'cauthor1234567890abcdefgh' },
                  slug: { type: 'string', example: 'jane-doe-a1b2c3d4' },
                  firstName: { type: 'string', nullable: true, example: 'Jane' },
                  lastName: { type: 'string', nullable: true, example: 'Doe' },
                  avatar: { type: 'string', nullable: true, example: 'https://cdn.example.com/avatar.jpg' },
                  discoverable: { type: 'boolean', example: true },
                  imageAssets: { $ref: '#/components/schemas/ImageAssetsMap' },
               },
            },
            ReputationTierLevel: {
               type: 'string',
               enum: ['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4', 'TIER_5'],
            },
            ReviewerType: {
               type: 'string',
               enum: ['USER', 'AUTHOR', 'ORGANIZATION'],
            },
            OrganizationReview: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  organizationId: { type: 'string' },
                  reviewerType: { $ref: '#/components/schemas/ReviewerType' },
                  reviewerId: { type: 'string' },
                  rating: { type: 'integer', minimum: 1, maximum: 5 },
                  description: { type: 'string', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
               },
            },
            CreateOrganizationReviewRequest: {
               type: 'object',
               required: ['organizationId', 'rating'],
               properties: {
                  organizationId: { type: 'string' },
                  rating: { type: 'integer', minimum: 1, maximum: 5 },
                  description: { type: 'string', maxLength: 2000 },
               },
            },
            UpdateOrganizationReviewRequest: {
               type: 'object',
               properties: {
                  rating: { type: 'integer', minimum: 1, maximum: 5 },
                  description: { type: 'string', nullable: true, maxLength: 2000 },
               },
            },
            AuthorReview: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  authorId: { type: 'string' },
                  reviewerType: { $ref: '#/components/schemas/ReviewerType' },
                  reviewerId: { type: 'string' },
                  rating: { type: 'integer', minimum: 1, maximum: 5 },
                  description: { type: 'string', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
               },
            },
            CreateAuthorReviewRequest: {
               type: 'object',
               required: ['authorId', 'rating'],
               properties: {
                  authorId: { type: 'string' },
                  rating: { type: 'integer', minimum: 1, maximum: 5 },
                  description: { type: 'string', maxLength: 2000 },
               },
            },
            UpdateAuthorReviewRequest: {
               type: 'object',
               properties: {
                  rating: { type: 'integer', minimum: 1, maximum: 5 },
                  description: { type: 'string', nullable: true, maxLength: 2000 },
               },
            },
            PublicUserProfile: {
               type: 'object',
               properties: {
                  userId: { type: 'string' },
                  username: { type: 'string' },
                  avatar: { type: 'string', nullable: true },
                  imageAssets: { $ref: '#/components/schemas/ImageAssetsMap' },
               },
            },
            InvitationOrganizationSummary: {
               type: 'object',
               required: ['id', 'name'],
               properties: {
                  id: { type: 'string' },
                  name: { type: 'string', example: 'Acme Publishing' },
               },
            },
            InvitationAuthorSummary: {
               type: 'object',
               required: ['id'],
               properties: {
                  id: { type: 'string' },
                  firstName: { type: 'string', nullable: true, example: 'Jane' },
                  lastName: { type: 'string', nullable: true, example: 'Doe' },
                  email: { type: 'string', example: 'jane@example.com', description: 'Visible after author reveals contact' },
                  contact: { type: 'string', nullable: true, example: '+15551234567', description: 'Visible after author reveals contact' },
               },
            },
            AuthorOrganizationInvitationForAuthor: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  status: {
                     type: 'string',
                     enum: [
                        'PENDING_CONTACT_CONSENT',
                        'AWAITING_ORG_CONTACT',
                        'AWAITING_JOIN_DECISION',
                        'DECLINED',
                        'ACCEPTED',
                     ],
                  },
                  organization: { $ref: '#/components/schemas/InvitationOrganizationSummary' },
                  contactRevealedAt: { type: 'string', format: 'date-time', nullable: true },
                  orgContactConfirmedAt: { type: 'string', format: 'date-time', nullable: true },
                  respondedAt: { type: 'string', format: 'date-time', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
               },
            },
            AuthorOrganizationInvitationForOrg: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  status: {
                     type: 'string',
                     enum: [
                        'PENDING_CONTACT_CONSENT',
                        'AWAITING_ORG_CONTACT',
                        'AWAITING_JOIN_DECISION',
                        'DECLINED',
                        'ACCEPTED',
                     ],
                  },
                  author: { $ref: '#/components/schemas/InvitationAuthorSummary' },
                  contactRevealedAt: { type: 'string', format: 'date-time', nullable: true },
                  orgContactConfirmedAt: { type: 'string', format: 'date-time', nullable: true },
                  respondedAt: { type: 'string', format: 'date-time', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
               },
            },
            OrganizationAuthorMember: {
               type: 'object',
               required: ['id', 'email'],
               properties: {
                  id: { type: 'string' },
                  firstName: { type: 'string', nullable: true, example: 'Jane' },
                  lastName: { type: 'string', nullable: true, example: 'Doe' },
                  email: { type: 'string', example: 'jane@example.com' },
                  contact: { type: 'string', nullable: true, example: '+15551234567' },
               },
            },
            CreateAuthorOrganizationInvitationRequest: {
               type: 'object',
               required: ['authorId'],
               properties: {
                  authorId: { type: 'string' },
               },
            },
            RevealContactRequest: {
               type: 'object',
               required: ['reveal'],
               properties: {
                  reveal: { type: 'boolean' },
               },
            },
            ConfirmOrgContactRequest: {
               type: 'object',
               required: ['contacted'],
               properties: {
                  contacted: { type: 'boolean' },
               },
            },
            JoinOrganizationInvitationRequest: {
               type: 'object',
               required: ['accept'],
               properties: {
                  accept: { type: 'boolean' },
               },
            },
            AuthorOrganizationCollaborationForAuthor: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  status: {
                     type: 'string',
                     enum: ['PENDING_ORG_REVIEW', 'NEGOTIATION', 'ACCEPTED', 'REJECTED', 'ABORTED'],
                  },
                  organization: { $ref: '#/components/schemas/InvitationOrganizationSummary' },
                  description: { type: 'string', nullable: true },
                  authorBudget: { type: 'number' },
                  organizationAsk: { type: 'number', nullable: true },
                  acceptedBudget: { type: 'number', nullable: true },
                  currency: { type: 'string', example: 'USD' },
                  turn: { type: 'string', enum: ['AUTHOR', 'ORGANIZATION'] },
                  negotiationExpiresAt: { type: 'string', format: 'date-time', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
               },
            },
            AuthorOrganizationCollaborationForOrg: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  status: {
                     type: 'string',
                     enum: ['PENDING_ORG_REVIEW', 'NEGOTIATION', 'ACCEPTED', 'REJECTED', 'ABORTED'],
                  },
                  author: { $ref: '#/components/schemas/InvitationAuthorSummary' },
                  description: { type: 'string', nullable: true },
                  authorBudget: { type: 'number' },
                  organizationAsk: { type: 'number', nullable: true },
                  acceptedBudget: { type: 'number', nullable: true },
                  currency: { type: 'string', example: 'USD' },
                  turn: { type: 'string', enum: ['AUTHOR', 'ORGANIZATION'] },
                  negotiationExpiresAt: { type: 'string', format: 'date-time', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
               },
            },
            CreateAuthorOrganizationCollaborationRequest: {
               type: 'object',
               required: ['organizationId', 'authorBudget', 'currency'],
               properties: {
                  organizationId: { type: 'string' },
                  description: { type: 'string' },
                  authorBudget: { type: 'number', minimum: 0.01 },
                  currency: { type: 'string', example: 'USD' },
               },
            },
            CounterCollaborationBudgetRequest: {
               type: 'object',
               required: ['authorBudget'],
               properties: {
                  authorBudget: { type: 'number', minimum: 0.01 },
               },
            },
            NegotiateCollaborationRequest: {
               type: 'object',
               required: ['organizationAsk'],
               properties: {
                  organizationAsk: { type: 'number', minimum: 0.01 },
               },
            },
            OrganizationMember: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  userId: { type: 'string', example: 'cuser1234567890abcdefghij' },
                  organizationId: { type: 'string' },
                  role: { type: 'string', enum: ['OWNER', 'ADMIN', 'MEMBER'] },
                  joinedAt: { type: 'string', format: 'date-time' },
                  user: {
                     type: 'object',
                     properties: {
                        email: { type: 'string', example: 'jane@example.com' },
                        firstName: { type: 'string', nullable: true, example: 'Jane' },
                        lastName: { type: 'string', nullable: true, example: 'Doe' },
                        contact: { type: 'string', nullable: true, example: '+15551234567' },
                     },
                  },
               },
            },
            SubscriptionPlan: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  name: { type: 'string', example: 'Premium' },
                  tierLevel: {
                     type: 'string',
                     enum: ['BASE', 'STANDARD', 'PREMIUM'],
                     example: 'STANDARD',
                     description:
                        'Hierarchical access tier. app-service compares this against audiobook/chapter minSubscriptionTier for content gating.',
                  },
                  price: { type: 'number', example: 9.99 },
                  currency: { type: 'string', example: 'USD' },
                  interval: { type: 'string', example: 'month' },
               },
            },
            UserSubscription: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  userId: { type: 'string' },
                  planId: { type: 'string' },
                  status: { type: 'string', enum: ['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELLED'] },
                  currentPeriodEnd: { type: 'string', format: 'date-time' },
               },
            },
            UserDevice: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  deviceName: { type: 'string', example: 'iPhone 15' },
                  platform: { type: 'string', example: 'ios' },
                  lastActiveAt: { type: 'string', format: 'date-time' },
               },
            },
            DeviceContext: {
               type: 'object',
               required: ['deviceId'],
               properties: {
                  deviceId: {
                     type: 'string',
                     example: 'browser-abc123',
                     description: 'Unique device identifier (1–128 characters)',
                  },
                  deviceName: {
                     type: 'string',
                     example: 'Chrome on Windows',
                     description: 'Optional human-readable device label',
                  },
                  platform: {
                     type: 'string',
                     example: 'web',
                     description: 'Optional platform identifier (e.g. web, ios, android)',
                  },
               },
            },
            LoginRequest: {
               type: 'object',
               required: ['email', 'password', 'device'],
               properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  password: { type: 'string', format: 'password', example: 'SecurePass123!' },
                  device: { $ref: '#/components/schemas/DeviceContext' },
                  slug: {
                     type: 'string',
                     example: 'acme-publishing',
                     description:
                        'Optional. Organization slug for ORG_ADMIN/ORG_COORDINATOR (must be a member). Author slug for AUTHOR (must belong to the user). Omit for listener login.',
                  },
                  clientType: {
                     type: 'string',
                     enum: ['browser', 'mobile'],
                     example: 'browser',
                     description:
                        'Optional. When "browser", refresh token is set as httpOnly cookie and omitted from the response body.',
                  },
                  app: {
                     type: 'string',
                     enum: ['partner'],
                     example: 'partner',
                     description:
                        'Optional. Set to "partner" for partner-portal login; restricts access to org staff, authors, and global admins.',
                  },
               },
            },
            MobileLoginRequest: {
               allOf: [
                  { $ref: '#/components/schemas/LoginRequest' },
                  {
                     type: 'object',
                     required: ['codeChallenge', 'codeChallengeMethod'],
                     properties: {
                        codeChallenge: {
                           type: 'string',
                           example: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
                           description: 'PKCE code challenge (S256)',
                        },
                        codeChallengeMethod: {
                           type: 'string',
                           enum: ['S256'],
                           example: 'S256',
                           description: 'PKCE code challenge method (only S256 is supported)',
                        },
                     },
                  },
               ],
            },
            GoogleOAuthRequest: {
               type: 'object',
               required: ['token', 'device'],
               properties: {
                  token: {
                     type: 'string',
                     example: 'ya29.a0AfH6SMB...',
                     description: 'Google ID token from the client OAuth flow',
                  },
                  device: { $ref: '#/components/schemas/DeviceContext' },
                  clientType: {
                     type: 'string',
                     enum: ['browser', 'mobile'],
                     example: 'browser',
                     description:
                        'Optional. When "browser", refresh token is set as httpOnly cookie and omitted from the response body.',
                  },
                  app: {
                     type: 'string',
                     enum: ['partner'],
                     example: 'partner',
                     description:
                        'Optional. Set to "partner" for partner-portal login; restricts access to org staff, authors, and global admins.',
                  },
               },
            },
            GuestAuthRequest: {
               type: 'object',
               required: ['device'],
               properties: {
                  device: { $ref: '#/components/schemas/DeviceContext' },
                  clientType: {
                     type: 'string',
                     enum: ['browser', 'mobile'],
                     example: 'browser',
                     description:
                        'Optional. When "browser", refresh token is set as httpOnly cookie and omitted from the response body.',
                  },
               },
            },
            AuthUser: {
               type: 'object',
               required: ['id', 'email', 'role', 'emailVerified'],
               properties: {
                  id: { type: 'string', example: 'cuser1234567890abcdefghij' },
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  role: {
                     type: 'string',
                     enum: ['LISTENER', 'GLOBAL_ADMIN', 'ORG_ADMIN', 'ORG_COORDINATOR', 'AUTHOR', 'GUEST'],
                     example: 'LISTENER',
                  },
                  emailVerified: { type: 'boolean', example: true },
               },
            },
            UserProfile: {
               allOf: [
                  { $ref: '#/components/schemas/AuthUser' },
                  {
                     type: 'object',
                     properties: {
                        firstName: { type: 'string', example: 'Jane' },
                        lastName: { type: 'string', example: 'Doe' },
                        address: { type: 'string', example: '123 Main St, Mumbai' },
                        contact: { type: 'string', example: '+919876543210' },
                        gender: {
                           type: 'string',
                           enum: ['MALE', 'FEMALE', 'NON_BINARY', 'OTHER', 'PREFER_NOT_TO_SAY'],
                        },
                        location: {
                           type: 'string',
                           example: 'Mumbai, Maharashtra, India',
                           description: 'Resolved place name from coordinates',
                        },
                        age: { type: 'integer', example: 28 },
                        username: { type: 'string', example: 'happy-tiger-1234' },
                        avatar: { type: 'string', nullable: true },
                        preferences: { type: 'object' },
                        imageAssets: { $ref: '#/components/schemas/ImageAssetsMap' },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                     },
                  },
               ],
            },
            LocationCoordinatesInput: {
               type: 'object',
               required: ['latitude', 'longitude'],
               properties: {
                  latitude: { type: 'number', format: 'double', example: 19.076, minimum: -90, maximum: 90 },
                  longitude: { type: 'number', format: 'double', example: 72.8777, minimum: -180, maximum: 180 },
               },
            },
            UpdateUserProfileRequest: {
               type: 'object',
               description: 'At least one field required. Guests may only send `location`.',
               properties: {
                  firstName: { type: 'string', minLength: 1, maxLength: 50 },
                  lastName: { type: 'string', minLength: 1, maxLength: 50 },
                  address: { type: 'string', nullable: true, maxLength: 500 },
                  contact: { type: 'string', nullable: true, maxLength: 50 },
                  gender: {
                     type: 'string',
                     nullable: true,
                     enum: ['MALE', 'FEMALE', 'NON_BINARY', 'OTHER', 'PREFER_NOT_TO_SAY'],
                  },
                  location: {
                     oneOf: [
                        { $ref: '#/components/schemas/LocationCoordinatesInput' },
                        { type: 'null' },
                     ],
                     description: 'Coordinates to resolve, or null to clear. Only field guests may update.',
                  },
                  age: { type: 'integer', nullable: true, minimum: 1, maximum: 150 },
                  username: { type: 'string', minLength: 3, maxLength: 50 },
                  preferences: { type: 'object', nullable: true },
                  avatar: { type: 'string', nullable: true },
               },
            },
            AuthResponse: {
               type: 'object',
               required: ['accessToken', 'user'],
               properties: {
                  message: { type: 'string', example: 'Login successful' },
                  accessToken: { type: 'string', example: 'eyJhbGciOiJSUzI1NiIs...' },
                  refreshToken: {
                     type: 'string',
                     example: 'dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4...',
                     description: 'Present for mobile clients; omitted from body for browser clients (httpOnly cookie instead)',
                  },
                  appType: {
                     type: 'string',
                     enum: ['organization', 'author'],
                     description:
                        'Present when slug resolves to an org or author context. Omitted for listener login.',
                  },
                  user: { $ref: '#/components/schemas/AuthUser' },
               },
            },
            RegisterRequest: {
               type: 'object',
               required: ['email', 'password'],
               properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  password: { type: 'string', format: 'password', example: 'SecurePass123!' },
                  confirmPassword: {
                     type: 'string',
                     format: 'password',
                     description: 'Optional. Must match password when provided.',
                  },
                  role: {
                     type: 'string',
                     enum: ['LISTENER', 'AUTHOR', 'ORG_ADMIN', 'ORG_COORDINATOR'],
                     example: 'LISTENER',
                     description:
                        'Optional. Defaults to LISTENER for JSON requests and AUTHOR for multipart/form-data. GLOBAL_ADMIN is not allowed.',
                  },
                  firstName: {
                     type: 'string',
                     example: 'Jane',
                     description: 'Required for AUTHOR registration. Optional for listener/org staff.',
                  },
                  lastName: {
                     type: 'string',
                     example: 'Doe',
                     description: 'Required for AUTHOR registration. Optional for listener/org staff.',
                  },
                  address: {
                     type: 'string',
                     example: '123 Main St, Mumbai',
                     description: 'Required for all registration types.',
                  },
                  contact: {
                     type: 'string',
                     example: '+919876543210',
                     description: 'Required for listener and org staff. Optional for author.',
                  },
                  avatar: {
                     type: 'string',
                     example: 'https://cdn.example.com/avatars/user.jpg',
                     description: 'Optional avatar URL for listener/org staff registration.',
                  },
                  profileImage: {
                     type: 'string',
                     format: 'binary',
                     description: 'Optional profile image upload for AUTHOR multipart registration.',
                  },
               },
            },
            RefreshTokenRequest: {
               type: 'object',
               properties: {
                  refreshToken: {
                     type: 'string',
                     example: 'dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4...',
                     description:
                        'Optional for mobile clients. Browser clients use the httpOnly refreshToken cookie instead.',
                  },
               },
            },
            CacheInvalidateEvent: {
               type: 'object',
               required: ['version', 'service', 'resource', 'action', 'id', 'queryKeys', 'timestamp'],
               description:
                  'TanStack Query cache-invalidation payload emitted on SSE event `cache-invalidate`. Loop queryKeys and call queryClient.invalidateQueries({ queryKey }) for each. For `subscription-catalog`, skip when relatedIds.userId does not match the current user; use removeQueries then invalidateQueries so tier-gated audiobook/chapter cache is cleared and refetched. For `subscription-gating`, invalidate when subscription plan tier definitions change or when chapter minSubscriptionTier changes are relayed from app-service (relatedIds.chapterId and relatedIds.audiobookId).',
               properties: {
                  version: { type: 'integer', example: 1 },
                  service: { type: 'string', enum: ['auth'], example: 'auth' },
                  resource: {
                     type: 'string',
                     example: 'organization',
                     description:
                        'Stable entity name (user, organization, subscription-plan, user-subscription, subscription-catalog, subscription-gating, …). subscription-catalog is emitted when a user effective subscription tier changes. subscription-gating is emitted when subscription plan tier definitions change or when chapter minSubscriptionTier changes are relayed from app-service.',
                  },
                  action: { type: 'string', enum: ['created', 'updated', 'deleted'] },
                  id: { type: 'string', example: 'corg1234567890abcdefghij' },
                  queryKeys: {
                     type: 'array',
                     items: { type: 'array', items: { type: 'string' } },
                     example: [['organizations'], ['organizations', 'corg1234567890abcdefghij']],
                  },
                  relatedIds: {
                     type: 'object',
                     additionalProperties: { type: 'string' },
                     example: { organizationId: 'corg1234567890abcdefghij' },
                  },
                  timestamp: { type: 'string', format: 'date-time' },
               },
            },
         },
         responses: {
            Unauthorized: {
               description: 'Authentication required or token invalid',
               content: {
                  'application/json': {
                     schema: { $ref: '#/components/schemas/ErrorResponse' },
                     example: { success: false, message: 'Unauthorized', timestamp: '2024-01-15T10:30:00Z' },
                  },
               },
            },
            Forbidden: {
               description: 'Insufficient permissions',
               content: {
                  'application/json': {
                     schema: { $ref: '#/components/schemas/ErrorResponse' },
                  },
               },
            },
            NotFound: {
               description: 'Resource not found',
               content: {
                  'application/json': {
                     schema: { $ref: '#/components/schemas/ErrorResponse' },
                  },
               },
            },
            ValidationError: {
               description: 'Validation failed',
               content: {
                  'application/json': {
                     schema: { $ref: '#/components/schemas/ErrorResponse' },
                  },
               },
            },
         },
      },
      tags: [
         { name: 'Auth', description: 'Registration, login, tokens, and profile' },
         { name: 'Organizations', description: 'Organization CRUD and membership' },
         { name: 'Authors', description: 'Author profiles and org links' },
         { name: 'AuthorInvitations', description: 'Step-by-step author organization invitations' },
         { name: 'AuthorCollaborations', description: 'Author-initiated organization collaboration requests' },
         { name: 'Catalog', description: 'Public catalog reads for cross-service hydration' },
         { name: 'OrganizationReviews', description: 'Organization reputation reviews' },
         { name: 'AuthorReviews', description: 'Author reputation reviews' },
         { name: 'SubscriptionPlans', description: 'Subscription plan management' },
         { name: 'Subscriptions', description: 'User subscription lifecycle' },
         { name: 'Devices', description: 'Registered user devices' },
         { name: 'Events', description: 'SSE cache-invalidation stream for TanStack Query clients' },
         { name: 'Health', description: 'Service health checks' },
      ],
   },
   apis: ['./src/docs/*.ts', './src/routes/*.ts', './src/controllers/*.ts'],
};

const specs = swaggerJsdoc(options);

export const setupSwagger = (app: Express): void => {
   app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Srota Auth Service API',
      swaggerOptions: {
         persistAuthorization: true,
         displayRequestDuration: true,
         filter: true,
      },
   }));

   app.get('/api-docs.json', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(specs);
   });
};

export { specs };

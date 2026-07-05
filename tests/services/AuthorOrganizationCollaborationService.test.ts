jest.mock('../../src/services/DomainEventPublisher', () => ({
   emitCacheInvalidation: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/CollaborationAttachmentService', () => ({
   persistCollaborationAttachments: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../src/services/OrganizationService', () => {
   const actual = jest.requireActual('../../src/services/OrganizationService');
   return {
      ...actual,
      OrganizationService: jest.fn().mockImplementation(() => ({
         hasOrgStaffAccess: jest.fn().mockResolvedValue(true),
         isAuthorLinkedToOrganization: jest.fn().mockResolvedValue(false),
      })),
   };
});

import {
   AuthorOrganizationCollaborationStatus,
   CollaborationTurn,
   Prisma,
} from '@prisma/client';
import { AuthorOrganizationCollaborationService } from '../../src/services/AuthorOrganizationCollaborationService';
import { DomainError } from '../../src/types/domain';
import { REJECTION_COOLDOWN_MS } from '../../src/constants/collaborationConstants';

const baseCollaboration = {
   id: 'collab-1',
   organizationId: 'org-1',
   authorId: 'author-1',
   description: 'Looking to collaborate',
   authorBudget: new Prisma.Decimal('1000.00'),
   organizationAsk: null,
   acceptedBudget: null,
   currency: 'USD',
   status: AuthorOrganizationCollaborationStatus.PENDING_ORG_REVIEW,
   turn: CollaborationTurn.ORGANIZATION,
   negotiationExpiresAt: null,
   rejectedAt: null,
   acceptedAt: null,
   abortedAt: null,
   createdAt: new Date('2026-01-01T00:00:00.000Z'),
   updatedAt: new Date('2026-01-01T00:00:00.000Z'),
   organization: { id: 'org-1', name: 'Acme Publishing' },
   author: {
      id: 'author-1',
      userId: 'user-1',
      slug: 'jane-doe',
      user: { firstName: 'Jane', lastName: 'Doe' },
   },
   attachments: [],
   rounds: [],
};

const mockPrisma = {
   organization: { findUnique: jest.fn() },
   author: { findUnique: jest.fn() },
   authorOrganization: { findUnique: jest.fn(), create: jest.fn() },
   authorOrganizationInvitation: { findUnique: jest.fn() },
   authorOrganizationCollaboration: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
   },
   authorOrganizationCollaborationRound: {
      create: jest.fn(),
      deleteMany: jest.fn(),
   },
   authorOrganizationCollaborationAttachment: {
      createMany: jest.fn(),
   },
   $transaction: jest.fn((fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)),
} as any;

describe('AuthorOrganizationCollaborationService', () => {
   let service: AuthorOrganizationCollaborationService;
   let lastCollaboration: typeof baseCollaboration;

   beforeEach(() => {
      service = new AuthorOrganizationCollaborationService(mockPrisma);
      jest.clearAllMocks();
      lastCollaboration = { ...baseCollaboration };
      mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org-1', discoverable: true });
      mockPrisma.author.findUnique.mockResolvedValue({ id: 'author-1' });
      mockPrisma.authorOrganization.findUnique.mockResolvedValue(null);
      mockPrisma.authorOrganizationInvitation.findUnique.mockResolvedValue(null);
      mockPrisma.authorOrganizationCollaboration.findUnique.mockResolvedValue(null);
      mockPrisma.authorOrganizationCollaboration.create.mockImplementation(async ({ data }: any) => {
         lastCollaboration = {
            ...baseCollaboration,
            ...data,
            id: 'collab-1',
         };
         return lastCollaboration;
      });
      mockPrisma.authorOrganizationCollaboration.update.mockImplementation(async ({ data }: any) => {
         lastCollaboration = {
            ...baseCollaboration,
            ...data,
         };
         return lastCollaboration;
      });
      mockPrisma.authorOrganizationCollaboration.findUniqueOrThrow.mockImplementation(async () => lastCollaboration);
      mockPrisma.authorOrganizationCollaborationRound.create.mockResolvedValue({});
      mockPrisma.authorOrganizationCollaborationRound.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.authorOrganizationCollaborationAttachment.createMany.mockResolvedValue({ count: 0 });
      mockPrisma.authorOrganization.create.mockResolvedValue({});
      mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockPrisma) => Promise<unknown>) =>
         fn(mockPrisma),
      );
   });

   it('rejects collaboration requests to non-discoverable organizations', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org-1', discoverable: false });

      await expect(service.createRequest('user-1', 'org-1', undefined, 1000, 'USD')).rejects.toBeInstanceOf(
         DomainError,
      );
   });

   it('creates a collaboration request in pending org review state', async () => {
      const result = await service.createRequest('user-1', 'org-1', 'Pitch deck attached', 1500, 'USD');

      expect(result.status).toBe(AuthorOrganizationCollaborationStatus.PENDING_ORG_REVIEW);
      expect(result.turn).toBe(CollaborationTurn.ORGANIZATION);
      expect(result.authorBudget).toBe(1500);
   });

   it('accepts a collaboration and creates an author organization link', async () => {
      mockPrisma.authorOrganizationCollaboration.findUnique.mockResolvedValue(baseCollaboration);
      mockPrisma.authorOrganizationCollaboration.update.mockResolvedValue({
         ...baseCollaboration,
         status: AuthorOrganizationCollaborationStatus.ACCEPTED,
         acceptedBudget: new Prisma.Decimal('1000.00'),
         acceptedAt: new Date(),
      });

      const result = await service.accept('org-1', 'collab-1', 'staff-1', 'ORG_ADMIN');

      expect(result.status).toBe(AuthorOrganizationCollaborationStatus.ACCEPTED);
      expect(mockPrisma.authorOrganization.create).toHaveBeenCalledWith({
         data: { authorId: 'author-1', organizationId: 'org-1' },
      });
   });

   it('blocks resubmit within rejection cooldown', async () => {
      mockPrisma.authorOrganizationCollaboration.findUnique.mockResolvedValue({
         ...baseCollaboration,
         status: AuthorOrganizationCollaborationStatus.REJECTED,
         rejectedAt: new Date(Date.now() - REJECTION_COOLDOWN_MS + 86400000),
      });

      await expect(service.createRequest('user-1', 'org-1', undefined, 1000, 'USD')).rejects.toBeInstanceOf(
         DomainError,
      );
   });

   it('allows author abort from pending org review', async () => {
      mockPrisma.authorOrganizationCollaboration.findUnique.mockResolvedValue(baseCollaboration);
      mockPrisma.authorOrganizationCollaboration.update.mockResolvedValue({
         ...baseCollaboration,
         status: AuthorOrganizationCollaborationStatus.ABORTED,
         abortedAt: new Date(),
      });

      const result = await service.abort('collab-1', 'user-1');

      expect(result.status).toBe(AuthorOrganizationCollaborationStatus.ABORTED);
   });

   it('negotiates and appends a round', async () => {
      mockPrisma.authorOrganizationCollaboration.findUnique.mockResolvedValue(baseCollaboration);
      mockPrisma.authorOrganizationCollaboration.update.mockResolvedValue({
         ...baseCollaboration,
         status: AuthorOrganizationCollaborationStatus.NEGOTIATION,
         organizationAsk: new Prisma.Decimal('900.00'),
         turn: CollaborationTurn.AUTHOR,
         negotiationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const result = await service.negotiate('org-1', 'collab-1', 'staff-1', 'ORG_ADMIN', 900);

      expect(result.status).toBe(AuthorOrganizationCollaborationStatus.NEGOTIATION);
      expect(mockPrisma.authorOrganizationCollaborationRound.create).toHaveBeenCalled();
   });

   it('counters budget during negotiation and switches turn to organization', async () => {
      mockPrisma.authorOrganizationCollaboration.findUnique.mockResolvedValue({
         ...baseCollaboration,
         status: AuthorOrganizationCollaborationStatus.NEGOTIATION,
         turn: CollaborationTurn.AUTHOR,
         organizationAsk: new Prisma.Decimal('900.00'),
         negotiationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      mockPrisma.authorOrganizationCollaboration.update.mockResolvedValue({
         ...baseCollaboration,
         status: AuthorOrganizationCollaborationStatus.NEGOTIATION,
         authorBudget: new Prisma.Decimal('950.00'),
         turn: CollaborationTurn.ORGANIZATION,
      });

      const result = await service.counterBudget('collab-1', 'user-1', 950);

      expect(result.turn).toBe(CollaborationTurn.ORGANIZATION);
      expect(mockPrisma.authorOrganizationCollaborationRound.create).toHaveBeenCalled();
   });

   it('auto-aborts expired negotiations on read', async () => {
      mockPrisma.authorOrganizationCollaboration.findMany.mockResolvedValue([
         {
            ...baseCollaboration,
            status: AuthorOrganizationCollaborationStatus.NEGOTIATION,
            negotiationExpiresAt: new Date(Date.now() - 1000),
         },
      ]);
      mockPrisma.authorOrganizationCollaboration.update.mockResolvedValue({
         ...baseCollaboration,
         status: AuthorOrganizationCollaborationStatus.ABORTED,
         abortedAt: new Date(),
      });

      const results = await service.listForAuthor('user-1');

      expect(results[0]?.status).toBe(AuthorOrganizationCollaborationStatus.ABORTED);
   });

   it('rejects when it is not the author turn to counter', async () => {
      mockPrisma.authorOrganizationCollaboration.findUnique.mockResolvedValue({
         ...baseCollaboration,
         status: AuthorOrganizationCollaborationStatus.NEGOTIATION,
         turn: CollaborationTurn.ORGANIZATION,
         negotiationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      await expect(service.counterBudget('collab-1', 'user-1', 950)).rejects.toBeInstanceOf(DomainError);
   });
});

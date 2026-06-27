jest.mock('../../src/services/DomainEventPublisher', () => ({
   emitCacheInvalidation: jest.fn().mockResolvedValue(undefined),
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

import { AuthorOrganizationInvitationStatus } from '@prisma/client';
import { AuthorOrganizationInvitationService } from '../../src/services/AuthorOrganizationInvitationService';
import { DomainError } from '../../src/types/domain';
import {
   toAuthorOrganizationInvitationForAuthorDto,
   toAuthorOrganizationInvitationForOrgDto,
   toOrganizationAuthorMemberDto,
} from '../../src/models/AuthorOrganizationInvitationDto';

const baseInvitation = {
   id: 'inv-1',
   organizationId: 'org-1',
   authorId: 'author-1',
   status: AuthorOrganizationInvitationStatus.PENDING_CONTACT_CONSENT,
   contactRevealedAt: null,
   orgContactConfirmedAt: null,
   respondedAt: null,
   createdAt: new Date('2026-01-01T00:00:00.000Z'),
   updatedAt: new Date('2026-01-01T00:00:00.000Z'),
   organization: { id: 'org-1', name: 'Acme Publishing', slug: 'acme-publishing' },
   author: {
      id: 'author-1',
      userId: 'user-1',
      slug: 'jane-doe-a1b2c3d4',
      user: {
         email: 'jane@example.com',
         firstName: 'Jane',
         lastName: 'Doe',
         contact: '+15551234567',
      },
   },
};

const mockPrisma = {
   organization: {
      findUnique: jest.fn(),
   },
   author: {
      findUnique: jest.fn(),
   },
   authorOrganization: {
      findMany: jest.fn(),
      create: jest.fn(),
   },
   authorOrganizationInvitation: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
   },
   $transaction: jest.fn((fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)),
} as any;

describe('AuthorOrganizationInvitationDto', () => {
   it('omits slug from author-facing invitation organization summary', () => {
      const dto = toAuthorOrganizationInvitationForAuthorDto(baseInvitation as any);
      expect(dto.organization).toEqual({ id: 'org-1', name: 'Acme Publishing' });
      expect(dto.organization).not.toHaveProperty('slug');
   });

   it('omits slug and contact from org-facing invitation before reveal', () => {
      const dto = toAuthorOrganizationInvitationForOrgDto(baseInvitation as any);
      expect(dto.author).toEqual({
         id: 'author-1',
         firstName: 'Jane',
         lastName: 'Doe',
      });
      expect(dto.author).not.toHaveProperty('slug');
      expect(dto.author).not.toHaveProperty('email');
   });

   it('includes email and contact for org after contact reveal', () => {
      const dto = toAuthorOrganizationInvitationForOrgDto({
         ...baseInvitation,
         status: AuthorOrganizationInvitationStatus.AWAITING_ORG_CONTACT,
         contactRevealedAt: new Date(),
      } as any);
      expect(dto.author.email).toBe('jane@example.com');
      expect(dto.author.contact).toBe('+15551234567');
   });

   it('maps organization author member without slug', () => {
      const dto = toOrganizationAuthorMemberDto(baseInvitation.author as any);
      expect(dto).toEqual({
         id: 'author-1',
         firstName: 'Jane',
         lastName: 'Doe',
         email: 'jane@example.com',
         contact: '+15551234567',
      });
      expect(dto).not.toHaveProperty('slug');
   });
});

describe('AuthorOrganizationInvitationService', () => {
   let service: AuthorOrganizationInvitationService;

   beforeEach(() => {
      service = new AuthorOrganizationInvitationService(mockPrisma);
      jest.clearAllMocks();
      mockPrisma.organization.findUnique.mockReset();
      mockPrisma.author.findUnique.mockReset();
      mockPrisma.authorOrganizationInvitation.findUnique.mockReset();
      mockPrisma.authorOrganizationInvitation.findMany.mockReset();
      mockPrisma.authorOrganizationInvitation.upsert.mockReset();
      mockPrisma.authorOrganizationInvitation.update.mockReset();
      mockPrisma.authorOrganization.findMany.mockReset();
      mockPrisma.authorOrganization.create.mockReset();
      mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockPrisma) => Promise<unknown>) =>
         fn(mockPrisma),
      );
      mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      mockPrisma.author.findUnique.mockResolvedValue({ id: 'author-1' });
   });

   it('creates invitation in pending contact consent state', async () => {
      mockPrisma.authorOrganizationInvitation.findUnique.mockResolvedValue(null);
      mockPrisma.authorOrganizationInvitation.upsert.mockResolvedValue(baseInvitation);

      const invitation = await service.createInvitation('org-1', 'author-1', 'staff-1', 'ORG_ADMIN');

      expect(invitation.status).toBe(AuthorOrganizationInvitationStatus.PENDING_CONTACT_CONSENT);
      expect(invitation.author).not.toHaveProperty('slug');
   });

   it('runs happy path through join acceptance', async () => {
      mockPrisma.author.findUnique.mockResolvedValue({ id: 'author-1' });
      mockPrisma.authorOrganizationInvitation.findUnique
         .mockResolvedValueOnce(baseInvitation)
         .mockResolvedValueOnce({
            ...baseInvitation,
            status: AuthorOrganizationInvitationStatus.AWAITING_ORG_CONTACT,
            contactRevealedAt: new Date(),
         })
         .mockResolvedValueOnce({
            ...baseInvitation,
            status: AuthorOrganizationInvitationStatus.AWAITING_JOIN_DECISION,
            contactRevealedAt: new Date(),
            orgContactConfirmedAt: new Date(),
         });

      mockPrisma.authorOrganizationInvitation.update
         .mockResolvedValueOnce({
            ...baseInvitation,
            status: AuthorOrganizationInvitationStatus.AWAITING_ORG_CONTACT,
            contactRevealedAt: new Date(),
         })
         .mockResolvedValueOnce({
            ...baseInvitation,
            status: AuthorOrganizationInvitationStatus.AWAITING_JOIN_DECISION,
            contactRevealedAt: new Date(),
            orgContactConfirmedAt: new Date(),
         })
         .mockResolvedValueOnce({
            ...baseInvitation,
            status: AuthorOrganizationInvitationStatus.ACCEPTED,
            respondedAt: new Date(),
         });

      mockPrisma.authorOrganization.create.mockResolvedValue({ id: 'link-1' });

      await service.revealContact('inv-1', 'user-1', true);
      await service.confirmOrgContact('inv-1', 'user-1', true);
      const joined = await service.decideJoin('inv-1', 'user-1', true);

      expect(joined.status).toBe(AuthorOrganizationInvitationStatus.ACCEPTED);
      expect(mockPrisma.authorOrganization.create).toHaveBeenCalledWith({
         data: { authorId: 'author-1', organizationId: 'org-1' },
      });
   });

   it('declines invitation when author refuses contact reveal', async () => {
      mockPrisma.author.findUnique.mockResolvedValue({ id: 'author-1' });
      mockPrisma.authorOrganizationInvitation.findUnique.mockResolvedValue(baseInvitation);
      mockPrisma.authorOrganizationInvitation.update.mockResolvedValue({
         ...baseInvitation,
         status: AuthorOrganizationInvitationStatus.DECLINED,
         respondedAt: new Date(),
      });

      const result = await service.revealContact('inv-1', 'user-1', false);
      expect(result.status).toBe(AuthorOrganizationInvitationStatus.DECLINED);
   });

   it('keeps awaiting org contact when author says organization has not contacted them', async () => {
      const awaiting = {
         ...baseInvitation,
         status: AuthorOrganizationInvitationStatus.AWAITING_ORG_CONTACT,
         contactRevealedAt: new Date(),
      };
      mockPrisma.author.findUnique.mockResolvedValue({ id: 'author-1' });
      mockPrisma.authorOrganizationInvitation.findUnique.mockResolvedValue(awaiting);

      const result = await service.confirmOrgContact('inv-1', 'user-1', false);
      expect(result.status).toBe(AuthorOrganizationInvitationStatus.AWAITING_ORG_CONTACT);
      expect(mockPrisma.authorOrganizationInvitation.update).not.toHaveBeenCalled();
   });

   it('rejects duplicate pending invitation', async () => {
      mockPrisma.authorOrganizationInvitation.findUnique.mockResolvedValue({
         ...baseInvitation,
         status: AuthorOrganizationInvitationStatus.PENDING_CONTACT_CONSENT,
      });

      await expect(
         service.createInvitation('org-1', 'author-1', 'staff-1', 'ORG_ADMIN'),
      ).rejects.toMatchObject({ statusCode: 409 });
   });

   it('rejects invalid state transition', async () => {
      mockPrisma.author.findUnique.mockResolvedValue({ id: 'author-1' });
      mockPrisma.authorOrganizationInvitation.findUnique.mockResolvedValue({
         ...baseInvitation,
         status: AuthorOrganizationInvitationStatus.DECLINED,
      });

      await expect(service.revealContact('inv-1', 'user-1', true)).rejects.toBeInstanceOf(DomainError);
   });
});

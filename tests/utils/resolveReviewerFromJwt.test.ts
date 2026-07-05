import { OrganizationRole, ReviewerType } from '@prisma/client';
import { Request } from 'express';
import { AuthRole } from '../../src/constants/authRoles';
import { resolveReviewerFromJwt } from '../../src/utils/resolveReviewerFromJwt';
import { PrismaClient } from '@prisma/client';

describe('resolveReviewerFromJwt', () => {
   let mockPrisma: {
      author: { findUnique: jest.Mock };
      organizationMember: { findFirst: jest.Mock };
   };

   beforeEach(() => {
      mockPrisma = {
         author: { findUnique: jest.fn() },
         organizationMember: { findFirst: jest.fn() },
      };
   });

   it('rejects guest users', async () => {
      const req = {
         user: { role: AuthRole.GUEST, id: 'guest-1' },
         headers: {},
      } as unknown as Request;

      await expect(
         resolveReviewerFromJwt(req, mockPrisma as unknown as PrismaClient),
      ).rejects.toMatchObject({
         statusCode: 403,
      });
   });

   it('resolves listener as USER reviewer using auth user id', async () => {
      const req = {
         user: { role: AuthRole.LISTENER, id: 'user-1' },
         headers: {},
      } as unknown as Request;

      const reviewer = await resolveReviewerFromJwt(req, mockPrisma as unknown as PrismaClient);

      expect(reviewer).toEqual({ type: ReviewerType.USER, id: 'user-1' });
   });

   it('resolves author as AUTHOR reviewer', async () => {
      mockPrisma.author.findUnique.mockResolvedValue({ id: 'author-1' });
      const req = {
         user: { role: AuthRole.AUTHOR, id: 'user-1' },
         headers: { authorization: 'Bearer token-1' },
      } as unknown as Request;

      const reviewer = await resolveReviewerFromJwt(req, mockPrisma as unknown as PrismaClient);

      expect(reviewer).toEqual({ type: ReviewerType.AUTHOR, id: 'author-1' });
   });

   it('resolves org admin as ORGANIZATION reviewer using primary staff membership', async () => {
      mockPrisma.organizationMember.findFirst.mockResolvedValue({
         organizationId: 'org-2',
         role: OrganizationRole.ADMIN,
      });
      const req = {
         user: { role: AuthRole.ORG_ADMIN, id: 'user-1' },
         headers: { authorization: 'Bearer token-1' },
      } as unknown as Request;

      const reviewer = await resolveReviewerFromJwt(req, mockPrisma as unknown as PrismaClient);

      expect(reviewer).toEqual({ type: ReviewerType.ORGANIZATION, id: 'org-2' });
   });
});

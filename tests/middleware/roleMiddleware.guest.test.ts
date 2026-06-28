import { Response, NextFunction } from 'express';
import {
   blockGuestMutations,
   isGuestLocationOnlyProfileUpdate,
} from '../../src/middleware/roleMiddleware';
import { AuthRole } from '../../src/constants/authRoles';

function buildMockResponse(): Response {
   const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
   };
   return res as unknown as Response;
}

describe('isGuestLocationOnlyProfileUpdate', () => {
   test('returns true for guest location-only PUT /user/profile', () => {
      const req = {
         method: 'PUT',
         path: '/user/profile',
         body: { location: { latitude: 19.076, longitude: 72.8777 } },
      };

      expect(isGuestLocationOnlyProfileUpdate(req as never)).toBe(true);
   });

   test('returns true when clearing location with null', () => {
      const req = {
         method: 'PUT',
         path: '/user/profile',
         body: { location: null },
      };

      expect(isGuestLocationOnlyProfileUpdate(req as never)).toBe(true);
   });

   test('returns false when non-location profile fields are included', () => {
      const req = {
         method: 'PUT',
         path: '/user/profile',
         body: {
            location: { latitude: 19.076, longitude: 72.8777 },
            firstName: 'Guest',
         },
      };

      expect(isGuestLocationOnlyProfileUpdate(req as never)).toBe(false);
   });

   test('returns false for non-profile paths', () => {
      const req = {
         method: 'PUT',
         path: '/change-password',
         body: { location: { latitude: 19.076, longitude: 72.8777 } },
      };

      expect(isGuestLocationOnlyProfileUpdate(req as never)).toBe(false);
   });
});

describe('blockGuestMutations', () => {
   const next = jest.fn() as NextFunction;

   beforeEach(() => {
      jest.clearAllMocks();
   });

   test('allows guest GET requests', () => {
      const req = {
         method: 'GET',
         user: { id: 'guest-1', role: AuthRole.GUEST, email: 'guest@test.internal' },
      };
      const res = buildMockResponse();

      blockGuestMutations()(req as never, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
   });

   test('blocks guest POST requests', () => {
      const req = {
         method: 'POST',
         path: '/change-password',
         body: {},
         user: { id: 'guest-1', role: AuthRole.GUEST, email: 'guest@test.internal' },
      };
      const res = buildMockResponse();

      blockGuestMutations()(req as never, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
         expect.objectContaining({
            error: 'Please sign up or log in to access this feature',
         }),
      );
      expect(next).not.toHaveBeenCalled();
   });

   test('allows guest location-only PUT /user/profile', () => {
      const req = {
         method: 'PUT',
         path: '/user/profile',
         body: { location: { latitude: 19.076, longitude: 72.8777 } },
         user: { id: 'guest-1', role: AuthRole.GUEST, email: 'guest@test.internal' },
      };
      const res = buildMockResponse();

      blockGuestMutations()(req as never, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
   });

   test('blocks guest PUT /user/profile with non-location fields', () => {
      const req = {
         method: 'PUT',
         path: '/user/profile',
         body: { firstName: 'Guest' },
         user: { id: 'guest-1', role: AuthRole.GUEST, email: 'guest@test.internal' },
      };
      const res = buildMockResponse();

      blockGuestMutations()(req as never, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
   });

   test('allows listener PUT requests', () => {
      const req = {
         method: 'PUT',
         path: '/user/profile',
         body: { firstName: 'Jane' },
         user: { id: 'user-1', role: AuthRole.LISTENER, email: 'user@example.com' },
      };
      const res = buildMockResponse();

      blockGuestMutations()(req as never, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
   });
});

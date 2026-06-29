import { Response } from 'express';
import { UserSubscriptionController } from '../../src/controllers/UserSubscriptionController';
import { UserSubscriptionService } from '../../src/services/UserSubscriptionService';
import { AuthRole } from '../../src/constants/authRoles';

jest.mock('../../src/services/UserSubscriptionService');

function buildMockResponse(): Response {
   return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
   } as unknown as Response;
}

describe('UserSubscriptionController role gating', () => {
   let controller: UserSubscriptionController;
   let mockService: jest.Mocked<UserSubscriptionService>;

   beforeEach(() => {
      jest.clearAllMocks();
      mockService = {
         getUserHighestActiveTier: jest.fn(),
         getActiveSubscriptionForUser: jest.fn(),
      } as unknown as jest.Mocked<UserSubscriptionService>;
      controller = new UserSubscriptionController({} as any);
      (controller as any).subscriptionService = mockService;
   });

   test('getMyTier skips subscription lookup for AUTHOR', async () => {
      const req = {
         user: { id: 'author-1', role: AuthRole.AUTHOR },
      } as any;
      const res = buildMockResponse();

      await controller.getMyTier(req, res);

      expect(mockService.getUserHighestActiveTier).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ tier: null });
   });

   test('getMyTier looks up tier for LISTENER', async () => {
      mockService.getUserHighestActiveTier.mockResolvedValue(2);
      const req = {
         user: { id: 'listener-1', role: AuthRole.LISTENER },
      } as any;
      const res = buildMockResponse();

      await controller.getMyTier(req, res);

      expect(mockService.getUserHighestActiveTier).toHaveBeenCalledWith('listener-1');
      expect(res.json).toHaveBeenCalledWith({ tier: 2 });
   });

   test('getMySubscription skips lookup for GLOBAL_ADMIN', async () => {
      const req = {
         user: { id: 'admin-1', role: AuthRole.GLOBAL_ADMIN },
      } as any;
      const res = buildMockResponse();

      await controller.getMySubscription(req, res);

      expect(mockService.getActiveSubscriptionForUser).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
         expect.objectContaining({ subscription: null }),
      );
   });
});

import { BillingInterval, SubscriptionStatus, SubscriptionTierLevel } from '@prisma/client';
import { UserSubscriptionService } from '../../src/services/UserSubscriptionService';

jest.mock('../../src/services/DomainEventPublisher', () => ({
   emitCacheInvalidation: jest.fn(),
}));

jest.mock('../../src/services/subscriptionCatalogInvalidation', () => ({
   emitSubscriptionCatalogInvalidation: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
   appLogger: {
      error: jest.fn(),
      info: jest.fn(),
   },
}));

import { emitCacheInvalidation } from '../../src/services/DomainEventPublisher';
import { emitSubscriptionCatalogInvalidation } from '../../src/services/subscriptionCatalogInvalidation';
import { attachPrismaTransaction } from '../helpers/prismaMock';

const monthlyPlan = {
   id: 'plan_standard',
   name: 'Standard',
   price: { toString: () => '249' },
   currency: 'INR',
   tierLevel: SubscriptionTierLevel.STANDARD,
   billingInterval: BillingInterval.MONTHLY,
   isActive: true,
};

const mockPrisma = attachPrismaTransaction({
   userSubscription: {
      findMany: jest.fn(),
      update: jest.fn(),
   },
}) as any;

describe('UserSubscriptionService expiration job', () => {
   let service: UserSubscriptionService;

   beforeEach(() => {
      service = new UserSubscriptionService(mockPrisma);
      jest.clearAllMocks();
      mockPrisma.userSubscription.update.mockReset();
   });

   describe('expireDueCanceledSubscriptions', () => {
      it('sets EXPIRED and endDate and emits cache invalidation', async () => {
         const sub = {
            id: 'sub1',
            userId: 'user-uuid',
            planId: monthlyPlan.id,
            cancelAtPeriodEnd: true,
            currentPeriodEnd: new Date('2026-01-01T00:00:00.000Z'),
            status: SubscriptionStatus.ACTIVE,
         };
         mockPrisma.userSubscription.findMany.mockResolvedValue([sub]);
         mockPrisma.userSubscription.update.mockResolvedValue({
            ...sub,
            status: SubscriptionStatus.EXPIRED,
            endDate: new Date('2026-01-02T00:00:00.000Z'),
            autoRenew: false,
         });

         const result = await service.expireDueCanceledSubscriptions(new Date('2026-01-02T00:00:00.000Z'));

         expect(mockPrisma.userSubscription.update).toHaveBeenCalledWith({
            where: { id: 'sub1' },
            data: {
               status: SubscriptionStatus.EXPIRED,
               endDate: new Date('2026-01-02T00:00:00.000Z'),
               autoRenew: false,
            },
         });
         expect(emitCacheInvalidation).toHaveBeenCalledWith('user-subscription', 'updated', 'sub1', {
            userId: 'user-uuid',
         });
         expect(emitSubscriptionCatalogInvalidation).toHaveBeenCalledWith({
            userId: 'user-uuid',
            subscriptionId: 'sub1',
            planId: monthlyPlan.id,
            action: 'updated',
         });
         expect(result).toEqual({ processed: 1, failed: 0, errors: [] });
      });
   });
});

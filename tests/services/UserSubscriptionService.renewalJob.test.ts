import { BillingInterval, PlanChangeType, SubscriptionStatus, SubscriptionTierLevel } from '@prisma/client';
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

function makeSubscription(overrides: Record<string, unknown> = {}) {
   const periodEnd = new Date('2026-01-01T00:00:00.000Z');
   return {
      id: 'sub1',
      userId: 'user-uuid',
      planId: monthlyPlan.id,
      status: SubscriptionStatus.ACTIVE,
      autoRenew: true,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: periodEnd,
      pendingPlanId: null,
      pendingPlanChangeAt: null,
      pendingPlanChangeType: null,
      plan: monthlyPlan,
      pendingPlan: null,
      ...overrides,
   };
}

const mockPrisma = attachPrismaTransaction({
   userSubscription: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
   },
   subscriptionBillingEvent: { create: jest.fn() },
}) as any;

describe('UserSubscriptionService renewal job', () => {
   let service: UserSubscriptionService;

   beforeEach(() => {
      service = new UserSubscriptionService(mockPrisma);
      jest.clearAllMocks();
      mockPrisma.userSubscription.update.mockReset();
   });

   describe('applyDueSubscriptionRenewals', () => {
      it('calls renewSubscription for eligible subscriptions', async () => {
         const sub = makeSubscription();
         mockPrisma.userSubscription.findMany.mockResolvedValue([sub]);

         const renewSpy = jest.spyOn(service, 'renewSubscription').mockResolvedValue({} as never);

         const result = await service.applyDueSubscriptionRenewals(new Date('2026-01-02T00:00:00.000Z'));

         expect(renewSpy).toHaveBeenCalledWith('sub1');
         expect(result).toEqual({ processed: 1, failed: 0, errors: [] });
      });

      it('queries excluding due pending downgrades', async () => {
         mockPrisma.userSubscription.findMany.mockResolvedValue([]);

         await service.applyDueSubscriptionRenewals(new Date('2026-01-02T00:00:00.000Z'));

         expect(mockPrisma.userSubscription.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
               where: expect.objectContaining({
                  autoRenew: true,
                  cancelAtPeriodEnd: false,
                  plan: { billingInterval: { not: BillingInterval.LIFETIME } },
                  NOT: {
                     AND: [
                        { pendingPlanChangeType: PlanChangeType.DOWNGRADE },
                        { pendingPlanId: { not: null } },
                        { pendingPlanChangeAt: { lte: expect.any(Date) } },
                     ],
                  },
               }),
            }),
         );
      });

      it('continues processing when one subscription fails', async () => {
         mockPrisma.userSubscription.findMany.mockResolvedValue([
            makeSubscription({ id: 'sub1' }),
            makeSubscription({ id: 'sub2' }),
         ]);

         jest.spyOn(service, 'renewSubscription')
            .mockRejectedValueOnce(new Error('renew failed'))
            .mockResolvedValueOnce({} as never);

         const result = await service.applyDueSubscriptionRenewals(new Date('2026-01-02T00:00:00.000Z'));

         expect(result.processed).toBe(1);
         expect(result.failed).toBe(1);
         expect(result.errors).toEqual([{ subscriptionId: 'sub1', message: 'renew failed' }]);
      });
   });
});

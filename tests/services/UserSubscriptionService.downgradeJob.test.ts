import { BillingInterval, PlanChangeType, SubscriptionStatus, SubscriptionTierLevel } from '@prisma/client';
import { UserSubscriptionService } from '../../src/services/UserSubscriptionService';
import { SubscriptionError } from '../../src/types/subscription';

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

import { emitSubscriptionCatalogInvalidation } from '../../src/services/subscriptionCatalogInvalidation';
import { attachPrismaTransaction } from '../helpers/prismaMock';

const standardPlan = {
   id: 'plan_standard',
   name: 'Standard',
   price: { toString: () => '249' },
   currency: 'INR',
   tierLevel: SubscriptionTierLevel.STANDARD,
   billingInterval: BillingInterval.MONTHLY,
   isActive: true,
};

const premiumPlan = {
   id: 'plan_premium',
   name: 'Premium',
   price: { toString: () => '399' },
   currency: 'INR',
   tierLevel: SubscriptionTierLevel.PREMIUM,
   billingInterval: BillingInterval.MONTHLY,
   isActive: true,
};

function makeSubscription(overrides: Record<string, unknown> = {}) {
   const periodEnd = new Date('2026-01-01T00:00:00.000Z');
   return {
      id: 'sub1',
      userId: 'user-uuid',
      planId: premiumPlan.id,
      status: SubscriptionStatus.ACTIVE,
      autoRenew: false,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: periodEnd,
      pendingPlanId: standardPlan.id,
      pendingPlanChangeAt: periodEnd,
      pendingPlanChangeType: PlanChangeType.DOWNGRADE,
      plan: premiumPlan,
      pendingPlan: standardPlan,
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

describe('UserSubscriptionService downgrade job', () => {
   let service: UserSubscriptionService;

   beforeEach(() => {
      service = new UserSubscriptionService(mockPrisma);
      jest.clearAllMocks();
      mockPrisma.userSubscription.update.mockReset();
      mockPrisma.subscriptionBillingEvent.create.mockReset();
   });

   describe('applyPendingDowngrade', () => {
      it('applies plan swap and clears pending fields when due', async () => {
         const sub = makeSubscription();
         mockPrisma.userSubscription.findUnique.mockResolvedValue(sub);
         mockPrisma.userSubscription.update.mockResolvedValue({
            ...sub,
            planId: standardPlan.id,
            pendingPlanId: null,
         });

         await service.applyPendingDowngrade('sub1');

         expect(mockPrisma.userSubscription.update).toHaveBeenCalledWith({
            where: { id: 'sub1' },
            data: expect.objectContaining({
               plan: { connect: { id: standardPlan.id } },
               pendingPlan: { disconnect: true },
               pendingPlanChangeAt: null,
               pendingPlanChangeType: null,
            }),
         });
         expect(emitSubscriptionCatalogInvalidation).toHaveBeenCalledWith({
            userId: 'user-uuid',
            subscriptionId: 'sub1',
            planId: standardPlan.id,
            action: 'updated',
         });
         expect(mockPrisma.subscriptionBillingEvent.create).not.toHaveBeenCalled();
      });

      it('rejects when downgrade is not yet due', async () => {
         const future = new Date();
         future.setDate(future.getDate() + 7);
         mockPrisma.userSubscription.findUnique.mockResolvedValue(
            makeSubscription({ pendingPlanChangeAt: future, currentPeriodEnd: future }),
         );

         await expect(service.applyPendingDowngrade('sub1')).rejects.toBeInstanceOf(SubscriptionError);
         expect(mockPrisma.userSubscription.update).not.toHaveBeenCalled();
      });
   });

   describe('applyDuePendingDowngrades', () => {
      it('calls renewSubscription for auto-renew subscriptions', async () => {
         const sub = makeSubscription({ autoRenew: true, cancelAtPeriodEnd: false });
         mockPrisma.userSubscription.findMany.mockResolvedValue([sub]);
         mockPrisma.userSubscription.findUnique.mockResolvedValue(sub);
         mockPrisma.userSubscription.update.mockResolvedValue({ ...sub, planId: standardPlan.id });

         const renewSpy = jest.spyOn(service, 'renewSubscription').mockResolvedValue({} as never);
         const applySpy = jest.spyOn(service, 'applyPendingDowngrade');

         const result = await service.applyDuePendingDowngrades(new Date('2026-01-02T00:00:00.000Z'));

         expect(renewSpy).toHaveBeenCalledWith('sub1');
         expect(applySpy).not.toHaveBeenCalled();
         expect(result).toEqual({ processed: 1, failed: 0, errors: [] });
      });

      it('calls applyPendingDowngrade for non-auto-renew subscriptions', async () => {
         const sub = makeSubscription({ autoRenew: false });
         mockPrisma.userSubscription.findMany.mockResolvedValue([sub]);

         const renewSpy = jest.spyOn(service, 'renewSubscription');
         const applySpy = jest.spyOn(service, 'applyPendingDowngrade').mockResolvedValue({} as never);

         const result = await service.applyDuePendingDowngrades(new Date('2026-01-02T00:00:00.000Z'));

         expect(applySpy).toHaveBeenCalledWith('sub1');
         expect(renewSpy).not.toHaveBeenCalled();
         expect(result).toEqual({ processed: 1, failed: 0, errors: [] });
      });

      it('continues processing when one subscription fails', async () => {
         const sub1 = makeSubscription({ id: 'sub1' });
         const sub2 = makeSubscription({ id: 'sub2' });
         mockPrisma.userSubscription.findMany.mockResolvedValue([sub1, sub2]);

         jest.spyOn(service, 'applyPendingDowngrade')
            .mockRejectedValueOnce(new Error('apply failed'))
            .mockResolvedValueOnce({} as never);

         const result = await service.applyDuePendingDowngrades(new Date('2026-01-02T00:00:00.000Z'));

         expect(result.processed).toBe(1);
         expect(result.failed).toBe(1);
         expect(result.errors).toEqual([{ subscriptionId: 'sub1', message: 'apply failed' }]);
      });
   });
});

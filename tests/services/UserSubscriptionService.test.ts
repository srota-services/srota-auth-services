import { BillingInterval, SubscriptionStatus, SubscriptionTierLevel } from '@prisma/client';
import { UserSubscriptionService } from '../../src/services/UserSubscriptionService';
import { SubscriptionError } from '../../src/types/subscription';

jest.mock('../../src/services/DomainEventPublisher', () => ({
   emitCacheInvalidation: jest.fn(),
}));

jest.mock('../../src/services/subscriptionCatalogInvalidation', () => ({
   emitSubscriptionCatalogInvalidation: jest.fn(),
}));

import { emitSubscriptionCatalogInvalidation } from '../../src/services/subscriptionCatalogInvalidation';
import { attachPrismaTransaction } from '../helpers/prismaMock';

const basePlan = {
   id: 'plan_base',
   name: 'Base',
   price: { toString: () => '99' },
   currency: 'INR',
   tierLevel: SubscriptionTierLevel.BASE,
   billingInterval: BillingInterval.MONTHLY,
   isActive: true,
};

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
   const periodStart = new Date();
   periodStart.setDate(periodStart.getDate() - 15);
   const periodEnd = new Date();
   periodEnd.setDate(periodEnd.getDate() + 15);
   return {
      id: 'sub1',
      userId: 'user-uuid',
      planId: basePlan.id,
      status: SubscriptionStatus.ACTIVE,
      startDate: periodStart,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      trialEndsAt: null,
      pendingPlanId: null,
      pendingPlanChangeAt: null,
      pendingPlanChangeType: null,
      plan: basePlan,
      pendingPlan: null,
      ...overrides,
   };
}

const mockPrisma = attachPrismaTransaction({
   user: { findUnique: jest.fn() },
   subscriptionPlan: { findUnique: jest.fn() },
   userSubscription: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
   },
   subscriptionBillingEvent: { create: jest.fn() },
}) as any;

describe('UserSubscriptionService', () => {
   let service: UserSubscriptionService;

   beforeEach(() => {
      service = new UserSubscriptionService(mockPrisma);
      jest.clearAllMocks();
      mockPrisma.userSubscription.update.mockReset();
      mockPrisma.subscriptionBillingEvent.create.mockReset();
   });

   describe('getUserHighestActiveTier', () => {
      it('returns max tier among ACTIVE and TRIALING', async () => {
         mockPrisma.userSubscription.findMany.mockResolvedValue([
            { plan: { tierLevel: SubscriptionTierLevel.BASE } },
            { plan: { tierLevel: SubscriptionTierLevel.PREMIUM } },
         ]);
         await expect(service.getUserHighestActiveTier('user-uuid')).resolves.toBe(SubscriptionTierLevel.PREMIUM);
      });

      it('returns null when no qualifying subscriptions', async () => {
         mockPrisma.userSubscription.findMany.mockResolvedValue([]);
         await expect(service.getUserHighestActiveTier('user-uuid')).resolves.toBeNull();
      });
   });

   describe('createSubscription', () => {
      it('rejects when user does not exist', async () => {
         mockPrisma.user.findUnique.mockResolvedValue(null);
         await expect(
            service.createSubscription({ userId: 'missing', planId: 'plan1' })
         ).rejects.toBeInstanceOf(SubscriptionError);
      });

      it('rejects conflict when user already has active subscription', async () => {
         mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-uuid', role: 'LISTENER' });
         mockPrisma.subscriptionPlan.findUnique.mockResolvedValue(basePlan);
         mockPrisma.userSubscription.findFirst.mockResolvedValue({ id: 'existing-sub' });

         await expect(
            service.createSubscription({ userId: 'user-uuid', planId: basePlan.id })
         ).rejects.toMatchObject({ statusCode: 409 });
         expect(mockPrisma.userSubscription.create).not.toHaveBeenCalled();
      });
   });

   describe('changeSubscriptionPlan', () => {
      it('upgrades plan immediately and records proration charge', async () => {
         const sub = makeSubscription({ plan: basePlan });
         mockPrisma.userSubscription.findUnique.mockResolvedValue(sub);
         mockPrisma.subscriptionPlan.findUnique.mockResolvedValue(standardPlan);
         const upgraded = makeSubscription({
            planId: standardPlan.id,
            plan: standardPlan,
         });
         mockPrisma.userSubscription.update.mockResolvedValue(upgraded);

         const result = await service.changeSubscriptionPlan('sub1', standardPlan.id);

         expect(result.changeType).toBe('UPGRADE');
         expect(result.prorationAmount).toBeGreaterThan(0);
         expect(mockPrisma.userSubscription.update).toHaveBeenCalledWith(
            expect.objectContaining({
               data: expect.objectContaining({
                  plan: { connect: { id: standardPlan.id } },
               }),
            })
         );
         expect(mockPrisma.subscriptionBillingEvent.create).toHaveBeenCalledWith(
            expect.objectContaining({
               data: expect.objectContaining({
                  type: 'PRORATION_CHARGE',
               }),
            })
         );
         expect(emitSubscriptionCatalogInvalidation).toHaveBeenCalledWith({
            userId: 'user-uuid',
            subscriptionId: 'sub1',
            planId: standardPlan.id,
            action: 'updated',
         });
      });

      it('schedules downgrade without changing current planId', async () => {
         const sub = makeSubscription({ plan: premiumPlan });
         mockPrisma.userSubscription.findUnique.mockResolvedValue(sub);
         mockPrisma.subscriptionPlan.findUnique.mockResolvedValue(standardPlan);
         const scheduled = makeSubscription({
            plan: premiumPlan,
            pendingPlanId: standardPlan.id,
            pendingPlanChangeType: 'DOWNGRADE',
            pendingPlan: standardPlan,
         });
         mockPrisma.userSubscription.update.mockResolvedValue(scheduled);

         const result = await service.changeSubscriptionPlan('sub1', standardPlan.id);

         expect(result.changeType).toBe('DOWNGRADE');
         expect(result.prorationAmount).toBeNull();
         expect(mockPrisma.userSubscription.update).toHaveBeenCalledWith(
            expect.objectContaining({
               data: expect.objectContaining({
                  pendingPlan: { connect: { id: standardPlan.id } },
                  pendingPlanChangeType: 'DOWNGRADE',
               }),
            })
         );
         const updateArg = mockPrisma.userSubscription.update.mock.calls[0][0];
         expect(updateArg.data.plan).toBeUndefined();
         expect(mockPrisma.subscriptionBillingEvent.create).toHaveBeenCalledWith(
            expect.objectContaining({
               data: expect.objectContaining({
                  type: 'PLAN_CHANGE_SCHEDULED',
                  amount: expect.anything(),
               }),
            })
         );
         expect(emitSubscriptionCatalogInvalidation).not.toHaveBeenCalled();
      });

      it('rejects same plan', async () => {
         const sub = makeSubscription();
         mockPrisma.userSubscription.findUnique.mockResolvedValue(sub);
         mockPrisma.subscriptionPlan.findUnique.mockResolvedValue(basePlan);
         await expect(service.changeSubscriptionPlan('sub1', basePlan.id)).rejects.toBeInstanceOf(
            SubscriptionError
         );
      });
   });

   describe('cancelPendingPlanChange', () => {
      it('clears pending fields', async () => {
         const sub = makeSubscription({
            pendingPlanId: standardPlan.id,
            pendingPlanChangeAt: new Date('2026-02-01'),
            pendingPlanChangeType: 'DOWNGRADE',
         });
         mockPrisma.userSubscription.findUnique.mockResolvedValue(sub);
         mockPrisma.userSubscription.update.mockResolvedValue(makeSubscription());

         await service.cancelPendingPlanChange('sub1');

         expect(mockPrisma.userSubscription.update).toHaveBeenCalledWith(
            expect.objectContaining({
               data: expect.objectContaining({
                  pendingPlan: { disconnect: true },
                  pendingPlanChangeAt: null,
                  pendingPlanChangeType: null,
               }),
            })
         );
      });

      it('rejects when no pending change', async () => {
         mockPrisma.userSubscription.findUnique.mockResolvedValue(makeSubscription());
         await expect(service.cancelPendingPlanChange('sub1')).rejects.toBeInstanceOf(SubscriptionError);
      });
   });

   describe('renewSubscription', () => {
      it('applies pending downgrade and records full renewal charge', async () => {
         const periodEnd = new Date('2026-01-01T00:00:00.000Z');
         const sub = makeSubscription({
            plan: premiumPlan,
            currentPeriodEnd: periodEnd,
            pendingPlanId: standardPlan.id,
            pendingPlanChangeAt: periodEnd,
            pendingPlanChangeType: 'DOWNGRADE',
            pendingPlan: standardPlan,
         });
         mockPrisma.userSubscription.findUnique.mockResolvedValue(sub);
         mockPrisma.userSubscription.update.mockResolvedValue({
            ...sub,
            planId: standardPlan.id,
         });

         await service.renewSubscription('sub1');

         expect(mockPrisma.userSubscription.update).toHaveBeenCalledWith(
            expect.objectContaining({
               data: expect.objectContaining({
                  plan: { connect: { id: standardPlan.id } },
                  pendingPlan: { disconnect: true },
               }),
            })
         );
         expect(mockPrisma.subscriptionBillingEvent.create).toHaveBeenCalledWith(
            expect.objectContaining({
               data: expect.objectContaining({
                  type: 'RENEWAL_CHARGE',
               }),
            })
         );
         expect(emitSubscriptionCatalogInvalidation).toHaveBeenCalledWith({
            userId: 'user-uuid',
            subscriptionId: 'sub1',
            planId: standardPlan.id,
            action: 'updated',
         });
      });
   });
});

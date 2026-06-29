import {
   PrismaClient,
   Prisma,
   SubscriptionStatus,
   BillingInterval,
   PlanChangeType,
   BillingEventType,
   SubscriptionPlan,
   UserSubscription,
   SubscriptionTierLevel,
} from '@prisma/client';
import { SUBSCRIPTION_TIER_ORDER } from '../constants/subscriptionTierLevel';
import {
   UserSubscriptionDto,
   UserSubscriptionWithPlan,
   CreateUserSubscriptionDto,
   UpdateUserSubscriptionDto,
   CancelSubscriptionDto,
   UserSubscriptionQueryParams,
   ChangePlanResult,
   toUserSubscriptionDto,
   toUserSubscriptionWithPlan,
   subscriptionInclude,
} from '../models/UserSubscriptionDto';
import { SubscriptionError } from '../types/subscription';
import { subscriptionMessages } from '../utils/subscriptionMessages';
import { computeProration } from '../utils/subscriptionProration';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { emitSubscriptionCatalogInvalidation } from './subscriptionCatalogInvalidation';
import { isGuestRole } from '../constants/authRoles';
import { runInTransaction, runWrite } from '../utils/prismaTransaction';
import { rethrowServiceError } from '../utils/serviceError';

const planMsg = subscriptionMessages.error.subscription_plans;
const subMsg = subscriptionMessages.error.user_subscriptions;

const CHANGEABLE_STATUSES: SubscriptionStatus[] = [
   SubscriptionStatus.ACTIVE,
   SubscriptionStatus.TRIALING,
   SubscriptionStatus.PAST_DUE,
];

type SubscriptionWithPlans = UserSubscription & {
   plan: SubscriptionPlan;
   pendingPlan: SubscriptionPlan | null;
};

function addMonths(date: Date, months: number): Date {
   const result = new Date(date.getTime());
   result.setMonth(result.getMonth() + months);
   return result;
}

function addDays(date: Date, days: number): Date {
   const result = new Date(date.getTime());
   result.setDate(result.getDate() + days);
   return result;
}

export function computePeriodEnd(start: Date, interval: BillingInterval): Date {
   switch (interval) {
      case BillingInterval.MONTHLY:
         return addMonths(start, 1);
      case BillingInterval.QUARTERLY:
         return addMonths(start, 3);
      case BillingInterval.YEARLY:
         return addMonths(start, 12);
      case BillingInterval.LIFETIME:
         return new Date('9999-12-31T23:59:59.999Z');
      default:
         return addMonths(start, 1);
   }
}

function planPriceToDecimal(price: SubscriptionPlan['price']): Prisma.Decimal {
   return new Prisma.Decimal(price.toString());
}

export class UserSubscriptionService {
   constructor(private prisma: PrismaClient) {}

   async getUserHighestActiveTier(userId: string): Promise<SubscriptionTierLevel | null> {
      const subs = await this.prisma.userSubscription.findMany({
         where: {
            userId,
            status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
         },
         include: { plan: true },
      });
      if (subs.length === 0) return null;
      let highest: SubscriptionTierLevel | null = null;
      for (const sub of subs) {
         const tier = sub.plan.tierLevel;
         if (highest === null || SUBSCRIPTION_TIER_ORDER[tier] > SUBSCRIPTION_TIER_ORDER[highest]) {
            highest = tier;
         }
      }
      return highest;
   }

   async createSubscription(data: CreateUserSubscriptionDto): Promise<UserSubscriptionWithPlan> {
      try {
         const user = await this.prisma.user.findUnique({ where: { id: data.userId } });
         if (!user) throw SubscriptionError.notFound(subscriptionMessages.error.not_found.user);
         if (isGuestRole(user.role)) {
            throw SubscriptionError.forbidden(subMsg.guest_not_allowed);
         }
         const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: data.planId } });
         if (!plan) throw SubscriptionError.notFound(planMsg.not_found);
         if (!plan.isActive) throw SubscriptionError.validation(planMsg.inactive);
         const activeExisting = await this.prisma.userSubscription.findFirst({
            where: {
               userId: data.userId,
               status: {
                  in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE],
               },
            },
         });
         if (activeExisting) throw SubscriptionError.conflict(subMsg.already_subscribed);
         const startDate = data.startDate ? new Date(data.startDate) : new Date();
         const useTrial = (data.startTrial ?? plan.trialDays > 0) && plan.trialDays > 0;
         const trialEndsAt = useTrial ? addDays(startDate, plan.trialDays) : null;
         const currentPeriodStart = startDate;
         const currentPeriodEnd = useTrial ? trialEndsAt! : computePeriodEnd(startDate, plan.billingInterval);
         const status = useTrial ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE;
         const created = await runWrite(this.prisma, (tx) =>
            tx.userSubscription.create({
               data: {
                  userId: data.userId,
                  planId: data.planId,
                  status,
                  startDate,
                  currentPeriodStart,
                  currentPeriodEnd,
                  trialEndsAt,
                  autoRenew: data.autoRenew ?? plan.billingInterval !== BillingInterval.LIFETIME,
                  paymentMethod: data.paymentMethod ?? null,
               },
               include: subscriptionInclude,
            }),
         );
         emitCacheInvalidation('user-subscription', 'created', created.id, { userId: data.userId });
         emitSubscriptionCatalogInvalidation({
            userId: data.userId,
            subscriptionId: created.id,
            planId: data.planId,
            action: 'created',
         });
         return toUserSubscriptionWithPlan(created);
      } catch (error) {
         rethrowServiceError(error, { operation: 'createSubscription' }, subMsg.create_failed);
      }
   }

   async getAllSubscriptions(
      queryParams: UserSubscriptionQueryParams = {}
   ): Promise<{ subscriptions: UserSubscriptionWithPlan[]; totalCount: number }> {
      try {
         const page = queryParams.page || 1;
         const limit = queryParams.limit || 10;
         const skip = (page - 1) * limit;
         const sortBy = queryParams.sortBy || 'createdAt';
         const sortOrder = queryParams.sortOrder || 'desc';
         const where: Prisma.UserSubscriptionWhereInput = {};
         if (queryParams.userId) where.userId = queryParams.userId;
         if (queryParams.planId) where.planId = queryParams.planId;
         if (queryParams.status) where.status = queryParams.status;
         const [totalCount, subscriptions] = await Promise.all([
            this.prisma.userSubscription.count({ where }),
            this.prisma.userSubscription.findMany({
               where,
               skip,
               take: limit,
               orderBy: { [sortBy]: sortOrder },
               include: subscriptionInclude,
            }),
         ]);
         return { subscriptions: subscriptions.map(toUserSubscriptionWithPlan), totalCount };
      } catch (error) {
         rethrowServiceError(error, { operation: 'getAllSubscriptions' }, subMsg.fetch_failed);
      }
   }

   async getSubscriptionById(id: string): Promise<UserSubscriptionWithPlan> {
      try {
         const sub = await this.prisma.userSubscription.findUnique({
            where: { id },
            include: subscriptionInclude,
         });
         if (!sub) throw SubscriptionError.notFound(subMsg.not_found);
         return toUserSubscriptionWithPlan(sub);
      } catch (error) {
         rethrowServiceError(error, { operation: 'getSubscriptionById' }, subMsg.fetch_failed);
      }
   }

   async getActiveSubscriptionForUser(userId: string): Promise<UserSubscriptionWithPlan | null> {
      try {
         const sub = await this.prisma.userSubscription.findFirst({
            where: {
               userId,
               status: {
                  in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE],
               },
            },
            orderBy: { createdAt: 'desc' },
            include: subscriptionInclude,
         });
         return sub ? toUserSubscriptionWithPlan(sub) : null;
      } catch (error) {
         rethrowServiceError(error, { operation: 'getActiveSubscriptionForUser' }, subMsg.fetch_failed);
      }
   }

   async updateSubscription(id: string, data: UpdateUserSubscriptionDto): Promise<UserSubscriptionDto> {
      try {
         const existing = await this.prisma.userSubscription.findUnique({ where: { id } });
         if (!existing) throw SubscriptionError.notFound(subMsg.not_found);
         const updateData: Prisma.UserSubscriptionUpdateInput = {};
         if (data.autoRenew !== undefined) updateData.autoRenew = data.autoRenew;
         if (data.paymentMethod !== undefined) updateData.paymentMethod = data.paymentMethod;
         if (data.cancelAtPeriodEnd !== undefined) updateData.cancelAtPeriodEnd = data.cancelAtPeriodEnd;
         if (data.status !== undefined) updateData.status = data.status;
         if (Object.keys(updateData).length === 0) {
            throw SubscriptionError.validation(subscriptionMessages.error.validation.no_update_fields);
         }
         const updated = await runWrite(this.prisma, (tx) =>
            tx.userSubscription.update({ where: { id }, data: updateData }),
         );
         emitCacheInvalidation('user-subscription', 'updated', id, { userId: existing.userId });
         return toUserSubscriptionDto(updated);
      } catch (error) {
         rethrowServiceError(error, { operation: 'updateSubscription' }, subMsg.update_failed);
      }
   }

   async cancelSubscription(id: string, options: CancelSubscriptionDto = {}): Promise<UserSubscriptionDto> {
      try {
         const existing = await this.prisma.userSubscription.findUnique({ where: { id } });
         if (!existing) throw SubscriptionError.notFound(subMsg.not_found);
         if (existing.status === SubscriptionStatus.CANCELED || existing.status === SubscriptionStatus.EXPIRED) {
            throw SubscriptionError.validation(subMsg.already_canceled);
         }
         const cancelAtPeriodEnd = options.cancelAtPeriodEnd ?? true;
         const now = new Date();
         const updateData: Prisma.UserSubscriptionUpdateInput = {
            cancelAtPeriodEnd,
            canceledAt: now,
            autoRenew: false,
         };
         if (!cancelAtPeriodEnd) {
            updateData.status = SubscriptionStatus.CANCELED;
            updateData.endDate = now;
         }
         const updated = await runWrite(this.prisma, (tx) =>
            tx.userSubscription.update({ where: { id }, data: updateData }),
         );
         emitCacheInvalidation('user-subscription', 'updated', id, { userId: existing.userId });
         if (!cancelAtPeriodEnd) {
            emitSubscriptionCatalogInvalidation({
               userId: existing.userId,
               subscriptionId: id,
               planId: existing.planId,
               action: 'updated',
            });
         }
         return toUserSubscriptionDto(updated);
      } catch (error) {
         rethrowServiceError(error, { operation: 'cancelSubscription' }, subMsg.cancel_failed);
      }
   }

   private validatePlanChangeTargets(
      existing: SubscriptionWithPlans,
      targetPlan: SubscriptionPlan
   ): void {
      if (!CHANGEABLE_STATUSES.includes(existing.status)) {
         throw SubscriptionError.validation(subMsg.invalid_plan_change);
      }
      if (existing.planId === targetPlan.id) {
         throw SubscriptionError.validation(subMsg.same_plan);
      }
      if (
         existing.plan.billingInterval === BillingInterval.LIFETIME ||
         targetPlan.billingInterval === BillingInterval.LIFETIME
      ) {
         throw SubscriptionError.validation(subMsg.lifetime_no_change);
      }
      if (!targetPlan.isActive) {
         throw SubscriptionError.validation(planMsg.inactive);
      }
      if (existing.plan.billingInterval !== targetPlan.billingInterval) {
         throw SubscriptionError.validation(subMsg.interval_mismatch);
      }
      if (existing.plan.currency !== targetPlan.currency) {
         throw SubscriptionError.validation(subMsg.currency_mismatch);
      }
      if (targetPlan.tierLevel === existing.plan.tierLevel) {
         throw SubscriptionError.validation(subMsg.not_plan_change);
      }
   }

   async changeSubscriptionPlan(subscriptionId: string, newPlanId: string): Promise<ChangePlanResult> {
      try {
         const existing = await this.prisma.userSubscription.findUnique({
            where: { id: subscriptionId },
            include: subscriptionInclude,
         });
         if (!existing) throw SubscriptionError.notFound(subMsg.not_found);

         const targetPlan = await this.prisma.subscriptionPlan.findUnique({ where: { id: newPlanId } });
         if (!targetPlan) throw SubscriptionError.notFound(planMsg.not_found);

         this.validatePlanChangeTargets(existing, targetPlan);

         const now = new Date();

         if (SUBSCRIPTION_TIER_ORDER[targetPlan.tierLevel] > SUBSCRIPTION_TIER_ORDER[existing.plan.tierLevel]) {
            const { prorationAmount, remainingRatio } = computeProration({
               oldPrice: existing.plan.price,
               newPrice: targetPlan.price,
               periodStart: existing.currentPeriodStart,
               periodEnd: existing.currentPeriodEnd,
               now,
               status: existing.status,
            });

            const updated = await runInTransaction(this.prisma, async (tx) => {
               const upgradeData: Prisma.UserSubscriptionUpdateInput = {
                  plan: { connect: { id: newPlanId } },
                  pendingPlanChangeAt: null,
                  pendingPlanChangeType: null,
               };
               if (existing.pendingPlanId) {
                  upgradeData.pendingPlan = { disconnect: true };
               }
               const sub = await tx.userSubscription.update({
                  where: { id: subscriptionId },
                  data: upgradeData,
                  include: subscriptionInclude,
               });

               if (prorationAmount > 0) {
                  await tx.subscriptionBillingEvent.create({
                     data: {
                        userSubscriptionId: subscriptionId,
                        type: BillingEventType.PRORATION_CHARGE,
                        amount: new Prisma.Decimal(prorationAmount),
                        currency: targetPlan.currency,
                        metadata: {
                           oldPlanId: existing.planId,
                           newPlanId,
                           remainingRatio,
                           changeType: PlanChangeType.UPGRADE,
                        },
                     },
                  });
               }

               return sub;
            });

            emitCacheInvalidation('user-subscription', 'updated', subscriptionId, {
               userId: existing.userId,
            });
            emitSubscriptionCatalogInvalidation({
               userId: existing.userId,
               subscriptionId,
               planId: newPlanId,
               action: 'updated',
            });
            return {
               changeType: PlanChangeType.UPGRADE,
               effectiveAt: now,
               prorationAmount,
               subscription: toUserSubscriptionWithPlan(updated),
            };
         }

         const effectiveAt = existing.currentPeriodEnd;
         const updated = await runInTransaction(this.prisma, async (tx) => {
            const sub = await tx.userSubscription.update({
               where: { id: subscriptionId },
               data: {
                  pendingPlan: { connect: { id: newPlanId } },
                  pendingPlanChangeAt: effectiveAt,
                  pendingPlanChangeType: PlanChangeType.DOWNGRADE,
               },
               include: subscriptionInclude,
            });

            await tx.subscriptionBillingEvent.create({
               data: {
                  userSubscriptionId: subscriptionId,
                  type: BillingEventType.PLAN_CHANGE_SCHEDULED,
                  amount: new Prisma.Decimal(0),
                  currency: existing.plan.currency,
                  metadata: {
                     currentPlanId: existing.planId,
                     pendingPlanId: newPlanId,
                     effectiveAt: effectiveAt.toISOString(),
                     changeType: PlanChangeType.DOWNGRADE,
                  },
               },
            });

            return sub;
         });

         emitCacheInvalidation('user-subscription', 'updated', subscriptionId, {
            userId: existing.userId,
         });
         return {
            changeType: PlanChangeType.DOWNGRADE,
            effectiveAt,
            prorationAmount: null,
            subscription: toUserSubscriptionWithPlan(updated),
         };
      } catch (error) {
         rethrowServiceError(error, { operation: 'changeSubscriptionPlan' }, subMsg.plan_change_failed);
      }
   }

   async cancelPendingPlanChange(subscriptionId: string): Promise<UserSubscriptionWithPlan> {
      try {
         const existing = await this.prisma.userSubscription.findUnique({
            where: { id: subscriptionId },
            include: subscriptionInclude,
         });
         if (!existing) throw SubscriptionError.notFound(subMsg.not_found);
         if (!existing.pendingPlanId) {
            throw SubscriptionError.validation(subMsg.no_pending_change);
         }

         const updated = await runWrite(this.prisma, (tx) =>
            tx.userSubscription.update({
               where: { id: subscriptionId },
               data: {
                  pendingPlan: { disconnect: true },
                  pendingPlanChangeAt: null,
                  pendingPlanChangeType: null,
               },
               include: subscriptionInclude,
            }),
         );
         emitCacheInvalidation('user-subscription', 'updated', subscriptionId, {
            userId: existing.userId,
         });
         return toUserSubscriptionWithPlan(updated);
      } catch (error) {
         rethrowServiceError(error, { operation: 'cancelPendingPlanChange' }, subMsg.cancel_pending_failed);
      }
   }

   private getPendingPlanToApply(
      existing: SubscriptionWithPlans,
      now: Date
   ): SubscriptionPlan | null {
      if (!existing.pendingPlanId || !existing.pendingPlanChangeAt || !existing.pendingPlan) return null;
      if (now < existing.pendingPlanChangeAt) return null;
      return existing.pendingPlan;
   }

   async renewSubscription(id: string): Promise<UserSubscriptionDto> {
      try {
         const existing = await this.prisma.userSubscription.findUnique({
            where: { id },
            include: subscriptionInclude,
         });
         if (!existing) throw SubscriptionError.notFound(subMsg.not_found);
         if (existing.plan.billingInterval === BillingInterval.LIFETIME) {
            throw SubscriptionError.validation(subMsg.lifetime_no_renew);
         }
         if (existing.status === SubscriptionStatus.CANCELED) {
            throw SubscriptionError.validation(subMsg.cannot_renew_canceled);
         }

         const now = new Date();
         const pendingPlanToApply = this.getPendingPlanToApply(existing, now);
         const planForRenewal = pendingPlanToApply ?? existing.plan;

         const newPeriodStart = existing.currentPeriodEnd > now ? existing.currentPeriodEnd : now;
         const newPeriodEnd = computePeriodEnd(newPeriodStart, planForRenewal.billingInterval);

         const renewUpdateData: Prisma.UserSubscriptionUpdateInput = {
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: newPeriodStart,
            currentPeriodEnd: newPeriodEnd,
            cancelAtPeriodEnd: false,
            canceledAt: null,
            endDate: null,
            pastDueRetryCount: 0,
         };
         if (pendingPlanToApply) {
            renewUpdateData.plan = { connect: { id: pendingPlanToApply.id } };
            renewUpdateData.pendingPlan = { disconnect: true };
            renewUpdateData.pendingPlanChangeAt = null;
            renewUpdateData.pendingPlanChangeType = null;
         }

         const updated = await runInTransaction(this.prisma, async (tx) => {
            const sub = await tx.userSubscription.update({
               where: { id },
               data: renewUpdateData,
            });

            await tx.subscriptionBillingEvent.create({
               data: {
                  userSubscriptionId: id,
                  type: BillingEventType.RENEWAL_CHARGE,
                  amount: planPriceToDecimal(planForRenewal.price),
                  currency: planForRenewal.currency,
                  metadata: {
                     planId: planForRenewal.id,
                     periodStart: newPeriodStart.toISOString(),
                     periodEnd: newPeriodEnd.toISOString(),
                     appliedPendingChange: Boolean(pendingPlanToApply),
                  },
               },
            });

            return sub;
         });

         emitCacheInvalidation('user-subscription', 'updated', id, { userId: existing.userId });
         if (pendingPlanToApply) {
            emitSubscriptionCatalogInvalidation({
               userId: existing.userId,
               subscriptionId: id,
               planId: pendingPlanToApply.id,
               action: 'updated',
            });
         }
         return toUserSubscriptionDto(updated);
      } catch (error) {
         rethrowServiceError(error, { operation: 'renewSubscription' }, subMsg.renew_failed);
      }
   }

   async deleteSubscription(id: string): Promise<boolean> {
      try {
         const existing = await this.prisma.userSubscription.findUnique({ where: { id } });
         if (!existing) throw SubscriptionError.notFound(subMsg.not_found);
         await runWrite(this.prisma, (tx) => tx.userSubscription.delete({ where: { id } }));
         emitCacheInvalidation('user-subscription', 'deleted', id, { userId: existing.userId });
         return true;
      } catch (error) {
         rethrowServiceError(error, { operation: 'deleteSubscription' }, subMsg.delete_failed);
      }
   }

   async getSubscriptionsByUserId(
      userId: string,
      queryParams: UserSubscriptionQueryParams = {}
   ): Promise<{ subscriptions: UserSubscriptionWithPlan[]; totalCount: number }> {
      return this.getAllSubscriptions({ ...queryParams, userId });
   }
}

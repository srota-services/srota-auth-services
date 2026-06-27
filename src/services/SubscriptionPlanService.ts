import { PrismaClient, Prisma, BillingInterval } from '@prisma/client';
import {
   SubscriptionPlanDto,
   CreateSubscriptionPlanDto,
   UpdateSubscriptionPlanDto,
   SubscriptionPlanQueryParams,
   toSubscriptionPlanDto,
} from '../models/SubscriptionPlanDto';
import { SubscriptionError } from '../types/subscription';
import { subscriptionMessages } from '../utils/subscriptionMessages';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { emitSubscriptionGatingInvalidation } from './subscriptionGatingInvalidation';

const msg = subscriptionMessages.error.subscription_plans;

export class SubscriptionPlanService {
   constructor(private prisma: PrismaClient) {}

   async createPlan(data: CreateSubscriptionPlanDto): Promise<SubscriptionPlanDto> {
      const trimmedName = data.name.trim();
      try {
         const existing = await this.prisma.subscriptionPlan.findFirst({
            where: { name: { equals: trimmedName, mode: 'insensitive' } },
         });
         if (existing) throw SubscriptionError.conflict(msg.name_exists);
         if (data.price < 0) throw SubscriptionError.validation(msg.price_invalid);
         if (data.tierLevel !== undefined && (!Number.isInteger(data.tierLevel) || data.tierLevel < 0)) {
            throw SubscriptionError.validation(msg.tier_invalid);
         }

         const created = await this.prisma.subscriptionPlan.create({
            data: {
               name: trimmedName,
               description: data.description ?? null,
               price: new Prisma.Decimal(data.price),
               currency: data.currency ?? 'USD',
               tierLevel: data.tierLevel ?? 0,
               billingInterval: data.billingInterval ?? BillingInterval.MONTHLY,
               trialDays: data.trialDays ?? 0,
               features: data.features === undefined ? Prisma.JsonNull : (data.features as Prisma.InputJsonValue),
               isActive: data.isActive ?? true,
            },
         });
         emitCacheInvalidation('subscription-plan', 'created', created.id);
         emitSubscriptionGatingInvalidation({ action: 'created', planId: created.id });
         return toSubscriptionPlanDto(created);
      } catch (error) {
         if (error instanceof SubscriptionError) throw error;
         throw SubscriptionError.internal(msg.create_failed);
      }
   }

   async getAllPlans(
      queryParams: SubscriptionPlanQueryParams = {}
   ): Promise<{ plans: SubscriptionPlanDto[]; totalCount: number }> {
      try {
         const page = queryParams.page || 1;
         const limit = queryParams.limit || 10;
         const skip = (page - 1) * limit;
         const sortBy = queryParams.sortBy || 'createdAt';
         const sortOrder = queryParams.sortOrder || 'desc';
         const where: Prisma.SubscriptionPlanWhereInput = {};
         if (queryParams.isActive !== undefined) where.isActive = queryParams.isActive;
         if (queryParams.billingInterval) where.billingInterval = queryParams.billingInterval;
         if (queryParams.search) {
            where.OR = [
               { name: { contains: queryParams.search, mode: 'insensitive' } },
               { description: { contains: queryParams.search, mode: 'insensitive' } },
            ];
         }
         const [totalCount, plans] = await Promise.all([
            this.prisma.subscriptionPlan.count({ where }),
            this.prisma.subscriptionPlan.findMany({ where, skip, take: limit, orderBy: { [sortBy]: sortOrder } }),
         ]);
         return { plans: plans.map(toSubscriptionPlanDto), totalCount };
      } catch {
         throw SubscriptionError.internal(msg.fetch_failed);
      }
   }

   async getPlanById(id: string): Promise<SubscriptionPlanDto> {
      try {
         const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
         if (!plan) throw SubscriptionError.notFound(msg.not_found);
         return toSubscriptionPlanDto(plan);
      } catch (error) {
         if (error instanceof SubscriptionError) throw error;
         throw SubscriptionError.internal(msg.fetch_failed);
      }
   }

   async updatePlan(id: string, data: UpdateSubscriptionPlanDto): Promise<SubscriptionPlanDto> {
      try {
         const existing = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
         if (!existing) throw SubscriptionError.notFound(msg.not_found);
         const updateData: Prisma.SubscriptionPlanUpdateInput = {};
         if (data.name !== undefined) {
            const trimmed = data.name.trim();
            const duplicate = await this.prisma.subscriptionPlan.findFirst({
               where: { name: { equals: trimmed, mode: 'insensitive' }, NOT: { id } },
            });
            if (duplicate) throw SubscriptionError.conflict(msg.name_exists);
            updateData.name = trimmed;
         }
         if (data.description !== undefined) updateData.description = data.description;
         if (data.price !== undefined) {
            if (data.price < 0) throw SubscriptionError.validation(msg.price_invalid);
            updateData.price = new Prisma.Decimal(data.price);
         }
         if (data.currency !== undefined) updateData.currency = data.currency;
         if (data.tierLevel !== undefined) {
            if (!Number.isInteger(data.tierLevel) || data.tierLevel < 0) {
               throw SubscriptionError.validation(msg.tier_invalid);
            }
            updateData.tierLevel = data.tierLevel;
         }
         if (data.billingInterval !== undefined) updateData.billingInterval = data.billingInterval;
         if (data.trialDays !== undefined) updateData.trialDays = data.trialDays;
         if (data.features !== undefined) {
            updateData.features = data.features === null ? Prisma.JsonNull : (data.features as Prisma.InputJsonValue);
         }
         if (data.isActive !== undefined) updateData.isActive = data.isActive;
         const updated = await this.prisma.subscriptionPlan.update({ where: { id }, data: updateData });
         emitCacheInvalidation('subscription-plan', 'updated', id);
         emitSubscriptionGatingInvalidation({ action: 'updated', planId: id });
         return toSubscriptionPlanDto(updated);
      } catch (error) {
         if (error instanceof SubscriptionError) throw error;
         throw SubscriptionError.internal(msg.update_failed);
      }
   }

   async deletePlan(id: string): Promise<{ deleted: boolean; deactivated: boolean }> {
      try {
         const existing = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
         if (!existing) throw SubscriptionError.notFound(msg.not_found);
         const subscriptionsCount = await this.prisma.userSubscription.count({ where: { planId: id } });
         if (subscriptionsCount > 0) {
            await this.prisma.subscriptionPlan.update({ where: { id }, data: { isActive: false } });
            emitCacheInvalidation('subscription-plan', 'updated', id);
            emitSubscriptionGatingInvalidation({ action: 'updated', planId: id });
            return { deleted: false, deactivated: true };
         }
         await this.prisma.subscriptionPlan.delete({ where: { id } });
         emitCacheInvalidation('subscription-plan', 'deleted', id);
         emitSubscriptionGatingInvalidation({ action: 'deleted', planId: id });
         return { deleted: true, deactivated: false };
      } catch (error) {
         if (error instanceof SubscriptionError) throw error;
         throw SubscriptionError.internal(msg.delete_failed);
      }
   }
}

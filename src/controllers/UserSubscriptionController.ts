import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { UserSubscriptionService } from '../services/UserSubscriptionService';
import {
   CreateUserSubscriptionDto,
   UpdateUserSubscriptionDto,
   CancelSubscriptionDto,
   ChangeSubscriptionPlanDto,
   UserSubscriptionQueryParams,
} from '../models/UserSubscriptionDto';
import { AuthenticatedSubscriptionRequest, SubscriptionError } from '../types/subscription';
import { subscriptionMessages } from '../utils/subscriptionMessages';
import { handleSubscriptionError, calculatePagination } from '../utils/subscriptionController';
import { isGlobalAdminRole, isSubscriptionGatingEnforcedRole } from '../constants/authRoles';

export class UserSubscriptionController {
   private subscriptionService: UserSubscriptionService;

   constructor(prisma: PrismaClient) {
      this.subscriptionService = new UserSubscriptionService(prisma);
   }

   private getAuthUser(req: Request): { id: string; role?: string } {
      const authUser = (req as AuthenticatedSubscriptionRequest).user;
      if (!authUser?.id) {
         throw SubscriptionError.unauthorized(subscriptionMessages.error.unauthorized.not_authenticated);
      }
      return authUser;
   }

   private async assertSubscriptionAccess(req: Request, subscriptionId: string): Promise<void> {
      const authUser = this.getAuthUser(req);
      const sub = await this.subscriptionService.getSubscriptionById(subscriptionId);
      if (sub.userId !== authUser.id && !isGlobalAdminRole((req as AuthenticatedSubscriptionRequest).user?.role)) {
         throw SubscriptionError.forbidden(subscriptionMessages.error.forbidden.admin_required);
      }
   }

   createSubscription = async (req: Request, res: Response): Promise<void> => {
      try {
         const authUser = this.getAuthUser(req);
         const body = req.body as CreateUserSubscriptionDto & { userId?: string };
         const targetUserId = body.userId ?? authUser.id;
         if (body.userId && body.userId !== authUser.id) {
            if (!isGlobalAdminRole((req as AuthenticatedSubscriptionRequest).user?.role)) {
               throw SubscriptionError.forbidden(subscriptionMessages.error.forbidden.admin_required);
            }
         }
         const created = await this.subscriptionService.createSubscription({ ...body, userId: targetUserId });
         res.status(201).json({
            message: subscriptionMessages.success.user_subscriptions.created,
            subscription: created,
         });
      } catch (error) {
         handleSubscriptionError(res, error);
      }
   };

   getAllSubscriptions = async (req: Request, res: Response): Promise<void> => {
      try {
         this.getAuthUser(req);
         if (!isGlobalAdminRole((req as AuthenticatedSubscriptionRequest).user?.role)) {
            throw SubscriptionError.forbidden(subscriptionMessages.error.forbidden.admin_required);
         }
         const queryParams: UserSubscriptionQueryParams = {
            page: req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1,
            limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 10,
            sortBy: (req.query['sortBy'] as string) || 'createdAt',
            sortOrder: (req.query['sortOrder'] as 'asc' | 'desc') || 'desc',
         };
         if (req.query['userId']) queryParams.userId = req.query['userId'] as string;
         if (req.query['planId']) queryParams.planId = req.query['planId'] as string;
         const status = req.query['status'] as string | undefined;
         if (status) queryParams.status = status as NonNullable<UserSubscriptionQueryParams['status']>;
         const { subscriptions, totalCount } = await this.subscriptionService.getAllSubscriptions(queryParams);
         res.status(200).json({
            message: subscriptionMessages.success.user_subscriptions.retrieved,
            subscriptions,
            pagination: calculatePagination(queryParams.page!, queryParams.limit!, totalCount),
         });
      } catch (error) {
         handleSubscriptionError(res, error);
      }
   };

   getMySubscription = async (req: Request, res: Response): Promise<void> => {
      try {
         const authUser = this.getAuthUser(req);
         if (!isSubscriptionGatingEnforcedRole(authUser.role)) {
            res.status(200).json({
               message: subscriptionMessages.success.user_subscriptions.retrieved_by_id,
               subscription: null,
            });
            return;
         }
         const sub = await this.subscriptionService.getActiveSubscriptionForUser(authUser.id);
         res.status(200).json({
            message: subscriptionMessages.success.user_subscriptions.retrieved_by_id,
            subscription: sub,
         });
      } catch (error) {
         handleSubscriptionError(res, error);
      }
   };

   getMySubscriptionHistory = async (req: Request, res: Response): Promise<void> => {
      try {
         const authUser = this.getAuthUser(req);
         const queryParams: UserSubscriptionQueryParams = {
            page: req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1,
            limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 10,
            sortBy: (req.query['sortBy'] as string) || 'createdAt',
            sortOrder: (req.query['sortOrder'] as 'asc' | 'desc') || 'desc',
         };
         const { subscriptions, totalCount } = await this.subscriptionService.getSubscriptionsByUserId(
            authUser.id,
            queryParams
         );
         res.status(200).json({
            message: subscriptionMessages.success.user_subscriptions.retrieved,
            subscriptions,
            pagination: calculatePagination(queryParams.page!, queryParams.limit!, totalCount),
         });
      } catch (error) {
         handleSubscriptionError(res, error);
      }
   };

   getMyTier = async (req: Request, res: Response): Promise<void> => {
      try {
         const authUser = this.getAuthUser(req);
         if (!isSubscriptionGatingEnforcedRole(authUser.role)) {
            res.status(200).json({ tier: null });
            return;
         }
         const tier = await this.subscriptionService.getUserHighestActiveTier(authUser.id);
         res.status(200).json({ tier });
      } catch (error) {
         handleSubscriptionError(res, error);
      }
   };

   getSubscriptionsByUser = async (req: Request, res: Response): Promise<void> => {
      try {
         const authUser = this.getAuthUser(req);
         const { userId } = req.params as { userId: string };
         if (userId !== authUser.id && !isGlobalAdminRole((req as AuthenticatedSubscriptionRequest).user?.role)) {
            throw SubscriptionError.forbidden(subscriptionMessages.error.forbidden.admin_required);
         }
         const queryParams: UserSubscriptionQueryParams = {
            page: req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1,
            limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 10,
            sortBy: (req.query['sortBy'] as string) || 'createdAt',
            sortOrder: (req.query['sortOrder'] as 'asc' | 'desc') || 'desc',
         };
         const { subscriptions, totalCount } = await this.subscriptionService.getSubscriptionsByUserId(
            userId,
            queryParams
         );
         res.status(200).json({
            message: subscriptionMessages.success.user_subscriptions.retrieved,
            subscriptions,
            pagination: calculatePagination(queryParams.page!, queryParams.limit!, totalCount),
         });
      } catch (error) {
         handleSubscriptionError(res, error);
      }
   };

   getSubscriptionById = async (req: Request, res: Response): Promise<void> => {
      try {
         const sub = await this.subscriptionService.getSubscriptionById((req.params as { id: string }).id);
         res.status(200).json({
            message: subscriptionMessages.success.user_subscriptions.retrieved_by_id,
            subscription: sub,
         });
      } catch (error) {
         handleSubscriptionError(res, error);
      }
   };

   updateSubscription = async (req: Request, res: Response): Promise<void> => {
      try {
         const updated = await this.subscriptionService.updateSubscription(
            (req.params as { id: string }).id,
            req.body as UpdateUserSubscriptionDto
         );
         res.status(200).json({
            message: subscriptionMessages.success.user_subscriptions.updated,
            subscription: updated,
         });
      } catch (error) {
         handleSubscriptionError(res, error);
      }
   };

   cancelSubscription = async (req: Request, res: Response): Promise<void> => {
      try {
         const updated = await this.subscriptionService.cancelSubscription(
            (req.params as { id: string }).id,
            (req.body || {}) as CancelSubscriptionDto
         );
         res.status(200).json({
            message: subscriptionMessages.success.user_subscriptions.canceled,
            subscription: updated,
         });
      } catch (error) {
         handleSubscriptionError(res, error);
      }
   };

   renewSubscription = async (req: Request, res: Response): Promise<void> => {
      try {
         const id = (req.params as { id: string }).id;
         await this.assertSubscriptionAccess(req, id);
         const updated = await this.subscriptionService.renewSubscription(id);
         res.status(200).json({
            message: subscriptionMessages.success.user_subscriptions.renewed,
            subscription: updated,
         });
      } catch (error) {
         handleSubscriptionError(res, error);
      }
   };

   changeSubscriptionPlan = async (req: Request, res: Response): Promise<void> => {
      try {
         const id = (req.params as { id: string }).id;
         await this.assertSubscriptionAccess(req, id);
         const { planId } = req.body as ChangeSubscriptionPlanDto;
         const result = await this.subscriptionService.changeSubscriptionPlan(id, planId);
         res.status(200).json({
            message: subscriptionMessages.success.user_subscriptions.plan_changed,
            changeType: result.changeType,
            effectiveAt: result.effectiveAt,
            prorationAmount: result.prorationAmount,
            subscription: result.subscription,
         });
      } catch (error) {
         handleSubscriptionError(res, error);
      }
   };

   cancelPendingPlanChange = async (req: Request, res: Response): Promise<void> => {
      try {
         const id = (req.params as { id: string }).id;
         await this.assertSubscriptionAccess(req, id);
         const subscription = await this.subscriptionService.cancelPendingPlanChange(id);
         res.status(200).json({
            message: subscriptionMessages.success.user_subscriptions.pending_change_canceled,
            subscription,
         });
      } catch (error) {
         handleSubscriptionError(res, error);
      }
   };

   deleteSubscription = async (req: Request, res: Response): Promise<void> => {
      try {
         await this.subscriptionService.deleteSubscription((req.params as { id: string }).id);
         res.status(200).json({
            message: subscriptionMessages.success.user_subscriptions.deleted,
            deleted: true,
         });
      } catch (error) {
         handleSubscriptionError(res, error);
      }
   };
}

/**
 * Subscription Renewal Job Worker
 * Runs daily at 12:00 AM UTC (configurable) to renew due auto-renew subscriptions.
 */
import cron, { ScheduledTask } from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { config } from '../config/env';
import { redisService } from '../services/redis';
import { UserSubscriptionService } from '../services/UserSubscriptionService';
import { appLogger } from '../utils/logger';

const LOCK_KEY = 'subscription-renewal-job';
const LOCK_TTL_SECONDS = 3600;

export class SubscriptionRenewalJobWorker {
   private scheduledTask: ScheduledTask | null = null;
   private readonly subscriptionService: UserSubscriptionService;

   constructor(prisma: PrismaClient) {
      this.subscriptionService = new UserSubscriptionService(prisma);
   }

   async start(): Promise<void> {
      if (this.scheduledTask) {
         return;
      }

      if (config.NODE_ENV === 'test' || !config.SUBSCRIPTION_JOBS_ENABLED) {
         return;
      }

      if (!cron.validate(config.SUBSCRIPTION_RENEWAL_CRON)) {
         throw new Error(`Invalid SUBSCRIPTION_RENEWAL_CRON: ${config.SUBSCRIPTION_RENEWAL_CRON}`);
      }

      this.scheduledTask = cron.schedule(
         config.SUBSCRIPTION_RENEWAL_CRON,
         () => {
            void this.runJob();
         },
         { timezone: 'UTC' },
      );

      appLogger.info(
         { cron: config.SUBSCRIPTION_RENEWAL_CRON, timezone: 'UTC' },
         'Subscription renewal job scheduled',
      );
   }

   async stop(): Promise<void> {
      if (this.scheduledTask) {
         this.scheduledTask.stop();
         this.scheduledTask = null;
      }
   }

   async runJob(): Promise<void> {
      const lockAcquired = await redisService.acquireLock(LOCK_KEY, LOCK_TTL_SECONDS);
      if (!lockAcquired) {
         appLogger.info('Subscription renewal job skipped — another instance holds the lock');
         return;
      }

      try {
         appLogger.info('Subscription renewal job started');
         const result = await this.subscriptionService.applyDueSubscriptionRenewals();
         appLogger.info(
            { processed: result.processed, failed: result.failed, errorCount: result.errors.length },
            'Subscription renewal job completed',
         );
      } catch (error) {
         appLogger.error({ err: error }, 'Subscription renewal job failed');
      } finally {
         await redisService.releaseLock(LOCK_KEY);
      }
   }
}

export class SubscriptionRenewalJobWorkerFactory {
   private static worker: SubscriptionRenewalJobWorker | null = null;

   static getWorker(prisma: PrismaClient): SubscriptionRenewalJobWorker {
      if (!SubscriptionRenewalJobWorkerFactory.worker) {
         SubscriptionRenewalJobWorkerFactory.worker = new SubscriptionRenewalJobWorker(prisma);
      }
      return SubscriptionRenewalJobWorkerFactory.worker;
   }

   static async startWorker(prisma: PrismaClient): Promise<void> {
      const worker = SubscriptionRenewalJobWorkerFactory.getWorker(prisma);
      await worker.start();
   }

   static async stopWorker(): Promise<void> {
      if (SubscriptionRenewalJobWorkerFactory.worker) {
         await SubscriptionRenewalJobWorkerFactory.worker.stop();
         SubscriptionRenewalJobWorkerFactory.worker = null;
      }
   }
}

/**
 * Subscription Downgrade Job Worker
 * Runs daily at 12:01 AM UTC (configurable) to apply due pending downgrades.
 */
import cron, { ScheduledTask } from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { config } from '../config/env';
import { redisService } from '../services/redis';
import { UserSubscriptionService } from '../services/UserSubscriptionService';
import { appLogger } from '../utils/logger';

const LOCK_KEY = 'subscription-downgrade-job';
const LOCK_TTL_SECONDS = 3600;

export class SubscriptionDowngradeJobWorker {
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

      if (!cron.validate(config.SUBSCRIPTION_DOWNGRADE_CRON)) {
         throw new Error(`Invalid SUBSCRIPTION_DOWNGRADE_CRON: ${config.SUBSCRIPTION_DOWNGRADE_CRON}`);
      }

      this.scheduledTask = cron.schedule(
         config.SUBSCRIPTION_DOWNGRADE_CRON,
         () => {
            void this.runJob();
         },
         { timezone: 'UTC' },
      );

      appLogger.info(
         { cron: config.SUBSCRIPTION_DOWNGRADE_CRON, timezone: 'UTC' },
         'Subscription downgrade job scheduled',
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
         appLogger.info('Subscription downgrade job skipped — another instance holds the lock');
         return;
      }

      try {
         appLogger.info('Subscription downgrade job started');
         const result = await this.subscriptionService.applyDuePendingDowngrades();
         appLogger.info(
            { processed: result.processed, failed: result.failed, errorCount: result.errors.length },
            'Subscription downgrade job completed',
         );
      } catch (error) {
         appLogger.error({ err: error }, 'Subscription downgrade job failed');
      } finally {
         await redisService.releaseLock(LOCK_KEY);
      }
   }
}

export class SubscriptionDowngradeJobWorkerFactory {
   private static worker: SubscriptionDowngradeJobWorker | null = null;

   static getWorker(prisma: PrismaClient): SubscriptionDowngradeJobWorker {
      if (!SubscriptionDowngradeJobWorkerFactory.worker) {
         SubscriptionDowngradeJobWorkerFactory.worker = new SubscriptionDowngradeJobWorker(prisma);
      }
      return SubscriptionDowngradeJobWorkerFactory.worker;
   }

   static async startWorker(prisma: PrismaClient): Promise<void> {
      const worker = SubscriptionDowngradeJobWorkerFactory.getWorker(prisma);
      await worker.start();
   }

   static async stopWorker(): Promise<void> {
      if (SubscriptionDowngradeJobWorkerFactory.worker) {
         await SubscriptionDowngradeJobWorkerFactory.worker.stop();
         SubscriptionDowngradeJobWorkerFactory.worker = null;
      }
   }
}

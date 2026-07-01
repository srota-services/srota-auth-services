/**
 * Subscription Expiration Job Worker
 * Runs daily at 12:02 AM UTC (configurable) to expire cancel-at-period-end subscriptions.
 */
import cron, { ScheduledTask } from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { config } from '../config/env';
import { redisService } from '../services/redis';
import { UserSubscriptionService } from '../services/UserSubscriptionService';
import { appLogger } from '../utils/logger';

const LOCK_KEY = 'subscription-expiration-job';
const LOCK_TTL_SECONDS = 3600;

export class SubscriptionExpirationJobWorker {
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

      if (!cron.validate(config.SUBSCRIPTION_EXPIRATION_CRON)) {
         throw new Error(`Invalid SUBSCRIPTION_EXPIRATION_CRON: ${config.SUBSCRIPTION_EXPIRATION_CRON}`);
      }

      this.scheduledTask = cron.schedule(
         config.SUBSCRIPTION_EXPIRATION_CRON,
         () => {
            void this.runJob();
         },
         { timezone: 'UTC' },
      );

      appLogger.info(
         { cron: config.SUBSCRIPTION_EXPIRATION_CRON, timezone: 'UTC' },
         'Subscription expiration job scheduled',
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
         appLogger.info('Subscription expiration job skipped — another instance holds the lock');
         return;
      }

      try {
         appLogger.info('Subscription expiration job started');
         const result = await this.subscriptionService.expireDueCanceledSubscriptions();
         appLogger.info(
            { processed: result.processed, failed: result.failed, errorCount: result.errors.length },
            'Subscription expiration job completed',
         );
      } catch (error) {
         appLogger.error({ err: error }, 'Subscription expiration job failed');
      } finally {
         await redisService.releaseLock(LOCK_KEY);
      }
   }
}

export class SubscriptionExpirationJobWorkerFactory {
   private static worker: SubscriptionExpirationJobWorker | null = null;

   static getWorker(prisma: PrismaClient): SubscriptionExpirationJobWorker {
      if (!SubscriptionExpirationJobWorkerFactory.worker) {
         SubscriptionExpirationJobWorkerFactory.worker = new SubscriptionExpirationJobWorker(prisma);
      }
      return SubscriptionExpirationJobWorkerFactory.worker;
   }

   static async startWorker(prisma: PrismaClient): Promise<void> {
      const worker = SubscriptionExpirationJobWorkerFactory.getWorker(prisma);
      await worker.start();
   }

   static async stopWorker(): Promise<void> {
      if (SubscriptionExpirationJobWorkerFactory.worker) {
         await SubscriptionExpirationJobWorkerFactory.worker.stop();
         SubscriptionExpirationJobWorkerFactory.worker = null;
      }
   }
}

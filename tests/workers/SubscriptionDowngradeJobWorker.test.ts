jest.mock('../../src/utils/logger', () => ({
   appLogger: {
      error: jest.fn(),
      info: jest.fn(),
   },
}));

jest.mock('../../src/config/env', () => ({
   config: {
      NODE_ENV: 'development',
      SUBSCRIPTION_JOBS_ENABLED: true,
      SUBSCRIPTION_DOWNGRADE_CRON: '1 0 * * *',
   },
}));

jest.mock('node-cron', () => ({
   validate: jest.fn(() => true),
   schedule: jest.fn(() => ({
      stop: jest.fn(),
   })),
}));

jest.mock('../../src/services/redis', () => ({
   redisService: {
      acquireLock: jest.fn(),
      releaseLock: jest.fn(),
   },
}));

jest.mock('../../src/services/UserSubscriptionService');

import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';
import { SubscriptionDowngradeJobWorker } from '../../src/workers/SubscriptionDowngradeJobWorker';
import { redisService } from '../../src/services/redis';
import { UserSubscriptionService } from '../../src/services/UserSubscriptionService';

describe('SubscriptionDowngradeJobWorker', () => {
   const mockPrisma = {} as PrismaClient;
   let worker: SubscriptionDowngradeJobWorker;
   let mockApplyDue: jest.Mock;

   beforeEach(() => {
      jest.clearAllMocks();
      mockApplyDue = jest.fn().mockResolvedValue({ processed: 2, failed: 0, errors: [] });
      (UserSubscriptionService as jest.Mock).mockImplementation(() => ({
         applyDuePendingDowngrades: mockApplyDue,
      }));
      worker = new SubscriptionDowngradeJobWorker(mockPrisma);
   });

   it('invokes applyDuePendingDowngrades when lock is acquired', async () => {
      (redisService.acquireLock as jest.Mock).mockResolvedValue(true);

      await worker.runJob();

      expect(mockApplyDue).toHaveBeenCalledTimes(1);
      expect(redisService.releaseLock).toHaveBeenCalledWith('subscription-downgrade-job');
   });

   it('skips processing when lock is not acquired', async () => {
      (redisService.acquireLock as jest.Mock).mockResolvedValue(false);

      await worker.runJob();

      expect(mockApplyDue).not.toHaveBeenCalled();
      expect(redisService.releaseLock).not.toHaveBeenCalled();
   });

   it('does not schedule when SUBSCRIPTION_JOBS_ENABLED is false', async () => {
      const { config } = await import('../../src/config/env');
      (config as { SUBSCRIPTION_JOBS_ENABLED: boolean }).SUBSCRIPTION_JOBS_ENABLED = false;

      const disabledWorker = new SubscriptionDowngradeJobWorker(mockPrisma);
      await disabledWorker.start();

      expect(cron.schedule).not.toHaveBeenCalled();
   });
});

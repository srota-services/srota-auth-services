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
      SUBSCRIPTION_RENEWAL_CRON: '0 0 * * *',
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
import { SubscriptionRenewalJobWorker } from '../../src/workers/SubscriptionRenewalJobWorker';
import { redisService } from '../../src/services/redis';
import { UserSubscriptionService } from '../../src/services/UserSubscriptionService';

describe('SubscriptionRenewalJobWorker', () => {
   const mockPrisma = {} as PrismaClient;
   let worker: SubscriptionRenewalJobWorker;
   let mockRenew: jest.Mock;

   beforeEach(() => {
      jest.clearAllMocks();
      mockRenew = jest.fn().mockResolvedValue({ processed: 2, failed: 0, errors: [] });
      (UserSubscriptionService as jest.Mock).mockImplementation(() => ({
         applyDueSubscriptionRenewals: mockRenew,
      }));
      worker = new SubscriptionRenewalJobWorker(mockPrisma);
   });

   it('runs applyDueSubscriptionRenewals when lock is acquired', async () => {
      (redisService.acquireLock as jest.Mock).mockResolvedValue(true);

      await worker.runJob();

      expect(mockRenew).toHaveBeenCalledTimes(1);
      expect(redisService.releaseLock).toHaveBeenCalledWith('subscription-renewal-job');
   });

   it('skips processing when lock is not acquired', async () => {
      (redisService.acquireLock as jest.Mock).mockResolvedValue(false);

      await worker.runJob();

      expect(mockRenew).not.toHaveBeenCalled();
      expect(redisService.releaseLock).not.toHaveBeenCalled();
   });

   it('does not schedule when SUBSCRIPTION_JOBS_ENABLED is false', async () => {
      const { config } = await import('../../src/config/env');
      (config as { SUBSCRIPTION_JOBS_ENABLED: boolean }).SUBSCRIPTION_JOBS_ENABLED = false;

      const disabledWorker = new SubscriptionRenewalJobWorker(mockPrisma);
      await disabledWorker.start();

      expect(cron.schedule).not.toHaveBeenCalled();
   });
});

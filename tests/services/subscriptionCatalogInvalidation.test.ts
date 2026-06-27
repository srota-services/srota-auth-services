jest.mock('../../src/services/DomainEventPublisher', () => ({
   emitCacheInvalidation: jest.fn(),
}));

jest.mock('../../src/services/rabbitmq', () => ({
   rabbitmqService: {
      publishSubscriptionChanged: jest.fn().mockResolvedValue(undefined),
   },
}));

import { emitCacheInvalidation } from '../../src/services/DomainEventPublisher';
import { rabbitmqService } from '../../src/services/rabbitmq';
import { emitSubscriptionCatalogInvalidation } from '../../src/services/subscriptionCatalogInvalidation';

describe('emitSubscriptionCatalogInvalidation', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('emits subscription-catalog cache invalidation and publishes RabbitMQ message', () => {
      const params = {
         userId: 'user-1',
         subscriptionId: 'sub-1',
         planId: 'plan-1',
         action: 'created' as const,
      };

      emitSubscriptionCatalogInvalidation(params);

      expect(emitCacheInvalidation).toHaveBeenCalledWith(
         'subscription-catalog',
         'created',
         'sub-1',
         { userId: 'user-1', planId: 'plan-1' },
      );
      expect(rabbitmqService.publishSubscriptionChanged).toHaveBeenCalledWith(params);
   });
});

jest.mock('../../src/services/DomainEventPublisher', () => ({
   emitCacheInvalidation: jest.fn(),
}));

jest.mock('../../src/services/rabbitmq', () => ({
   rabbitmqService: {
      publishSubscriptionGatingChanged: jest.fn().mockResolvedValue(undefined),
   },
}));

import { emitCacheInvalidation } from '../../src/services/DomainEventPublisher';
import { rabbitmqService } from '../../src/services/rabbitmq';
import { emitSubscriptionGatingInvalidation } from '../../src/services/subscriptionGatingInvalidation';

describe('emitSubscriptionGatingInvalidation (auth)', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('emits subscription-gating cache invalidation and publishes RabbitMQ message', () => {
      emitSubscriptionGatingInvalidation({ action: 'updated', planId: 'plan-1' });

      expect(emitCacheInvalidation).toHaveBeenCalledWith(
         'subscription-gating',
         'updated',
         'plan-1',
         { planId: 'plan-1' },
      );
      expect(rabbitmqService.publishSubscriptionGatingChanged).toHaveBeenCalledWith({
         action: 'updated',
         planId: 'plan-1',
      });
   });
});

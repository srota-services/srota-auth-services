import { DomainAction } from '../types/domainCacheEvents';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { rabbitmqService } from './rabbitmq';

export function emitSubscriptionGatingInvalidation(params: {
   action: DomainAction;
   planId: string;
}): void {
   emitCacheInvalidation('subscription-gating', params.action, params.planId, {
      planId: params.planId,
   });
   void rabbitmqService.publishSubscriptionGatingChanged(params).catch(() => {});
}

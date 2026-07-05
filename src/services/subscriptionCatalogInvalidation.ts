import { DomainAction } from '../types/domainCacheEvents';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { rabbitmqService } from './rabbitmq';

export function emitSubscriptionCatalogInvalidation(params: {
   userId: string;
   subscriptionId: string;
   planId: string;
   action: DomainAction;
}): void {
   emitCacheInvalidation('subscription-catalog', params.action, params.subscriptionId, {
      userId: params.userId,
      planId: params.planId,
   });
   void rabbitmqService.publishSubscriptionChanged(params).catch(() => {});
}

export type DomainAction = 'created' | 'updated' | 'deleted';

export type AuthDomainResource =
   | 'user'
   | 'user-profile'
   | 'author'
   | 'organization'
   | 'organization-member'
   | 'author-organization-invitation'
   | 'author-organization-collaboration'
   | 'subscription-plan'
   | 'user-subscription'
   | 'subscription-catalog'
   | 'subscription-gating'
   | 'user-device';

export interface CacheInvalidateEvent {
   version: 1;
   service: 'auth';
   resource: AuthDomainResource;
   action: DomainAction;
   id: string;
   queryKeys: string[][];
   relatedIds?: Record<string, string>;
   timestamp: string;
}

export const CACHE_INVALIDATE_SSE_EVENT = 'cache-invalidate';

export const AUTH_SSE_REDIS_CHANNEL = 'sse:auth:cache-events';

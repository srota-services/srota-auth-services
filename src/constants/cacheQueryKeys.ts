import {
   AuthDomainResource,
   CacheInvalidateEvent,
   DomainAction,
} from '../types/domainCacheEvents';

export type AuthRelatedIds = Record<string, string>;

function uniqueKeys(keys: string[][]): string[][] {
   const seen = new Set<string>();
   return keys.filter((key) => {
      const serialized = JSON.stringify(key);
      if (seen.has(serialized)) {
         return false;
      }
      seen.add(serialized);
      return true;
   });
}

function keysForResource(
   resource: AuthDomainResource,
   id: string,
   relatedIds: AuthRelatedIds,
): string[][] {
   switch (resource) {
      case 'user':
         return [['users'], ['users', id]];
      case 'user-profile':
         return [['user-profile'], ['user-profile', 'me']];
      case 'author':
         return [['authors'], ['authors', id], ['authors', 'me']];
      case 'organization':
         return [['organizations'], ['organizations', id]];
      case 'organization-member': {
         const orgId = relatedIds['organizationId'] ?? id;
         return [
            ['organizations', orgId, 'members'],
            ['organizations', orgId],
            ['organizations'],
         ];
      }
      case 'author-organization-invitation': {
         const orgId = relatedIds['organizationId'];
         const authorId = relatedIds['authorId'];
         const keys: string[][] = [['author-organization-invitations']];
         if (orgId) {
            keys.push(
               ['organizations', orgId, 'author-invitations'],
               ['organizations', orgId, 'authors'],
               ['organizations', orgId],
            );
         }
         if (authorId) {
            keys.push(['authors', authorId, 'organization-invitations']);
         }
         keys.push(['authors', 'me', 'organization-invitations']);
         return keys;
      }
      case 'subscription-plan':
         return [['subscription-plans'], ['subscription-plans', id]];
      case 'user-subscription':
         return [['subscriptions'], ['subscriptions', 'me'], ['subscriptions', id]];
      case 'subscription-catalog':
         return [
            ['subscriptions'],
            ['subscriptions', 'me'],
            ['audiobooks'],
            ['user-audiobooks'],
            ['user-audiobooks', 'me'],
         ];
      case 'user-device':
         return [['devices'], ['devices', id]];
      default:
         return [[resource], [resource, id]];
   }
}

export function buildCacheInvalidationEvent(
   resource: AuthDomainResource,
   action: DomainAction,
   id: string,
   relatedIds?: AuthRelatedIds,
): CacheInvalidateEvent {
   const resolvedRelatedIds = relatedIds ?? {};
   return {
      version: 1,
      service: 'auth',
      resource,
      action,
      id,
      queryKeys: uniqueKeys(keysForResource(resource, id, resolvedRelatedIds)),
      ...(Object.keys(resolvedRelatedIds).length > 0 ? { relatedIds: resolvedRelatedIds } : {}),
      timestamp: new Date().toISOString(),
   };
}

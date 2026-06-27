import { buildCacheInvalidationEvent } from '../../src/constants/cacheQueryKeys';

describe('buildCacheInvalidationEvent (auth)', () => {
   it('builds organization updated keys', () => {
      const event = buildCacheInvalidationEvent('organization', 'updated', 'org-1');

      expect(event.service).toBe('auth');
      expect(event.version).toBe(1);
      expect(event.queryKeys).toEqual(
         expect.arrayContaining([
            ['organizations'],
            ['organizations', 'org-1'],
         ]),
      );
   });

   it('builds organization-member removed keys with parent org', () => {
      const event = buildCacheInvalidationEvent('organization-member', 'deleted', 'mem-1', {
         organizationId: 'org-1',
      });

      expect(event.queryKeys).toEqual(
         expect.arrayContaining([
            ['organizations', 'org-1', 'members'],
            ['organizations', 'org-1'],
            ['organizations'],
         ]),
      );
   });

   it('builds user-subscription keys including me', () => {
      const event = buildCacheInvalidationEvent('user-subscription', 'updated', 'sub-1');

      expect(event.queryKeys).toEqual(
         expect.arrayContaining([
            ['subscriptions'],
            ['subscriptions', 'me'],
            ['subscriptions', 'sub-1'],
         ]),
      );
   });

   it('builds subscription-catalog keys including subscriptions and audiobooks', () => {
      const event = buildCacheInvalidationEvent('subscription-catalog', 'updated', 'sub-1', {
         userId: 'user-1',
         planId: 'plan-1',
      });

      expect(event.queryKeys).toEqual(
         expect.arrayContaining([
            ['subscriptions'],
            ['subscriptions', 'me'],
            ['audiobooks'],
            ['user-audiobooks'],
            ['user-audiobooks', 'me'],
         ]),
      );
      expect(event.relatedIds).toEqual({ userId: 'user-1', planId: 'plan-1' });
   });

   it('builds subscription-gating keys including plans and catalog', () => {
      const event = buildCacheInvalidationEvent('subscription-gating', 'updated', 'plan-1', {
         planId: 'plan-1',
      });

      expect(event.queryKeys).toEqual(
         expect.arrayContaining([
            ['subscription-plans'],
            ['subscription-plans', 'plan-1'],
            ['audiobooks'],
            ['user-audiobooks'],
            ['user-audiobooks', 'me'],
         ]),
      );
   });
});

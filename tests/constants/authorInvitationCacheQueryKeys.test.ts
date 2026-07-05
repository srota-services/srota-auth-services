import { buildCacheInvalidationEvent } from '../../src/constants/cacheQueryKeys';

describe('buildCacheInvalidationEvent author-organization-invitation', () => {
   it('builds invitation keys for organization and author views', () => {
      const event = buildCacheInvalidationEvent('author-organization-invitation', 'updated', 'inv-1', {
         organizationId: 'org-1',
         authorId: 'author-1',
      });

      expect(event.queryKeys).toEqual(
         expect.arrayContaining([
            ['author-organization-invitations'],
            ['organizations', 'org-1', 'author-invitations'],
            ['organizations', 'org-1', 'authors'],
            ['authors', 'author-1', 'organization-invitations'],
            ['authors', 'me', 'organization-invitations'],
         ]),
      );
   });
});

jest.mock('../../src/services/DomainEventPublisher', () => ({
   emitCacheInvalidation: jest.fn(),
}));

import { emitCacheInvalidation } from '../../src/services/DomainEventPublisher';
import { ChapterGatingConsumerWorker } from '../../src/workers/ChapterGatingConsumerWorker';

describe('ChapterGatingConsumerWorker', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('emits auth subscription-gating cache invalidation for chapter tier changes', async () => {
      const worker = new ChapterGatingConsumerWorker();

      await (worker as any).handleChapterGatingChangedMessage({
         chapterId: 'ch-1',
         audiobookId: 'ab-1',
         action: 'updated',
      });

      expect(emitCacheInvalidation).toHaveBeenCalledWith(
         'subscription-gating',
         'updated',
         'ch-1',
         { audiobookId: 'ab-1', chapterId: 'ch-1' },
      );
   });
});

/**
 * Chapter Gating Consumer Worker
 * Consumes chapter minSubscriptionTier changes from app-service and emits auth SSE cache invalidation
 */
import { rabbitmqService } from '../services/rabbitmq';
import { emitCacheInvalidation } from '../services/DomainEventPublisher';
import { ChapterGatingChangedMessage } from '../types/chapter-events';

export class ChapterGatingConsumerWorker {
   private isRunning = false;

   async start(): Promise<void> {
      if (this.isRunning) {
         return;
      }

      await rabbitmqService.consumeChapterGatingChangedMessages(
         this.handleChapterGatingChangedMessage.bind(this),
      );

      this.isRunning = true;
   }

   async stop(): Promise<void> {
      if (!this.isRunning) {
         return;
      }

      await rabbitmqService.stopConsumingChapterGatingChangedMessages();
      this.isRunning = false;
   }

   private async handleChapterGatingChangedMessage(
      message: ChapterGatingChangedMessage,
   ): Promise<void> {
      if (!message.chapterId || typeof message.chapterId !== 'string') {
         throw new Error('Invalid message: chapterId is required and must be a string');
      }
      if (!message.audiobookId || typeof message.audiobookId !== 'string') {
         throw new Error('Invalid message: audiobookId is required and must be a string');
      }
      if (!message.action || !['created', 'updated', 'deleted'].includes(message.action)) {
         throw new Error('Invalid message: action must be created, updated, or deleted');
      }

      console.log('[auth-service] SSE chapter subscription tier cache-invalidate emitted', {
         resource: 'subscription-gating',
         action: message.action,
         chapterId: message.chapterId,
         audiobookId: message.audiobookId,
      });

      emitCacheInvalidation('subscription-gating', message.action, message.chapterId, {
         audiobookId: message.audiobookId,
         chapterId: message.chapterId,
      });
   }
}

export class ChapterGatingConsumerWorkerFactory {
   private static worker: ChapterGatingConsumerWorker | null = null;

   static getWorker(): ChapterGatingConsumerWorker {
      if (!ChapterGatingConsumerWorkerFactory.worker) {
         ChapterGatingConsumerWorkerFactory.worker = new ChapterGatingConsumerWorker();
      }
      return ChapterGatingConsumerWorkerFactory.worker;
   }

   static async startWorker(): Promise<void> {
      const worker = ChapterGatingConsumerWorkerFactory.getWorker();
      await worker.start();
   }

   static async stopWorker(): Promise<void> {
      if (ChapterGatingConsumerWorkerFactory.worker) {
         await ChapterGatingConsumerWorkerFactory.worker.stop();
         ChapterGatingConsumerWorkerFactory.worker = null;
      }
   }
}

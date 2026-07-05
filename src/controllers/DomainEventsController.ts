import { Request, Response } from 'express';
import { DomainEventPublisher } from '../services/DomainEventPublisher';
import {
   CACHE_INVALIDATE_SSE_EVENT,
   CacheInvalidateEvent,
} from '../types/domainCacheEvents';
import { appLogger, sseLogger } from '../utils/logger';

const HEARTBEAT_MS = 30_000;

export class DomainEventsController {
   private readonly eventPublisher = DomainEventPublisher.getInstance();

   /**
    * @swagger
    * /auth/events/stream:
    *   get:
    *     summary: SSE stream for auth-service cache-invalidation events
    *     description: |
    *       Authenticated broadcast stream. Each `cache-invalidate` event includes `queryKeys` for TanStack Query.
    *       Browser clients may pass `?access_token=<jwt>` because EventSource cannot send Authorization headers.
    *
    *       ```javascript
    *       const source = new EventSource('/auth/events/stream?access_token=' + token);
    *       source.addEventListener('cache-invalidate', (e) => {
    *         const { queryKeys } = JSON.parse(e.data);
    *         for (const key of queryKeys) queryClient.invalidateQueries({ queryKey: key });
    *       });
    *       ```
    *     tags: [Events]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - in: query
    *         name: access_token
    *         schema: { type: string }
    *         description: JWT access token (alternative to Authorization header for EventSource)
    *     responses:
    *       200:
    *         description: 'SSE stream (event cache-invalidate, comment heartbeats every 30s)'
    *         content:
    *           text/event-stream:
    *             schema:
    *               type: string
    *       401:
    *         $ref: '#/components/responses/Unauthorized'
    */
   streamCacheEvents = async (req: Request, res: Response): Promise<void> => {
      const userId = (req as Request & { user?: { id: string } }).user?.id;
      if (!userId) {
         res.status(401).json({ error: 'Authentication required' });
         return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const channel = DomainEventPublisher.channel();
      const subscriber = this.eventPublisher.createSubscriber();

      const onMessage = (message: string): void => {
         try {
            const event = JSON.parse(message) as CacheInvalidateEvent;
            sseLogger.info(
               {
                  direction: 'subscribed',
                  channel,
                  userId,
                  resource: event.resource,
                  action: event.action,
                  id: event.id,
                  queryKeyCount: event.queryKeys.length,
               },
               'SSE cache-invalidate event forwarded to client',
            );
            res.write(`event: ${CACHE_INVALIDATE_SSE_EVENT}\n`);
            res.write(`data: ${JSON.stringify(event)}\n\n`);
         } catch (error) {
            sseLogger.warn({ err: error, channel, userId }, 'Invalid SSE cache-invalidate message');
            appLogger.warn({ err: error, channel }, 'Invalid domain SSE message');
         }
      };

      await subscriber.connect();
      await subscriber.subscribe(channel, onMessage);
      sseLogger.info({ direction: 'subscribed', channel, userId }, 'SSE client subscribed to cache-invalidate stream');

      const heartbeat = setInterval(() => {
         res.write(': heartbeat\n\n');
      }, HEARTBEAT_MS);

      const cleanup = (): void => {
         clearInterval(heartbeat);
         sseLogger.info({ direction: 'subscribed', channel, userId }, 'SSE client unsubscribed from cache-invalidate stream');
         void subscriber.unsubscribe(channel).catch(() => undefined);
         void subscriber.quit().catch(() => undefined);
      };

      res.on('close', cleanup);
      res.on('error', cleanup);
   };
}

export const domainEventsController = new DomainEventsController();

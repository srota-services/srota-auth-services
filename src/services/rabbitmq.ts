import amqp from 'amqplib';
import { config } from '../config/env';
import { rabbitmqLogger } from '../utils/logger';

/**
 * RabbitMQ service for publishing events
 */
export class RabbitMQService {
   private connection: any = null;
   private channel: any = null;
   private isConnected: boolean = false;
   private chapterGatingConsumerTag: string | null = null;

   private static readonly CHAPTERS_EXCHANGE = 'chapters';
   private static readonly CHAPTER_GATING_QUEUE = 'auth.chapters.gating.changed';
   private static readonly CHAPTER_GATING_ROUTING_KEY = 'chapter.gating.changed';

   constructor() {
      // Constructor is empty - initialization happens in connect()
   }

   /**
    * Connect to RabbitMQ and set up exchange
    */
   async connect(): Promise<void> {
      try {
         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.info('Connecting to RabbitMQ...');
         }

         // Connect to RabbitMQ
         this.connection = await amqp.connect(config.RABBITMQ_URL);
         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.info('Connected to RabbitMQ');
         }

         // Create channel
         this.channel = await this.connection.createChannel();
         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.info('Created RabbitMQ channel');
         }

         // Set up exchange (topic exchange for routing)
         await this.channel.assertExchange(config.RABBITMQ_EXCHANGE, 'topic', {
            durable: true, // Exchange survives broker restarts
         });
         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.info({ exchange: config.RABBITMQ_EXCHANGE }, 'Exchange asserted');
         }

         await this.channel.assertExchange(config.RABBITMQ_AUTHORS_EXCHANGE, 'topic', {
            durable: true,
         });
         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.info({ exchange: config.RABBITMQ_AUTHORS_EXCHANGE }, 'Authors exchange asserted');
         }

         await this.channel.assertExchange(config.RABBITMQ_ORGANIZATIONS_EXCHANGE, 'topic', {
            durable: true,
         });
         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.info({ exchange: config.RABBITMQ_ORGANIZATIONS_EXCHANGE }, 'Organizations exchange asserted');
         }

         await this.setupChapterGatingConsumerQueue();

         this.isConnected = true;

         // Handle connection close
         this.connection.on('close', () => {
            if (config.NODE_ENV !== 'test') {
               rabbitmqLogger.info('RabbitMQ connection closed');
            }
            this.isConnected = false;
         });

         this.connection.on('error', (err: unknown) => {
            if (config.NODE_ENV !== 'test') {
               rabbitmqLogger.error({ err }, 'RabbitMQ connection error');
            }
            this.isConnected = false;
         });

      } catch (error) {
         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.error({ err: error }, 'Failed to connect to RabbitMQ');
         }
         this.isConnected = false;
         throw error;
      }
   }

   /**
    * Disconnect from RabbitMQ
    */
   async disconnect(): Promise<void> {
      try {
         if (this.channel) {
            await this.channel.close();
            this.channel = null;
         }

         if (this.connection) {
            await this.connection.close();
            this.connection = null;
         }

         this.isConnected = false;
         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.info('Disconnected from RabbitMQ');
         }
      } catch (error) {
         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.error({ err: error }, 'Error disconnecting from RabbitMQ');
         }
      }
   }

   /**
    * Check if service is connected
    */
   isServiceConnected(): boolean {
      return this.isConnected && this.connection !== null && this.channel !== null;
   }

   /**
    * Health check — verifies the exchange is reachable on the open channel
    */
   async healthCheck(): Promise<boolean> {
      if (!this.isServiceConnected()) {
         return false;
      }

      try {
         await this.channel.checkExchange(config.RABBITMQ_EXCHANGE);
         await this.channel.checkExchange(config.RABBITMQ_AUTHORS_EXCHANGE);
         await this.channel.checkExchange(config.RABBITMQ_ORGANIZATIONS_EXCHANGE);
         return true;
      } catch {
         return false;
      }
   }

   /**
    * Publish user created event
    */
   async publishUserCreated(data: { userId: string }): Promise<void> {
      if (!this.isServiceConnected()) {
         throw new Error('RabbitMQ service is not connected');
      }

      try {
         const message = JSON.stringify({ userId: data.userId });
         const routingKey = 'user.created';

         const published = this.channel!.publish(
            config.RABBITMQ_EXCHANGE,
            routingKey,
            Buffer.from(message),
            {
               persistent: true, // Message survives broker restarts
               timestamp: Date.now(),
            }
         );

         if (!published) {
            throw new Error('Failed to publish message to RabbitMQ');
         }

         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.info({ userId: data.userId, routingKey }, 'Published user.created event');
         }
      } catch (error) {
         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.error({ err: error, userId: data.userId }, 'Error publishing user created event');
         }
         throw error;
      }
   }

   /**
    * Publish author created event
    */
   async publishAuthorCreated(data: { authorId: string; avatar?: string }): Promise<void> {
      if (!this.isServiceConnected()) {
         throw new Error('RabbitMQ service is not connected');
      }

      try {
         const messageData: { authorId: string; avatar?: string } = {
            authorId: data.authorId,
         };

         if (data.avatar !== undefined) {
            messageData.avatar = data.avatar;
         }

         const message = JSON.stringify(messageData);
         const routingKey = 'author.created';

         const published = this.channel!.publish(
            config.RABBITMQ_AUTHORS_EXCHANGE,
            routingKey,
            Buffer.from(message),
            {
               persistent: true,
               timestamp: Date.now(),
            }
         );

         if (!published) {
            throw new Error('Failed to publish message to RabbitMQ');
         }

         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.info({ authorId: data.authorId, routingKey }, 'Published author.created event');
         }
      } catch (error) {
         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.error({ err: error, authorId: data.authorId }, 'Error publishing author created event');
         }
         throw error;
      }
   }

   /**
    * Publish author deleted event
    */
   async publishAuthorDeleted(data: { authorId: string; userId: string }): Promise<void> {
      if (!this.isServiceConnected()) {
         throw new Error('RabbitMQ service is not connected');
      }

      try {
         const message = JSON.stringify({ authorId: data.authorId, userId: data.userId });
         const routingKey = 'author.deleted';

         const published = this.channel!.publish(
            config.RABBITMQ_AUTHORS_EXCHANGE,
            routingKey,
            Buffer.from(message),
            {
               persistent: true,
               timestamp: Date.now(),
            }
         );

         if (!published) {
            throw new Error('Failed to publish message to RabbitMQ');
         }

         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.info({ authorId: data.authorId, routingKey }, 'Published author.deleted event');
         }
      } catch (error) {
         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.error({ err: error, authorId: data.authorId }, 'Error publishing author deleted event');
         }
         throw error;
      }
   }

   /**
    * Publish organization deleted event
    */
   async publishOrganizationDeleted(data: { organizationId: string }): Promise<void> {
      if (!this.isServiceConnected()) {
         throw new Error('RabbitMQ service is not connected');
      }

      try {
         const message = JSON.stringify({ organizationId: data.organizationId });
         const routingKey = 'organization.deleted';

         const published = this.channel!.publish(
            config.RABBITMQ_ORGANIZATIONS_EXCHANGE,
            routingKey,
            Buffer.from(message),
            {
               persistent: true,
               timestamp: Date.now(),
            }
         );

         if (!published) {
            throw new Error('Failed to publish message to RabbitMQ');
         }

         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.info({ organizationId: data.organizationId, routingKey }, 'Published organization.deleted event');
         }
      } catch (error) {
         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.error({ err: error, organizationId: data.organizationId }, 'Error publishing organization deleted event');
         }
         throw error;
      }
   }

   /**
    * Publish subscription changed event (effective tier/access change)
    */
   async publishSubscriptionChanged(data: {
      userId: string;
      subscriptionId: string;
      planId: string;
      action: string;
   }): Promise<void> {
      if (!this.isServiceConnected()) {
         throw new Error('RabbitMQ service is not connected');
      }

      try {
         const message = JSON.stringify({
            userId: data.userId,
            subscriptionId: data.subscriptionId,
            planId: data.planId,
            action: data.action,
         });
         const routingKey = 'user.subscription.changed';

         const published = this.channel!.publish(
            config.RABBITMQ_EXCHANGE,
            routingKey,
            Buffer.from(message),
            {
               persistent: true,
               timestamp: Date.now(),
            }
         );

         if (!published) {
            throw new Error('Failed to publish message to RabbitMQ');
         }

         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.info(
               { userId: data.userId, subscriptionId: data.subscriptionId, routingKey },
               'Published user.subscription.changed event',
            );
         }
      } catch (error) {
         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.error(
               { err: error, userId: data.userId, subscriptionId: data.subscriptionId },
               'Error publishing user.subscription.changed event',
            );
         }
         throw error;
      }
   }

   /**
    * Publish subscription gating changed event (plan tier definition change)
    */
   async publishSubscriptionGatingChanged(data: {
      action: string;
      planId: string;
   }): Promise<void> {
      if (!this.isServiceConnected()) {
         throw new Error('RabbitMQ service is not connected');
      }

      try {
         const message = JSON.stringify({
            action: data.action,
            planId: data.planId,
         });
         const routingKey = 'subscription.gating.changed';

         const published = this.channel!.publish(
            config.RABBITMQ_EXCHANGE,
            routingKey,
            Buffer.from(message),
            {
               persistent: true,
               timestamp: Date.now(),
            }
         );

         if (!published) {
            throw new Error('Failed to publish message to RabbitMQ');
         }

         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.info(
               { planId: data.planId, routingKey },
               'Published subscription.gating.changed event',
            );
         }
      } catch (error) {
         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.error(
               { err: error, planId: data.planId },
               'Error publishing subscription.gating.changed event',
            );
         }
         throw error;
      }
   }

   /**
    * Publish user deleted event (stub for future user delete API)
    */
   async publishUserDeleted(data: { userId: string; authorId?: string }): Promise<void> {
      if (!this.isServiceConnected()) {
         throw new Error('RabbitMQ service is not connected');
      }

      try {
         const messageData: { userId: string; authorId?: string } = { userId: data.userId };
         if (data.authorId !== undefined) {
            messageData.authorId = data.authorId;
         }

         const message = JSON.stringify(messageData);
         const routingKey = 'user.deleted';

         const published = this.channel!.publish(
            config.RABBITMQ_EXCHANGE,
            routingKey,
            Buffer.from(message),
            {
               persistent: true,
               timestamp: Date.now(),
            }
         );

         if (!published) {
            throw new Error('Failed to publish message to RabbitMQ');
         }

         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.info({ userId: data.userId, routingKey }, 'Published user.deleted event');
         }
      } catch (error) {
         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.error({ err: error, userId: data.userId }, 'Error publishing user deleted event');
         }
         throw error;
      }
   }

   /**
    * Assert chapters exchange and queue for chapter gating events from app-service
    */
   private async setupChapterGatingConsumerQueue(): Promise<void> {
      await this.channel.assertExchange(RabbitMQService.CHAPTERS_EXCHANGE, 'topic', {
         durable: true,
      });

      await this.channel.assertQueue(RabbitMQService.CHAPTER_GATING_QUEUE, {
         durable: true,
      });

      await this.channel.bindQueue(
         RabbitMQService.CHAPTER_GATING_QUEUE,
         RabbitMQService.CHAPTERS_EXCHANGE,
         RabbitMQService.CHAPTER_GATING_ROUTING_KEY,
      );
   }

   /**
    * Consume chapter gating changed messages from app-service
    */
   async consumeChapterGatingChangedMessages(
      onMessage: (message: {
         chapterId: string;
         audiobookId: string;
         action: 'created' | 'updated' | 'deleted';
      }) => Promise<void>,
   ): Promise<void> {
      if (!this.isServiceConnected()) {
         throw new Error('RabbitMQ service is not connected');
      }

      await this.channel.prefetch(1);

      const consumeResult = await this.channel.consume(
         RabbitMQService.CHAPTER_GATING_QUEUE,
         async (msg: any) => {
            if (!msg) {
               return;
            }

            try {
               const messageContent = JSON.parse(msg.content.toString());
               await onMessage(messageContent);
               this.channel!.ack(msg);
            } catch (error) {
               if (config.NODE_ENV !== 'test') {
                  rabbitmqLogger.error({ err: error }, 'Error processing chapter gating changed message');
               }
               this.channel!.ack(msg);
            }
         },
         { noAck: false },
      );

      this.chapterGatingConsumerTag = consumeResult.consumerTag;

      if (config.NODE_ENV !== 'test') {
         rabbitmqLogger.info(
            { queue: RabbitMQService.CHAPTER_GATING_QUEUE },
            'Started consuming chapter gating changed messages',
         );
      }
   }

   /**
    * Stop consuming chapter gating changed messages
    */
   async stopConsumingChapterGatingChangedMessages(): Promise<void> {
      if (!this.channel || !this.chapterGatingConsumerTag) {
         return;
      }

      try {
         await this.channel.cancel(this.chapterGatingConsumerTag);
         this.chapterGatingConsumerTag = null;
      } catch (error) {
         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.error({ err: error }, 'Error stopping chapter gating changed message consumer');
         }
      }
   }

   /**
    * Publish generic event (for future extensibility)
    */
   async publishEvent(routingKey: string, data: any): Promise<void> {
      if (!this.isServiceConnected()) {
         throw new Error('RabbitMQ service is not connected');
      }

      try {
         const message = JSON.stringify(data);

         const published = this.channel!.publish(
            config.RABBITMQ_EXCHANGE,
            routingKey,
            Buffer.from(message),
            {
               persistent: true,
               timestamp: Date.now(),
            }
         );

         if (!published) {
            throw new Error('Failed to publish message to RabbitMQ');
         }

         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.info({ routingKey }, 'Published event');
         }
      } catch (error) {
         if (config.NODE_ENV !== 'test') {
            rabbitmqLogger.error({ err: error, routingKey }, 'Error publishing event');
         }
         throw error;
      }
   }
}

// Export singleton instance
export const rabbitmqService = new RabbitMQService();

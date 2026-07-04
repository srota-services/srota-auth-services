import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { config } from './config/env';
import authRoutes from './routes/auth';
import subscriptionPlanRoutes from './routes/subscriptionPlan';
import userSubscriptionRoutes from './routes/userSubscription';
import { createOrganizationRoutes } from './routes/organizationRoutes';
import { OrganizationController } from './controllers/OrganizationController';
import { createAuthorRoutes } from './routes/authorRoutes';
import { createCatalogRoutes } from './routes/catalogRoutes';
import { createDomainEventsRoutes } from './routes/domainEventsRoutes';
import {
   errorHandler,
   notFound,
   requestLogger,
   corsOptions,
   securityHeaders,
   authenticateToken,
} from './middleware';
import { redisService } from './services/redis';
import { rabbitmqService } from './services/rabbitmq';
import { getDependencyHealth, isDependencyHealthOk } from './services/health';
import { requireHealthSupportAuth } from './middleware/healthSupportAuth';
import { appLogger } from './utils/logger';
import { setupSwagger } from './config/swagger';
import { ChapterGatingConsumerWorkerFactory } from './workers/ChapterGatingConsumerWorker';
import { SubscriptionDowngradeJobWorkerFactory } from './workers/SubscriptionDowngradeJobWorker';
import { SubscriptionRenewalJobWorkerFactory } from './workers/SubscriptionRenewalJobWorker';
import { SubscriptionExpirationJobWorkerFactory } from './workers/SubscriptionExpirationJobWorker';

/**
 * Create and configure Express application
 */
export const createApp = (): express.Application => {
   const app = express();
   const prisma = new PrismaClient();

   // Express trust proxy hop count (see TRUST_PROXY in env). Required behind nginx for
   // express-rate-limit (X-Forwarded-For) and secure cookies over HTTPS.
   if (config.TRUST_PROXY > 0) {
      app.set('trust proxy', config.TRUST_PROXY);
   }

   // Security middleware
   app.use(helmet());
   app.use(securityHeaders);

   // CORS configuration
   app.use(cors(corsOptions));

   // Body parsing middleware
   app.use(express.json({ limit: '10mb' }));
   app.use(express.urlencoded({ extended: true, limit: '10mb' }));
   app.use(cookieParser());

   // Request logging
   app.use(requestLogger);

   if (config.NODE_ENV === 'development') {
      app.use('/uploads', express.static(path.join(process.cwd(), 'src', 'uploads')));
   }

   // Health check endpoint (database, Redis, RabbitMQ) — separate support auth
   app.get('/api/auth/health', requireHealthSupportAuth, async (_req, res) => {
      const checks = await getDependencyHealth();
      const healthy = isDependencyHealthOk(checks);

      res.status(healthy ? 200 : 503).json({
         status: healthy ? 'healthy' : 'unhealthy',
         timestamp: new Date().toISOString(),
         service: 'auth-service',
         version: '1.0.0',
         checks,
      });
   });

   // API routes
   app.use('/auth', authRoutes);
   app.use('/auth/subscription-plans', subscriptionPlanRoutes);
   app.use('/auth/subscriptions', userSubscriptionRoutes);
   app.use('/auth/organizations', authenticateToken, createOrganizationRoutes(prisma));
   app.get(
      '/auth/users/me/organization-memberships',
      authenticateToken,
      new OrganizationController(prisma).listMyOrganizationMemberships,
   );
   app.use('/auth/authors', authenticateToken, createAuthorRoutes(prisma));
   app.use('/auth/catalog', authenticateToken, createCatalogRoutes(prisma));
   app.use('/auth/events', createDomainEventsRoutes());

   setupSwagger(app);

   // Root endpoint
   app.get('/', (_req, res) => {
      res.json({
         message: 'Auth Service API',
         version: '1.0.0',
         apiDocs: '/api-docs',
         openApiSpec: '/api-docs.json',
         endpoints: {
            health: '/api/auth/health',
            auth: '/auth',
            jwks: '/auth/.well-known/jwks.json',
            subscriptionPlans: '/auth/subscription-plans',
            subscriptions: '/auth/subscriptions',
            devices: '/auth/devices',
            organizations: '/auth/organizations',
            authors: '/auth/authors',
            catalog: '/auth/catalog',
            events: '/auth/events/stream',
         },
      });
   });

   // Error handling middleware (must be last)
   app.use(notFound);
   app.use(errorHandler);

   return app;
};

const STARTUP_CONNECT_ATTEMPTS = 3;
const STARTUP_CONNECT_RETRY_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
   return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectServiceWithRetries(
   serviceName: 'RabbitMQ' | 'Redis',
   connect: () => Promise<void>,
   cleanup: () => Promise<void>
): Promise<void> {
   let lastError: unknown;

   for (let attempt = 1; attempt <= STARTUP_CONNECT_ATTEMPTS; attempt++) {
      try {
         await connect();
         if (attempt > 1) {
            appLogger.info({ serviceName, attempt }, 'Connected after retry');
         }
         return;
      } catch (error) {
         lastError = error;
         await cleanup().catch(() => undefined);

         if (attempt < STARTUP_CONNECT_ATTEMPTS) {
            appLogger.warn(
               { err: error, serviceName, attempt, maxAttempts: STARTUP_CONNECT_ATTEMPTS },
               'Connection failed, retrying'
            );
            await sleep(STARTUP_CONNECT_RETRY_DELAY_MS);
         }
      }
   }

   throw lastError;
}

/**
 * Initialize services and start the server
 */
export const startServer = async (): Promise<void> => {
   try {
      await connectServiceWithRetries(
         'RabbitMQ',
         () => rabbitmqService.connect(),
         () => rabbitmqService.disconnect()
      );

      await connectServiceWithRetries(
         'Redis',
         () => redisService.connect(),
         () => redisService.disconnect()
      );

      await ChapterGatingConsumerWorkerFactory.startWorker();

      const prisma = new PrismaClient();
      await SubscriptionRenewalJobWorkerFactory.startWorker(prisma);
      await SubscriptionDowngradeJobWorkerFactory.startWorker(prisma);
      await SubscriptionExpirationJobWorkerFactory.startWorker(prisma);

      // Create Express app
      const app = createApp();

      // Start server
      const port = config.PORT;
      app.listen(port, () => {
         appLogger.info({ port, nodeEnv: config.NODE_ENV }, 'Auth service running');
         appLogger.info({ swaggerUI: `http://localhost:${port}/api-docs`, openAPISpec: `http://localhost:${port}/api-docs.json` }, 'API documentation');
         const jwksPath = '/auth/.well-known/jwks.json';
         if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test' || config.NODE_ENV === 'testing') {
            appLogger.info({ jwksUrl: `http://localhost:${port}${jwksPath}` }, 'JWKS endpoint');
         } else {
            appLogger.info({ jwksPath }, 'JWKS endpoint');
         }
      });

      // Graceful shutdown
      process.on('SIGTERM', async () => {
         appLogger.info('SIGTERM received, shutting down gracefully');
         await ChapterGatingConsumerWorkerFactory.stopWorker();
         await SubscriptionRenewalJobWorkerFactory.stopWorker();
         await SubscriptionDowngradeJobWorkerFactory.stopWorker();
         await SubscriptionExpirationJobWorkerFactory.stopWorker();
         await rabbitmqService.disconnect();
         await redisService.disconnect();
         process.exit(0);
      });

      process.on('SIGINT', async () => {
         appLogger.info('SIGINT received, shutting down gracefully');
         await ChapterGatingConsumerWorkerFactory.stopWorker();
         await SubscriptionRenewalJobWorkerFactory.stopWorker();
         await SubscriptionDowngradeJobWorkerFactory.stopWorker();
         await SubscriptionExpirationJobWorkerFactory.stopWorker();
         await rabbitmqService.disconnect();
         await redisService.disconnect();
         process.exit(0);
      });

   } catch (error) {
      appLogger.error({ err: error }, 'Failed to start server');
      process.exit(1);
   }
};

import fs from 'fs';
import path from 'path';
import pino, { Logger, multistream } from 'pino';
import pretty from 'pino-pretty';
import { config } from '../config/env';

const LOG_DIR = 'logs';

type ServiceName = 'app' | 'rabbitmq' | 'redis' | 'email' | 'sse';

const SERVICE_LOG_FILES: Record<ServiceName, string> = {
   app: 'app.log',
   rabbitmq: 'rabbitmq.log',
   redis: 'redis.log',
   email: 'email.log',
   sse: 'sse.log',
};

function ensureLogDir(): string {
   const logDir = path.resolve(process.cwd(), LOG_DIR);
   if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
   }
   return logDir;
}

function createFileDestination(logDir: string, filename: string) {
   const fd = fs.openSync(path.join(logDir, filename), 'a');
   return pino.destination({ fd, minLength: 0, sync: false });
}

function createServiceLogger(service: ServiceName, errorLogFile?: pino.DestinationStream): Logger {
   if (config.NODE_ENV === 'test') {
      return pino({ level: 'silent' });
   }

   const logDir = ensureLogDir();
   const fileStream = createFileDestination(logDir, SERVICE_LOG_FILES[service]);

   const loggerOptions = {
      level: config.LOG_LEVEL,
      base: { service },
   };

   const usePrettyConsole =
      config.NODE_ENV === 'development' || config.NODE_ENV === 'testing';

   const streams: pino.StreamEntry[] = [{ stream: fileStream }];
   if (errorLogFile) {
      streams.push({ level: 'error' as pino.Level, stream: errorLogFile });
   }

   if (usePrettyConsole) {
      const prettyStream = pretty({
         colorize: true,
         translateTime: 'SYS:standard',
         ignore: 'pid,hostname,service',
      });
      streams.push({ stream: prettyStream });
   }

   return pino(loggerOptions, multistream(streams));
}

function createLoggers(): { appLogger: Logger; errorLogger: Logger } {
   if (config.NODE_ENV === 'test') {
      const silent = pino({ level: 'silent' });
      return { appLogger: silent, errorLogger: silent };
   }

   const logDir = ensureLogDir();
   const errorLogFile = createFileDestination(logDir, 'error.log');
   const errorLogger = pino({ level: 'error' }, errorLogFile);

   return {
      appLogger: createServiceLogger('app', errorLogFile),
      errorLogger,
   };
}

const { appLogger, errorLogger } = createLoggers();

export { appLogger, errorLogger };
export const rabbitmqLogger = createServiceLogger('rabbitmq');
export const redisLogger = createServiceLogger('redis');
export const emailLogger = createServiceLogger('email');
export const sseLogger = createServiceLogger('sse');

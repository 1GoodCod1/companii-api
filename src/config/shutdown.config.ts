import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';

const SHUTDOWN_TIMEOUT_MS = 10_000;
const APP_CLOSE_TIMEOUT_MS = 8_000;

export function createShutdownHandler(
  app: INestApplication,
  isShuttingDownRef: { current: boolean },
): (signal: string) => Promise<void> {
  const logger = new Logger('Shutdown');

  return async (signal: string) => {
    if (isShuttingDownRef.current) return;
    isShuttingDownRef.current = true;

    logger.log(`Received ${signal}, starting graceful shutdown...`);
    const shutdownTimeout = setTimeout(() => {
      logger.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      await Promise.race([
        app.close(),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('Shutdown timeout')),
            APP_CLOSE_TIMEOUT_MS,
          );
        }),
      ]);
      clearTimeout(shutdownTimeout);
      logger.log('Application closed gracefully');
      process.exit(0);
    } catch (error: unknown) {
      clearTimeout(shutdownTimeout);
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Error during shutdown: ${message}`);
      process.exit(0);
    }
  };
}

import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const logger = new Logger('ConfigValidation');

export function validateProductionSecrets(config: ConfigService): void {
  if (config.get<string>('nodeEnv') !== 'production') return;

  const jwtSecret = config.get<string>('jwt.secret');
  if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.includes('dev-secret')) {
    throw new Error('JWT_SECRET must be set to a strong value in production');
  }

  if (!config.get<string>('database.url')) {
    throw new Error('DATABASE_URL is required in production');
  }

  logger.log('Production secrets validated');
}

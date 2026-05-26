import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const logger = new Logger('ConfigValidation');

const MIN_JWT_SECRET_LENGTH = 32;

export function validateProductionSecrets(config: ConfigService): void {
  if (config.get<string>('nodeEnv') !== 'production') return;

  const missing: string[] = [];

  const jwtSecret = config.get<string>('jwt.secret');
  if (
    !jwtSecret ||
    jwtSecret.length < MIN_JWT_SECRET_LENGTH ||
    jwtSecret.includes('dev-secret')
  ) {
    missing.push(`JWT_SECRET (min ${MIN_JWT_SECRET_LENGTH} chars, no dev defaults)`);
  }

  if (!config.get<string>('database.url')) {
    missing.push('DATABASE_URL');
  }

  const frontendUrl = config.get<string>('frontendUrl', '');
  if (!frontendUrl) {
    missing.push('FRONTEND_URL');
  } else if (!frontendUrl.startsWith('https://')) {
    missing.push('FRONTEND_URL (must start with https://)');
  }
  const apiUrl = config.get<string>('apiUrl', '');
  if (!apiUrl) {
    missing.push('API_URL');
  } else if (!apiUrl.startsWith('https://')) {
    missing.push('API_URL (must start with https://)');
  }

  if (missing.length > 0) {
    logger.fatal(
      `In production set secure values: ${missing.join(', ')}. Do not use defaults.`,
    );
    process.exit(1);
  }

  logger.log('Production secrets validated');
}

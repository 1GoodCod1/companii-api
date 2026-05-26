import { Logger } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const logger = new Logger('CorsConfig');

const DEV_LOCAL_ORIGINS = [
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
] as const;

function parseValidOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try {
        // Strip trailing slash, drop any path/query/hash; keep only the origin.
        return new URL(s).origin;
      } catch {
        logger.warn(`Ignored invalid CORS origin: ${s}`);
        return null;
      }
    })
    .filter((value): value is string => value !== null);
}

let cachedOrigins: string | string[] | null = null;

/**
 * Resolves the allow-listed origins for CORS once at bootstrap and caches the
 * result. Subsequent calls (e.g. from CookieOriginGuard) avoid re-parsing env
 * vars on every request.
 *
 * Prod: FRONTEND_URL (required, https only). Dev: FRONTEND_URL + local Vite
 * ports. CORS_ORIGINS overrides when set explicitly (legacy / multi-origin).
 */
export function getCorsOrigins(): string | string[] {
  if (cachedOrigins !== null) return cachedOrigins;

  const explicit = parseValidOrigins(process.env.CORS_ORIGINS);
  const isProd = process.env.NODE_ENV === 'production';

  if (explicit.length > 0) {
    if (isProd && explicit.some((o) => o === '*' || o.startsWith('http://'))) {
      logger.fatal(
        `CORS_ORIGINS in production must only contain explicit https:// origins. Got: ${explicit.join(', ')}`,
      );
      process.exit(1);
    }
    cachedOrigins = explicit.length === 1 ? explicit[0]! : explicit;
    logger.log(`CORS allow-list: ${explicit.join(', ')}`);
    return cachedOrigins;
  }

  if (isProd) {
    const origins = parseValidOrigins(process.env.FRONTEND_URL);
    if (origins.length === 0) {
      logger.fatal(
        'FRONTEND_URL is required in production. Set FRONTEND_URL=https://companii.faber.md',
      );
      process.exit(1);
    }
    if (origins.some((o) => o.startsWith('http://'))) {
      logger.fatal('FRONTEND_URL in production must use https://');
      process.exit(1);
    }
    cachedOrigins = origins.length === 1 ? origins[0]! : origins;
    logger.log(`CORS allow-list: ${origins.join(', ')}`);
    return cachedOrigins;
  }

  const list = [
    ...parseValidOrigins(process.env.FRONTEND_URL),
    ...DEV_LOCAL_ORIGINS,
  ];
  cachedOrigins = list.length ? Array.from(new Set(list)) : [...DEV_LOCAL_ORIGINS];
  return cachedOrigins;
}

export function getCorsOptions(): CorsOptions {
  return {
    origin: getCorsOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-company-id',
      'x-request-id',
      'Cache-Control',
      'Pragma',
      'Expires',
    ],
    exposedHeaders: ['X-Request-Id'],
  };
}

export function __resetCorsOriginsCacheForTest(): void {
  cachedOrigins = null;
}

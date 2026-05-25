import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export function getCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS || 'http://localhost:5174,http://127.0.0.1:5174';
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
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

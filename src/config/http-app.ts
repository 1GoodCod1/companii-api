import { RequestMethod, type INestApplication } from '@nestjs/common';

export const API_GLOBAL_PREFIX = 'api/v1';

export const GLOBAL_PREFIX_EXCLUDE: Array<
  string | { path: string; method: RequestMethod }
> = [
  { path: 'health', method: RequestMethod.GET },
  { path: 'ping', method: RequestMethod.GET },
  'docs',
  'docs-json',
];

export function applyGlobalPrefix(app: INestApplication): void {
  app.setGlobalPrefix(API_GLOBAL_PREFIX, {
    exclude: GLOBAL_PREFIX_EXCLUDE,
  });
}

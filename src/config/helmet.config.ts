import type { HelmetOptions } from 'helmet';

export function getHelmetConfig(isProd: boolean): HelmetOptions {
  return {
    contentSecurityPolicy: isProd ? undefined : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  };
}

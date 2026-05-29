import type { HelmetOptions } from 'helmet';

export function getHelmetConfig(isProd: boolean): HelmetOptions {
  return {
    contentSecurityPolicy: isProd
      ? {
          useDefaults: false,
          directives: {
            defaultSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'none'"],
            formAction: ["'none'"],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: isProd
      ? { maxAge: 31536000, includeSubDomains: true, preload: false }
      : false,
  };
}

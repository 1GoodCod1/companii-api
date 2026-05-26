import type { HelmetOptions } from 'helmet';

/**
 * Helmet configuration for the API. Notes:
 *
 *  - The API is JSON-only — there is no first-party HTML rendered by this
 *    process (Swagger is dev-only). A strict default-src policy is therefore
 *    safe for the production response surface.
 *
 *  - crossOriginResourcePolicy is tightened to `same-site` (was `cross-origin`)
 *    so any private resources (file downloads, audit JSON, etc.) cannot be
 *    embedded by an attacker page on a different site. Public asset endpoints
 *    that must be embeddable cross-origin should opt out per-response by
 *    setting `Cross-Origin-Resource-Policy: cross-origin`.
 */
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

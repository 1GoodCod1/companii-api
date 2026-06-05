import { resolveUseHttpOnlyCookie } from './http-only-cookie';

export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4100', 10),
  apiUrl:
    process.env.API_URL ||
    (process.env.NODE_ENV === 'production'
      ? ''
      : 'http://localhost:4100'),
  frontendUrl:
    process.env.FRONTEND_URL ||
    (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5174'),
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6380',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  },
  auth: {
    useHttpOnlyCookie: resolveUseHttpOnlyCookie(),
    refreshCookieName:
      process.env.REFRESH_COOKIE_NAME ||
      process.env.JWT_REFRESH_COOKIE_NAME ||
      'companii_refresh',
    cookieDomain: process.env.COOKIE_DOMAIN || '',
  },
  security: {
    cookieOriginCheckEnabled:
      process.env.NODE_ENV === 'production'
        ? process.env.COOKIE_ORIGIN_CHECK !== 'false'
        : process.env.COOKIE_ORIGIN_CHECK === 'true',
  },
  audit: {
    httpEnabled: process.env.AUDIT_HTTP_ENABLED !== 'false',
  },
  files: {
    uploadDir: process.env.FILES_UPLOAD_DIR || './uploads',
  },
  payments: {
    // HMAC-SHA256 shared secret used to verify the payment provider webhook.
    // Required in production (the guard fails closed when unset).
    webhookSecret: process.env.PAYMENTS_WEBHOOK_SECRET || '',
  },
  b2: {
    applicationKeyId: process.env.B2_APPLICATION_KEY_ID || '',
    applicationKey: process.env.B2_APPLICATION_KEY || '',
    publicBucket: process.env.B2_PUBLIC_BUCKET || '',
    privateBucket: process.env.B2_PRIVATE_BUCKET || '',
    region: process.env.B2_REGION || 'eu-central-003',
    endpoint: process.env.B2_ENDPOINT || '',
    publicBaseUrl: process.env.B2_PUBLIC_BASE_URL || '',
  },
  email: {
    enabled: process.env.EMAIL_ENABLED !== 'false',
    from: process.env.EMAIL_FROM || 'Faber Companii <noreply@faber.md>',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '2525', 10),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  },
});

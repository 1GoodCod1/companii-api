import { randomUUID } from 'crypto';
import { extname } from 'path';
import { diskStorage } from 'multer';
import type { Request } from 'express';
import type { StorageEngine } from 'multer';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import multerS3 from 'multer-s3';
import { FileVisibility } from '@prisma/client';
import { FILES_UPLOAD_MAX_BYTES } from '../../../common/constants';

const ALLOWED_EXTENSION_RE =
  /^\.(jpe?g|png|gif|webp|pdf|docx?|mp4|mov|webm)$/i;

const ALLOWED_MIMES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

const B2_REGION_REGEX = /^[a-z]{2}-[a-z]+-\d{3}$/;

function resolveRegion(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return 'eu-central-003';
  if (!B2_REGION_REGEX.test(raw)) return 'eu-central-003';
  return raw;
}

function resolveEndpoint(custom: unknown, region: string): string {
  const fallback = `https://s3.${region}.backblazeb2.com`;
  if (typeof custom !== 'string') return fallback;
  const trimmed = custom.trim();
  if (!trimmed) return fallback;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:') return fallback;
    if (!u.hostname.endsWith('.backblazeb2.com')) return fallback;
    return u.origin;
  } catch {
    return fallback;
  }
}

export function resolveRequestVisibility(req: Request): FileVisibility {
  const raw = (req.query?.visibility ?? req.body?.visibility) as
    | string
    | undefined;
  if (typeof raw === 'string' && raw.toLowerCase() === 'public') {
    return FileVisibility.PUBLIC;
  }
  return FileVisibility.PRIVATE;
}

const fileFilter = (
  _req: unknown,
  file: Express.Multer.File,
  cb: (err: Error | null, ok: boolean) => void,
) => {
  const ext = extname(file.originalname);
  const extOk = ALLOWED_EXTENSION_RE.test(ext);
  const mimeOk = ALLOWED_MIMES.has(file.mimetype);
  const ok = extOk && mimeOk;
  cb(ok ? null : new Error('Invalid file type'), ok);
};

export function createMulterOptions(configService: ConfigService) {
  const logger = new Logger('FilesModule');

  const keyId = configService.get<string>('b2.applicationKeyId') ?? '';
  const key = configService.get<string>('b2.applicationKey') ?? '';
  const publicBucket = configService.get<string>('b2.publicBucket') ?? '';
  const privateBucket = configService.get<string>('b2.privateBucket') ?? '';
  const useB2 = !!(keyId && key && publicBucket && privateBucket);
  const isProd = configService.get<string>('nodeEnv') === 'production';

  if (useB2) {
    const region = resolveRegion(configService.get('b2.region'));
    const endpoint = resolveEndpoint(configService.get('b2.endpoint'), region);

    const s3 = new S3Client({
      credentials: { accessKeyId: keyId, secretAccessKey: key },
      region,
      endpoint,
      forcePathStyle: true,
    });

    s3.middlewareStack.add(
      (next) => (args) => {
        const input = args.input as Record<string, unknown> | undefined;
        if (input && 'ACL' in input) delete input.ACL;
        return next(args);
      },
      { step: 'initialize', name: 'stripACL' },
    );

    logger.log(
      `Multer storage: Backblaze B2 (region=${region}, public=${publicBucket}, private=${privateBucket})`,
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const autoContentType = multerS3.AUTO_CONTENT_TYPE as (
      req: Express.Request,
      file: Express.Multer.File,
      cb: (
        err: Error | null,
        mime?: string,
        stream?: NodeJS.ReadableStream,
      ) => void,
    ) => void;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const s3Storage: StorageEngine = multerS3({
      s3,
      bucket: (
        req: Request,
        _file: Express.Multer.File,
        cb: (err: Error | null, bucket?: string) => void,
      ) => {
        const visibility = resolveRequestVisibility(req);
        cb(
          null,
          visibility === FileVisibility.PUBLIC ? publicBucket : privateBucket,
        );
      },
      contentType: autoContentType,
      contentDisposition: (
        req: Request,
        _file: Express.Multer.File,
        cb: (err: Error | null, disposition?: string) => void,
      ) => {
        cb(
          null,
          resolveRequestVisibility(req) === FileVisibility.PUBLIC
            ? 'inline'
            : 'attachment',
        );
      },
      metadata: (
        _req: Express.Request,
        _file: Express.Multer.File,
        cb: (err: Error | null, metadata?: Record<string, string>) => void,
      ) => {
        cb(null, { 'x-amz-meta-source': 'companii.md' });
      },
      key: (
        _req: Express.Request,
        file: Express.Multer.File,
        cb: (err: Error | null, key?: string) => void,
      ) => {
        cb(null, `uploads/${randomUUID()}${extname(file.originalname).toLowerCase()}`);
      },
    }) as StorageEngine;

    return {
      storage: s3Storage,
      limits: { fileSize: FILES_UPLOAD_MAX_BYTES },
      fileFilter,
    };
  }

  if (isProd) {
    logger.error(
      'CRITICAL: B2 storage is NOT configured in PRODUCTION. Local diskStorage will lose files across pod restarts. ' +
        'Set B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, B2_PUBLIC_BUCKET, B2_PRIVATE_BUCKET.',
    );
    throw new Error(
      'Storage: local diskStorage is disabled in production to prevent file fragmentation across pods.',
    );
  }

  const uploadDir =
    configService.get<string>('files.uploadDir') ?? './uploads';
  logger.warn(
    `Multer storage: LOCAL disk (${uploadDir}). Set B2 env vars to enable B2.`,
  );

  return {
    limits: { fileSize: FILES_UPLOAD_MAX_BYTES },
    fileFilter,
    storage: diskStorage({
      destination: uploadDir,
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
      },
    }),
  };
}

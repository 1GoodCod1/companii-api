import { randomUUID } from 'crypto';
import { extname } from 'path';
import { diskStorage } from 'multer';
import type { ConfigService } from '@nestjs/config';
import { FILES_UPLOAD_MAX_BYTES } from '../../../common/constants';

// Anchored pattern — only matches when extname() returns exactly one of these.
const ALLOWED_EXTENSION_RE =
  /^\.(jpe?g|png|gif|webp|pdf|docx?|mp4|mov|webm)$/i;

// MIME whitelist serves as defence-in-depth alongside file-magic validation.
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

export function createMulterOptions(configService: ConfigService) {
  const uploadDir =
    configService.get<string>('files.uploadDir') ?? './uploads';

  return {
    limits: { fileSize: FILES_UPLOAD_MAX_BYTES },
    fileFilter: (
      _req: unknown,
      file: Express.Multer.File,
      cb: (err: Error | null, ok: boolean) => void,
    ) => {
      const ext = extname(file.originalname);
      const extOk = ALLOWED_EXTENSION_RE.test(ext);
      const mimeOk = ALLOWED_MIMES.has(file.mimetype);
      const ok = extOk && mimeOk;
      cb(ok ? null : new Error('Invalid file type'), ok);
    },
    storage: diskStorage({
      destination: uploadDir,
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
      },
    }),
  };
}

import { extname } from 'path';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import type { ConfigService } from '@nestjs/config';
import { FILES_MAX_FILE_SIZE_BYTES } from '../../../common/constants';

const ALLOWED_EXTENSIONS = /jpeg|jpg|png|gif|webp|pdf|doc|docx/;

export function createMulterOptions(configService: ConfigService) {
  const uploadDir =
    configService.get<string>('files.uploadDir') ?? './uploads';

  return {
    limits: { fileSize: FILES_MAX_FILE_SIZE_BYTES },
    fileFilter: (
      _req: unknown,
      file: Express.Multer.File,
      cb: (err: Error | null, ok: boolean) => void,
    ) => {
      const ok = ALLOWED_EXTENSIONS.test(
        extname(file.originalname).toLowerCase(),
      );
      cb(ok ? null : new Error('Invalid file type'), ok);
    },
    storage: diskStorage({
      destination: uploadDir,
      filename: (_req, file, cb) => {
        cb(null, `${uuidv4()}${extname(file.originalname)}`);
      },
    }),
  };
}

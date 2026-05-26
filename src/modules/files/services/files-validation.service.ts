import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AppErrorMessages,
  AppErrorTemplates,
  AppErrors,
} from '../../../common/errors';
import {
  FILES_MAX_FILES_PER_BATCH,
  FILES_MAX_FILE_SIZE_BYTES,
  FILES_MAX_VIDEO_SIZE_BYTES,
  VIDEO_EXTENSION_SET,
} from '../../../common/constants';
import {
  unlinkIfExists,
  validateFileMagic,
} from '../../shared/utils/file-magic';

function fileExtension(originalname: string): string {
  const i = originalname.lastIndexOf('.');
  return i >= 0 ? originalname.slice(i + 1).toLowerCase() : '';
}

@Injectable()
export class FilesValidationService {
  async assertValidFileContent(file: Express.Multer.File): Promise<void> {
    if (!file.path) return;
    try {
      this.assertFileSize(file);
      await validateFileMagic(file.path, file.originalname);
    } catch (e) {
      await unlinkIfExists(file.path);
      if (e instanceof BadRequestException) throw e;
      throw AppErrors.badRequest(
        AppErrorTemplates.invalidFileContent(
          e instanceof Error ? e.message : AppErrorMessages.FILES_INVALID_CONTENT,
        ),
      );
    }
  }

  assertFileSize(file: Express.Multer.File): void {
    const ext = fileExtension(file.originalname);
    const maxSize = VIDEO_EXTENSION_SET.has(ext)
      ? FILES_MAX_VIDEO_SIZE_BYTES
      : FILES_MAX_FILE_SIZE_BYTES;

    if (file.size > maxSize) {
      throw AppErrors.badRequest(AppErrorMessages.FILES_TOO_LARGE);
    }
  }

  assertMaxFiles(files: Express.Multer.File[]): void {
    if (files.length > FILES_MAX_FILES_PER_BATCH) {
      throw AppErrors.badRequest(AppErrorMessages.FILES_MAX_10);
    }
  }

  assertFilePresent(file: Express.Multer.File | undefined): void {
    if (!file) {
      throw AppErrors.badRequest(AppErrorMessages.FILES_NONE_UPLOADED);
    }
  }
}

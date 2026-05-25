import { Injectable } from '@nestjs/common';
import {
  AppErrorMessages,
  AppErrorTemplates,
  AppErrors,
} from '../../../common/errors';
import { FILES_MAX_FILES_PER_BATCH } from '../../../common/constants';
import {
  unlinkIfExists,
  validateFileMagic,
} from '../../shared/utils/file-magic';

@Injectable()
export class FilesValidationService {
  async assertValidFileContent(file: Express.Multer.File): Promise<void> {
    if (!file.path) return;
    try {
      await validateFileMagic(file.path, file.originalname);
    } catch (e) {
      await unlinkIfExists(file.path);
      throw AppErrors.badRequest(
        AppErrorTemplates.invalidFileContent(
          e instanceof Error ? e.message : AppErrorMessages.FILES_INVALID_CONTENT,
        ),
      );
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

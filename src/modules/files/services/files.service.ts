import { Injectable, Logger, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { FileVisibility } from '@prisma/client';
import {
  AppErrorMessages,
  AppErrors,
} from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { FilesValidationService } from './files-validation.service';
import { StorageService } from './storage.service';

export type UploadedFileDto = {
  id: string;
  path: string;
  url: string;
  filename: string;
  size: number;
  mimetype: string;
  visibility: FileVisibility;
};

type MulterS3File = Express.Multer.File & {
  location?: string;
  bucket?: string;
  key?: string;
};

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: FilesValidationService,
    private readonly storage: StorageService,
  ) {}

  async uploadFile(
    file: Express.Multer.File,
    userId: string,
    visibility: FileVisibility = FileVisibility.PRIVATE,
  ): Promise<UploadedFileDto> {
    this.validation.assertFilePresent(file);

    const storedPath = await this.persistMulterResult(file);
    try {
      await this.validation.assertValidUpload(file, storedPath, this.storage);
    } catch (err) {
      await this.storage.deleteByStoredPath(storedPath);
      throw err;
    }

    const record = await this.prisma.file.create({
      data: {
        filename: file.originalname,
        path: storedPath,
        mimetype: file.mimetype,
        size: file.size,
        visibility,
        uploadedById: userId,
      },
    });

    return this.toDto(record);
  }

  async uploadMany(
    files: Express.Multer.File[],
    userId: string,
    visibility: FileVisibility = FileVisibility.PRIVATE,
  ): Promise<UploadedFileDto[]> {
    this.validation.assertMaxFiles(files);
    const results: UploadedFileDto[] = [];
    for (const f of files) {
      results.push(await this.uploadFile(f, userId, visibility));
    }
    return results;
  }

  async downloadFile(
    fileId: string,
    user: JwtPayload | undefined,
    res: Response,
  ): Promise<StreamableFile | void> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file) throw AppErrors.notFound(AppErrorMessages.FILES_NOT_FOUND);

    if (file.visibility === FileVisibility.PUBLIC) {
      const publicUrl = this.buildPublicUrl(file.path);
      if (publicUrl) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.redirect(302, publicUrl);
        return;
      }
      return this.streamFile(file, res, /* isPrivate */ false);
    }

    if (!user) throw AppErrors.unauthorized(AppErrorMessages.AUTH_UNAUTHORIZED);
    await this.assertPrivateAccess(file, user);
    return this.streamFile(file, res, /* isPrivate */ true);
  }

  async deleteFileIfOwned(fileId: string, userId: string): Promise<void> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file) throw AppErrors.notFound(AppErrorMessages.FILES_NOT_FOUND);
    if (file.uploadedById !== userId) {
      throw AppErrors.forbidden(AppErrorMessages.FILES_ACCESS_DENIED);
    }
    await this.prisma.file.delete({ where: { id: fileId } });
    try {
      await this.storage.deleteByStoredPath(file.path);
    } catch (err) {
      this.logger.warn(
        `Storage delete failed for orphaned object "${file.path}" (file row already removed): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async persistMulterResult(file: Express.Multer.File): Promise<string> {
    const s3file = file as MulterS3File;
    if (s3file.bucket && s3file.key) {
      return this.storage.encodeB2(s3file.bucket, s3file.key);
    }

    const localPath = file.path?.replace(/\\/g, '/') ?? '';
    if (!localPath) {
      throw AppErrors.badRequest(AppErrorMessages.FILES_NONE_UPLOADED);
    }
    if (localPath.startsWith('uploads/')) return `/${localPath}`;
    const base = localPath.split('/').pop() ?? 'file';
    return `/uploads/${base}`;
  }

  private buildPublicUrl(storedPath: string): string | null {
    if (storedPath.startsWith('b2://')) {
      const decoded = this.storage.decodeStoredPath(storedPath);
      if (decoded.kind !== 'b2') return null;
      return this.storage.publicUrlFor(decoded.key);
    }
    return null;
  }

  private async streamFile(
    file: {
      id: string;
      path: string;
      filename: string;
      mimetype: string;
      visibility: FileVisibility;
    },
    res: Response,
    isPrivate: boolean,
  ): Promise<StreamableFile> {
    const opened = await this.storage.openReadStream(file.path);
    const safeName = file.filename.replace(/[^\w.\-()+ ]/g, '_');

    res.setHeader('Content-Type', opened.contentType ?? file.mimetype);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}"`,
    );
    res.setHeader(
      'Cache-Control',
      isPrivate ? 'private, no-store' : 'public, max-age=3600',
    );
    if (opened.size > 0) {
      res.setHeader('Content-Length', String(opened.size));
    }

    const stream = opened.stream as unknown as NodeJS.ReadableStream & {
      on: (ev: string, cb: () => void) => void;
      destroy?: () => void;
    };
    stream.on('error', () => {
      try {
        stream.destroy?.();
      } catch {
        /* ignore */
      }
    });
    return new StreamableFile(stream as unknown as import('stream').Readable);
  }

  private async assertPrivateAccess(
    file: { id: string; uploadedById: string | null },
    user: JwtPayload,
  ): Promise<void> {
    if (user.accountKind === 'PLATFORM_ADMIN') return;
    if (file.uploadedById && file.uploadedById === user.sub) return;

    const isReceiptForLine = await this.prisma.estimateLine.findFirst({
      where: {
        receiptFileKey: file.id,
        stage: {
          project: {
            OR: [
              { companyId: user.activeCompanyId },
              { customer: { portalUserId: user.sub } },
            ],
          },
        },
      },
    });
    if (!isReceiptForLine) {
      throw AppErrors.forbidden(AppErrorMessages.FILES_ACCESS_DENIED);
    }
  }

  private toDto(record: {
    id: string;
    filename: string;
    path: string;
    mimetype: string;
    size: number;
    visibility: FileVisibility;
  }): UploadedFileDto {
    const url =
      record.visibility === FileVisibility.PUBLIC && record.path.startsWith('b2://')
        ? this.buildPublicUrlFromStoredPath(record.path) ?? record.path
        : record.path;

    return {
      id: record.id,
      path: record.path,
      url,
      filename: record.filename,
      size: record.size,
      mimetype: record.mimetype,
      visibility: record.visibility,
    };
  }

  private buildPublicUrlFromStoredPath(storedPath: string): string | null {
    if (!storedPath.startsWith('b2://')) return null;
    const decoded = this.storage.decodeStoredPath(storedPath);
    if (decoded.kind !== 'b2') return null;
    return this.storage.publicUrlFor(decoded.key);
  }
}

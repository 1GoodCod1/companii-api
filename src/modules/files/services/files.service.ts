import { createReadStream, existsSync } from 'fs';
import { join, normalize } from 'path';
import { Injectable, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import {
  AppErrorMessages,
  AppErrors,
} from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { FilesValidationService } from './files-validation.service';
import { unlinkIfExists } from '../../shared/utils/file-magic';

export type UploadedFileDto = {
  id: string;
  path: string;
  url: string;
  filename: string;
  size: number;
  mimetype: string;
};

@Injectable()
export class FilesService {
  private readonly uploadRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: FilesValidationService,
    config: ConfigService,
  ) {
    const dir = config.get<string>('files.uploadDir') ?? './uploads';
    this.uploadRoot = normalize(
      dir.startsWith('/') ? dir : join(process.cwd(), dir),
    );
  }

  async uploadFile(
    file: Express.Multer.File,
    userId: string,
  ): Promise<UploadedFileDto> {
    this.validation.assertFilePresent(file);
    await this.validation.assertValidFileContent(file);

    const fileUrl = this.normalizeFileUrl(file);
    const record = await this.prisma.file.create({
      data: {
        filename: file.originalname,
        path: fileUrl,
        mimetype: file.mimetype,
        size: file.size,
        uploadedById: userId,
      },
    });

    return {
      id: record.id,
      path: fileUrl,
      url: fileUrl,
      filename: record.filename,
      size: record.size,
      mimetype: record.mimetype,
    };
  }

  async uploadMany(
    files: Express.Multer.File[],
    userId: string,
  ): Promise<UploadedFileDto[]> {
    this.validation.assertMaxFiles(files);
    const results: UploadedFileDto[] = [];
    for (const f of files) {
      results.push(await this.uploadFile(f, userId));
    }
    return results;
  }

  async downloadFile(
    fileId: string,
    user: JwtPayload,
    res: Response,
  ): Promise<StreamableFile> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file) throw AppErrors.notFound(AppErrorMessages.FILES_NOT_FOUND);

    if (user.accountKind !== 'PLATFORM_ADMIN') {
      if (file.uploadedById && file.uploadedById === user.sub) {
        // Uploader has access
      } else {
        // Check if file is a receipt linked to an estimate line of a project they have access to
        const isReceiptForLine = await this.prisma.estimateLine.findFirst({
          where: {
            receiptFileKey: fileId,
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
    }

    const absolutePath = this.resolveSafeLocalPath(file.path);
    if (!existsSync(absolutePath)) {
      throw AppErrors.notFound(AppErrorMessages.FILES_NOT_FOUND);
    }

    const safeName = file.filename.replace(/[^\w.\-()+ ]/g, '_');
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');

    return new StreamableFile(createReadStream(absolutePath));
  }

  private normalizeFileUrl(file: Express.Multer.File): string {
    const normalized = file.path.replace(/\\/g, '/');
    if (normalized.startsWith('uploads/')) return `/${normalized}`;
    const base = normalized.split('/').pop() ?? 'file';
    return `/uploads/${base}`;
  }

  private resolveSafeLocalPath(publicPath: string): string {
    const relative = publicPath.replace(/^\/+/, '');
    const absolute = normalize(join(process.cwd(), relative));
    if (!absolute.startsWith(this.uploadRoot)) {
      throw AppErrors.forbidden(AppErrorMessages.FILES_ACCESS_DENIED);
    }
    return absolute;
  }

  async deleteFileIfOwned(fileId: string, userId: string): Promise<void> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file) throw AppErrors.notFound(AppErrorMessages.FILES_NOT_FOUND);
    if (file.uploadedById !== userId) {
      throw AppErrors.forbidden(AppErrorMessages.FILES_ACCESS_DENIED);
    }
    const absolutePath = this.resolveSafeLocalPath(file.path);
    await this.prisma.file.delete({ where: { id: fileId } });
    await unlinkIfExists(absolutePath);
  }
}

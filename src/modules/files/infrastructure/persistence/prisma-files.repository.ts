import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/modules/shared/database/prisma.service';
import type { File, Prisma } from '@prisma/client';
import type { FilesRepository } from '../../domain/ports/files.repository.port';

@Injectable()
export class PrismaFilesRepository implements FilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.FileUncheckedCreateInput): Promise<File> {
    return this.prisma.file.create({ data });
  }

  findById(id: string): Promise<File | null> {
    return this.prisma.file.findUnique({ where: { id } });
  }

  delete(id: string): Promise<File> {
    return this.prisma.file.delete({ where: { id } });
  }

  async isReceiptForLine(fileId: string, companyId: string | null, portalUserId: string): Promise<boolean> {
    const OR: Prisma.EstimateProjectWhereInput[] = [];
    if (companyId) {
      OR.push({ companyId });
    }
    OR.push({ customer: { portalUserId } });

    const result = await this.prisma.estimateLine.findFirst({
      where: {
        receiptFileKey: fileId,
        stage: {
          project: {
            OR,
          },
        },
      },
    });
    return !!result;
  }
}

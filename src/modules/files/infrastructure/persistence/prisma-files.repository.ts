import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/modules/shared/database/prisma.service';
import { RLS_SYSTEM_CONTEXT } from '@/common/rls/rls-system.util';
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

  async canAccessFile(
    fileId: string,
    companyId: string | null,
    portalUserId: string,
  ): Promise<boolean> {
    const projectOwnership: Prisma.EstimateProjectWhereInput[] = [
      { customer: { portalUserId } },
    ];
    if (companyId) {
      projectOwnership.push({ companyId });
    }

    return this.prisma.runOutsideRlsContext(() =>
      this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async (db) => {
        const lineReceipt = await db.estimateLine.findFirst({
          where: {
            receiptFileKey: fileId,
            stage: { project: { OR: projectOwnership } },
          },
          select: { id: true },
        });
        if (lineReceipt) return true;

        const receipt = await db.estimateReceipt.findFirst({
          where: {
            fileKey: fileId,
            project: { OR: projectOwnership },
          },
          select: { id: true },
        });
        if (receipt) return true;

        const invoiceOwnership: Prisma.CompanyInvoiceWhereInput[] = [
          { intervention: { customer: { portalUserId } } },
        ];
        if (companyId) {
          invoiceOwnership.push({ companyId });
        }
        const paymentProof = await db.companyInvoice.findFirst({
          where: {
            paymentProofFileKey: fileId,
            OR: invoiceOwnership,
          },
          select: { id: true },
        });
        if (paymentProof) return true;

        const interventionOwnership: Prisma.InterventionWhereInput[] = [
          { customer: { portalUserId } },
        ];
        if (companyId) {
          interventionOwnership.push({ companyId });
        }
        const photo = await db.interventionPhoto.findFirst({
          where: {
            fileKey: fileId,
            intervention: { OR: interventionOwnership },
          },
          select: { id: true },
        });
        return !!photo;
      }),
    );
  }
}

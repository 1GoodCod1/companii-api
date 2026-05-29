import { Injectable, Logger } from '@nestjs/common';
import { FileVisibility } from '@prisma/client';
import type { Readable } from 'stream';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import { StorageService } from '../../../files/services/storage.service';
import { InvoicePdfService } from '../../pdf/invoice-pdf.service';
import { FsmContextService } from '../../context/fsm-context.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';

async function streamToBuffer(stream: Readable | NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array | string>) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
    } else if (chunk instanceof Buffer) {
      chunks.push(chunk);
    } else {
      chunks.push(Buffer.from(chunk));
    }
  }
  return Buffer.concat(chunks);
}

function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

@Injectable()
export class InvoicePdfCacheService {
  private readonly logger = new Logger(InvoicePdfCacheService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
    private readonly invoicePdf: InvoicePdfService,
    private readonly storage: StorageService,
  ) {}

  companyInvoiceLockKey(companyId: string): bigint {
    return BigInt(fnv1a32(`invoice-number::${companyId}`));
  }

  async getPdf(user: JwtPayload, id: string) {
    const invoice = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
      include: {
        company: {
          select: {
            name: true,
            legalName: true,
            idno: true,
            legalAddress: true,
            contactPhone: true,
            contactEmail: true,
            isTvaPayer: true,
            tvaCode: true,
          },
        },
        intervention: { include: { customer: true } },
      },
    });
    if (!invoice) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const filename = `${invoice.number}.pdf`;

    if (invoice.pdfFileKey) {
      try {
        const { stream } = await this.storage.openReadStream(invoice.pdfFileKey);
        const buffer = await streamToBuffer(stream);
        return { buffer, filename };
      } catch (err) {
        this.logger.warn(
          `Cached PDF unreadable for invoice ${invoice.id} (${invoice.pdfFileKey}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const buffer = await this.invoicePdf.build(invoice);

    try {
      const storedPath = await this.storage.uploadBuffer(
        FileVisibility.PRIVATE,
        `invoices/${invoice.id}.pdf`,
        buffer,
        'application/pdf',
      );
      await this.prisma.companyInvoice.update({
        where: { id: invoice.id },
        data: { pdfFileKey: storedPath },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to cache invoice PDF ${invoice.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { buffer, filename };
  }
}

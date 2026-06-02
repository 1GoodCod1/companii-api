import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/modules/shared/database/prisma.service';
import type { Prisma, Payment } from '@prisma/client';
import type { PaymentsRepository } from '../../domain/ports/payments.repository.port';

@Injectable()
export class PrismaPaymentsRepository implements PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.PaymentCreateInput): Promise<Payment> {
    return this.prisma.payment.create({ data });
  }

  updateStatus(externalId: string, status: string): Promise<Prisma.BatchPayload> {
    return this.prisma.withRlsContext(
      { userId: 'system', accountKind: 'PLATFORM_ADMIN' },
      (tx) =>
        tx.payment.updateMany({
          where: { externalId },
          data: { status },
        }),
    );
  }
}

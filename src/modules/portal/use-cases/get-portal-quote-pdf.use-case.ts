import { Inject, Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PORTAL_REPOSITORY } from '../domain/ports/portal.repository.port';
import type { PrismaPortalRepository } from '../infrastructure/persistence/prisma-portal.repository';
import { QuotePdfService } from '../../fsm/pdf/quote-pdf.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';

@Injectable()
export class GetPortalQuotePdfUseCase {
  constructor(
    @Inject(PORTAL_REPOSITORY)
    private readonly portalRepo: PrismaPortalRepository,
    private readonly quotePdf: QuotePdfService,
  ) {}

  async execute(user: JwtPayload, quoteId: string) {
    const quote = await this.portalRepo.getQuotePdfData(quoteId, user.sub);
    if (!quote) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const buffer = await this.quotePdf.build(quote);
    return {
      buffer,
      filename: `${quote.number}.pdf`,
    };
  }
}

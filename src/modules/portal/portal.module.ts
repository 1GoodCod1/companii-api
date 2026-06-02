import { Module, forwardRef } from '@nestjs/common';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';
import { EndClientLinkModule } from '../end-client-link/end-client-link.module';
import { PortalInvitationModule } from '../portal-invitation/portal-invitation.module';
import { InvoicePdfModule } from '../fsm/pdf/invoice-pdf.module';
import { FsmModule } from '../fsm/fsm.module';
import { EmailModule } from '../email/email.module';
import { AuditModule } from '../audit/audit.module';
import { EstimateCommentModule } from '../estimates/estimate-comment.module';
import { GetPortalDashboardUseCase } from './use-cases/get-portal-dashboard.use-case';
import { AcceptOrRejectEstimateUseCase } from './use-cases/accept-or-reject-estimate.use-case';
import { RequestEstimateChangesUseCase } from './use-cases/request-estimate-changes.use-case';
import { GetPortalEstimateUseCase } from './use-cases/get-portal-estimate.use-case';
import { GetPortalEstimatePdfUseCase } from './use-cases/get-portal-estimate-pdf.use-case';
import { GetPortalInvoicePdfUseCase } from './use-cases/get-portal-invoice-pdf.use-case';
import { SubmitInvoicePaymentProofUseCase } from './use-cases/submit-invoice-payment-proof.use-case';
import { PORTAL_REPOSITORY } from './domain/ports/portal.repository.port';
import { PrismaPortalRepository } from './infrastructure/persistence/prisma-portal.repository';

@Module({
  imports: [
    EndClientLinkModule,
    PortalInvitationModule,
    InvoicePdfModule,
    forwardRef(() => FsmModule),
    EmailModule,
    AuditModule,
    EstimateCommentModule,
  ],
  controllers: [PortalController],
  providers: [
    PortalService,
    GetPortalDashboardUseCase,
    AcceptOrRejectEstimateUseCase,
    RequestEstimateChangesUseCase,
    GetPortalEstimateUseCase,
    GetPortalEstimatePdfUseCase,
    GetPortalInvoicePdfUseCase,
    SubmitInvoicePaymentProofUseCase,
    PrismaPortalRepository,
    {
      provide: PORTAL_REPOSITORY,
      useExisting: PrismaPortalRepository,
    },
  ],
})
export class PortalModule {}

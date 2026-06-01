import { Module, forwardRef } from '@nestjs/common';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';
import { EndClientLinkService } from './end-client-link.service';
import { InvoicePdfModule } from '../fsm/pdf/invoice-pdf.module';
import { FsmModule } from '../fsm/fsm.module';
import { EmailModule } from '../email/email.module';
import { AuditModule } from '../audit/audit.module';
import { EstimateCommentService } from '../estimates/services/history/estimate-comment.service';
import { GetPortalDashboardUseCase } from './use-cases/get-portal-dashboard.use-case';
import { AcceptOrRejectEstimateUseCase } from './use-cases/accept-or-reject-estimate.use-case';
import { RequestEstimateChangesUseCase } from './use-cases/request-estimate-changes.use-case';
import { CreatePortalInvitationUseCase } from './use-cases/create-portal-invitation.use-case';
import { GetPortalEstimateUseCase } from './use-cases/get-portal-estimate.use-case';
import { GetPortalEstimatePdfUseCase } from './use-cases/get-portal-estimate-pdf.use-case';
import { GetPortalInvoicePdfUseCase } from './use-cases/get-portal-invoice-pdf.use-case';
import { SubmitInvoicePaymentProofUseCase } from './use-cases/submit-invoice-payment-proof.use-case';

@Module({
  imports: [InvoicePdfModule, forwardRef(() => FsmModule), EmailModule, AuditModule],
  controllers: [PortalController],
  providers: [
    PortalService,
    EndClientLinkService,
    EstimateCommentService,
    GetPortalDashboardUseCase,
    AcceptOrRejectEstimateUseCase,
    RequestEstimateChangesUseCase,
    CreatePortalInvitationUseCase,
    GetPortalEstimateUseCase,
    GetPortalEstimatePdfUseCase,
    GetPortalInvoicePdfUseCase,
    SubmitInvoicePaymentProofUseCase,
  ],
  exports: [PortalService, EndClientLinkService],
})
export class PortalModule {}

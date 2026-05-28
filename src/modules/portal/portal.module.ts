import { Module } from '@nestjs/common';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';
import { EndClientLinkService } from './end-client-link.service';
import { InvoicePdfModule } from '../fsm/pdf/invoice-pdf.module';
import { EmailModule } from '../email/email.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [InvoicePdfModule, EmailModule, AuditModule],
  controllers: [PortalController],
  providers: [PortalService, EndClientLinkService],
  exports: [PortalService, EndClientLinkService],
})
export class PortalModule {}

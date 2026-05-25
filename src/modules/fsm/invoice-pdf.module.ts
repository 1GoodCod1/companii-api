import { Module } from '@nestjs/common';
import { InvoicePdfService } from './invoice-pdf.service';
import { QuotePdfService } from './quote-pdf.service';
import { EstimatePdfService } from './estimate-pdf.service';

@Module({
  providers: [InvoicePdfService, QuotePdfService, EstimatePdfService],
  exports: [InvoicePdfService, QuotePdfService, EstimatePdfService],
})
export class InvoicePdfModule {}

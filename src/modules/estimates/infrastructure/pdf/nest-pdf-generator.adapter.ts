import { Injectable } from '@nestjs/common';
import { EstimatePdfService } from '../../../fsm/pdf/estimate-pdf.service';
import type { PdfGenerator, PdfGeneratorOptions } from '../../domain/ports/pdf-generator.port';
import type { Readable } from 'stream';

@Injectable()
export class NestPdfGenerator implements PdfGenerator {
  constructor(private readonly estimatePdf: EstimatePdfService) {}

  async build(project: Record<string, unknown>, options?: PdfGeneratorOptions): Promise<Buffer> {
    return this.estimatePdf.build(project as Parameters<EstimatePdfService['build']>[0], options as Parameters<EstimatePdfService['build']>[1]);
  }

  async buildStream(project: Record<string, unknown>, options?: PdfGeneratorOptions): Promise<Readable> {
    return this.estimatePdf.buildStream(project as Parameters<EstimatePdfService['build']>[0], options as Parameters<EstimatePdfService['build']>[1]);
  }
}
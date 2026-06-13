import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { EstimatePdfService } from '../../../fsm/pdf/estimate-pdf.service';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimateProjectAccessService } from './estimate-project-access.service';

// Quote generation and client sending live in GenerateQuoteUseCase /
// SendEstimateToClientUseCase — this service only renders the estimate PDF.
@Injectable()
export class EstimateQuotesService {
  constructor(
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
    private readonly estimatePdf: EstimatePdfService,
  ) {}

  async getProjectPdf(user: JwtPayload, id: string, lang?: 'ro' | 'ru') {
    this.ctx.assertManagement(user);
    const project = await this.access.loadProjectForPdf(this.ctx.companyId(user), id);
    const buffer = await this.estimatePdf.build(project, { locale: lang });
    return { buffer, filename: `${project.number}.pdf` };
  }

  async getProjectPdfStream(user: JwtPayload, id: string, lang?: 'ro' | 'ru') {
    this.ctx.assertManagement(user);
    const project = await this.access.loadProjectForPdf(this.ctx.companyId(user), id);
    const readable = await this.estimatePdf.buildStream(project, { locale: lang });
    return { readable, filename: `${project.number}.pdf` };
  }
}

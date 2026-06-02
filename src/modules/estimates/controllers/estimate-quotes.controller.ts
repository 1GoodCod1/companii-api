import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '@/modules/companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '@/modules/auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { EstimatesService } from '../estimates.service';

@Controller(CONTROLLER_PATH.estimates)
export class EstimateQuotesController {
  constructor(private readonly estimates: EstimatesService) {}

  @Post('projects/:id/generate-quote')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  generateQuote(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.estimates.generateQuote(user, id);
  }

  @Post('projects/:id/send')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  sendToClient(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.estimates.sendToClient(user, id);
  }

  @Post('projects/:id/convert')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  convert(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body?: { mode?: 'single' | 'by-stage' },
  ) {
    return this.estimates.convertToInterventions(user, id, body?.mode ?? 'single');
  }

  @Get('projects/:id/pdf')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  async projectPdf(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('lang') lang?: string,
  ) {
    const validatedLang = lang === 'ru' ? 'ru' : 'ro';
    const stream = await this.estimates.getProjectPdfStream(user, id, validatedLang);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${stream.filename}"`,
      'Transfer-Encoding': 'chunked',
    });
    stream.readable.pipe(res);
  }
}

import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CONTROLLER_PATH } from '../../common/constants';
import { PortalService } from './portal.service';
import { EndClientLinkService } from './end-client-link.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { JwtPayload } from '../auth/types/jwt-payload';

@Controller(CONTROLLER_PATH.portal)
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    private readonly endClientLink: EndClientLinkService,
  ) {}

  @UseGuards(RolesGuard)
  @Roles('END_CLIENT')
  @Get('leads')
  listLeads(
    @CurrentUser() user: JwtPayload,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 100) : undefined;
    return this.portal.listMyLeads(user, cursor, parsedLimit);
  }

  @UseGuards(RolesGuard)
  @Roles('END_CLIENT')
  @Get('dashboard')
  dashboard(@CurrentUser() user: JwtPayload) {
    return this.portal.dashboard(user);
  }

  @Public()
  @Get('invitations/preview')
  previewInvite(@Query('token') token: string) {
    return this.endClientLink.previewInvite(token);
  }

  @UseGuards(RolesGuard)
  @Roles('END_CLIENT')
  @Post('quotes/:id/status')
  updateQuoteStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { status: 'ACCEPTED' | 'REJECTED' },
  ) {
    return this.portal.updateQuoteStatus(user, id, body.status);
  }

  @UseGuards(RolesGuard)
  @Roles('END_CLIENT')
  @Post('estimates/:id/status')
  updateEstimateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { status: 'ACCEPTED' | 'REJECTED' },
  ) {
    return this.portal.updateEstimateStatus(user, id, body.status);
  }

  @UseGuards(RolesGuard)
  @Roles('END_CLIENT')
  @Post('estimates/:id/request-changes')
  requestEstimateChanges(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { comment: string },
  ) {
    return this.portal.requestEstimateChanges(user, id, body.comment);
  }

  @UseGuards(RolesGuard)
  @Roles('END_CLIENT')
  @Get('estimates/:id')
  getEstimate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.portal.getEstimate(user, id);
  }

  @UseGuards(RolesGuard)
  @Roles('END_CLIENT')
  @Get('estimates/:id/pdf')
  async estimatePdf(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('lang') lang?: string,
  ) {
    const validatedLang = lang === 'ru' ? 'ru' : 'ro';
    const { buffer, filename } = await this.portal.getEstimatePdf(user, id, validatedLang);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @UseGuards(RolesGuard)
  @Roles('END_CLIENT')
  @Post('invoices/:id/payment-proof')
  submitInvoicePaymentProof(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { fileId: string },
  ) {
    return this.portal.submitInvoicePaymentProof(user, id, body.fileId);
  }

  @UseGuards(RolesGuard)
  @Roles('END_CLIENT')
  @Get('invoices/:id/pdf')
  async invoicePdf(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.portal.getInvoicePdf(user, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @UseGuards(RolesGuard)
  @Roles('END_CLIENT')
  @Post('invitations/accept')
  accept(@CurrentUser() user: JwtPayload, @Body() body: { token: string }) {
    return this.endClientLink.acceptInviteToken(body.token, user.sub);
  }

  // V-06: Comment thread for client portal
  @UseGuards(RolesGuard)
  @Roles('END_CLIENT')
  @Get('estimates/:id/comments')
  listEstimateComments(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.portal.listEstimateComments(user, id);
  }

  @UseGuards(RolesGuard)
  @Roles('END_CLIENT')
  @Post('estimates/:id/comments')
  addEstimateComment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { body: string },
  ) {
    return this.portal.addEstimateComment(user, id, body.body);
  }
}

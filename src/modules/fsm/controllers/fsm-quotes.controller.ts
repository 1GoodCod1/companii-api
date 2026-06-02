import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { QuoteStatus } from '@prisma/client';
import { FsmService } from '../fsm.service';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '@/modules/companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '@/modules/auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';

@Controller(`${CONTROLLER_PATH.fsm}/quotes`)
export class FsmQuotesController {
  constructor(private readonly fsm: FsmService) {}

  @Get()
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('quotes')
  @CompanyRoles('OWNER', 'MANAGER')
  quotes(
    @CurrentUser() user: JwtPayload,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 100) : undefined;
    return this.fsm.listQuotes(user, cursor, parsedLimit);
  }

  @Get(':id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('quotes')
  @CompanyRoles('OWNER', 'MANAGER')
  quote(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.getQuote(user, id);
  }

  @Post()
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('quotes')
  @CompanyRoles('OWNER', 'MANAGER')
  createQuote(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      customerId: string;
      interventionId?: string;
      validUntil?: string;
      lines: { description: string; qty: number; unitPrice: number; vatRate?: number; companyServiceId?: string }[];
    },
  ) {
    return this.fsm.createQuote(user, body);
  }

  @Patch(':id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('quotes')
  @CompanyRoles('OWNER', 'MANAGER')
  updateQuote(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: {
      status?: QuoteStatus;
      validUntil?: string | null;
      lines?: { description: string; qty: number; unitPrice: number; vatRate?: number; companyServiceId?: string }[];
    },
  ) {
    return this.fsm.updateQuote(user, id, body);
  }

  @Delete(':id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('quotes')
  @CompanyRoles('OWNER', 'MANAGER')
  deleteQuote(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.deleteQuote(user, id);
  }

  @Post(':id/convert')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('quotes')
  @CompanyRoles('OWNER', 'MANAGER')
  convertQuote(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.convertQuoteToIntervention(user, id);
  }

  @Post(':id/send')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('quotes')
  @CompanyRoles('OWNER', 'MANAGER')
  sendQuote(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.sendQuote(user, id);
  }

  @Get(':id/pdf')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('quotes')
  @CompanyRoles('OWNER', 'MANAGER')
  async quotePdf(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.fsm.getQuotePdf(user, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}

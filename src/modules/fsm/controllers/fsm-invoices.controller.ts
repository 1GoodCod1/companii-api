import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { InvoicePaymentStatus } from '@prisma/client';
import { FsmService } from '../fsm.service';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '../../companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '../../auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';

@Controller(`${CONTROLLER_PATH.fsm}/invoices`)
export class FsmInvoicesController {
  constructor(private readonly fsm: FsmService) {}

  @Get()
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('invoices')
  @CompanyRoles('OWNER', 'MANAGER')
  invoices(@CurrentUser() user: JwtPayload) {
    return this.fsm.listInvoices(user);
  }

  @Get(':id/pdf')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('invoices')
  @CompanyRoles('OWNER', 'MANAGER')
  async invoicePdf(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.fsm.getInvoicePdf(user, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Get(':id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('invoices')
  @CompanyRoles('OWNER', 'MANAGER')
  invoice(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.getInvoice(user, id);
  }

  @Post()
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('invoices')
  @CompanyRoles('OWNER', 'MANAGER')
  createInvoice(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      interventionId: string;
      tvaRate?: number;
      dueDate?: string;
    },
  ) {
    return this.fsm.createInvoice(user, body);
  }

  @Patch(':id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('invoices')
  @CompanyRoles('OWNER', 'MANAGER')
  updateInvoice(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: {
      paymentStatus?: InvoicePaymentStatus;
      dueDate?: string | null;
    },
  ) {
    return this.fsm.updateInvoice(user, id, body);
  }

  @Delete(':id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('invoices')
  @CompanyRoles('OWNER', 'MANAGER')
  deleteInvoice(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.deleteInvoice(user, id);
  }
}

@Controller(`${CONTROLLER_PATH.fsm}/export`)
export class FsmExportController {
  constructor(private readonly fsm: FsmService) {}

  @Get('invoices.csv')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('invoices')
  @CompanyRoles('OWNER', 'MANAGER')
  async exportInvoicesCsv(@CurrentUser() user: JwtPayload, @Res() res: Response) {
    const { csv, filename } = await this.fsm.exportInvoicesCsv(user);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(csv);
  }
}

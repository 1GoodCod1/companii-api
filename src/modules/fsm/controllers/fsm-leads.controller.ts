import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CompanyLeadStatus } from '@prisma/client';
import { LeadsService } from '../services/leads/leads.service';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '../../companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '../../auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';

@Controller(`${CONTROLLER_PATH.fsm}/leads`)
export class FsmLeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('leads')
  @CompanyRoles('OWNER', 'MANAGER')
  listLeads(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: CompanyLeadStatus,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 100) : undefined;
    return this.leads.listLeads(user, status, cursor, parsedLimit);
  }

  @Get(':id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('leads')
  @CompanyRoles('OWNER', 'MANAGER')
  getLead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.leads.getLead(user, id);
  }

  @Post()
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('leads')
  @CompanyRoles('OWNER', 'MANAGER')
  createLead(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      contactName: string;
      contactPhone: string;
      contactEmail?: string;
      message?: string;
      address?: string;
      source?: 'SERVICE_REQUEST' | 'PROJECT_REQUEST' | 'MANUAL' | 'PHONE' | 'WEBSITE';
      categoryId?: string;
      scheduledAt?: string;
      notes?: string;
    },
  ) {
    return this.leads.createLead(user, body);
  }

  @Patch(':id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('leads')
  @CompanyRoles('OWNER', 'MANAGER')
  updateLead(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: {
      status?: CompanyLeadStatus;
      notes?: string | null;
      contactName?: string;
      contactPhone?: string;
      contactEmail?: string | null;
      address?: string | null;
      scheduledAt?: string | null;
    },
  ) {
    return this.leads.updateLead(user, id, body);
  }

  @Post(':id/convert')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('leads')
  @CompanyRoles('OWNER', 'MANAGER')
  convertLead(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { mode: 'customer' | 'intervention' | 'estimate'; categoryId?: string; title?: string },
  ) {
    return this.leads.convertLead(user, id, body.mode, body);
  }

  @Post(':id/complete')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('leads')
  @CompanyRoles('OWNER', 'MANAGER')
  completeLead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.leads.completeLead(user, id);
  }
}

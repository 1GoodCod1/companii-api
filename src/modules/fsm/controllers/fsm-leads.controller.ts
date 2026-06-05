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
import { CompanyGuard } from '@/modules/companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '@/modules/auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { ConvertLeadDto, CreateLeadDto, UpdateLeadDto } from '../dto/lead.dto';

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
    @Body() body: CreateLeadDto,
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
    @Body() body: UpdateLeadDto,
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
    @Body() body: ConvertLeadDto,
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

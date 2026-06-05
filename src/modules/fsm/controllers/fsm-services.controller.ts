import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FsmService } from '../fsm.service';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '@/modules/companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '@/modules/auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import {
  CreateCompanyServiceDto,
  UpdateCompanyServiceDto,
} from '../dto/company-service.dto';

@Controller(`${CONTROLLER_PATH.fsm}/services`)
export class FsmServicesController {
  constructor(private readonly fsm: FsmService) {}

  @Get()
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('publicServices')
  @CompanyRoles('OWNER', 'MANAGER')
  listServices(@CurrentUser() user: JwtPayload) {
    return this.fsm.listCompanyServices(user);
  }

  @Post()
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('publicServices')
  @CompanyRoles('OWNER', 'MANAGER')
  createService(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateCompanyServiceDto,
  ) {
    return this.fsm.createCompanyService(user, body);
  }

  @Patch(':id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('publicServices')
  @CompanyRoles('OWNER', 'MANAGER')
  updateService(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateCompanyServiceDto,
  ) {
    return this.fsm.updateCompanyService(user, id, body);
  }

  @Delete(':id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('publicServices')
  @CompanyRoles('OWNER', 'MANAGER')
  deleteService(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.deleteCompanyService(user, id);
  }
}

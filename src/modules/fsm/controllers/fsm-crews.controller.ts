import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '../../companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '../../auth/guards/subscription.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { CrewsService } from '../services/crews.service';

@Controller(`${CONTROLLER_PATH.fsm}/crews`)
@UseGuards(CompanyGuard, SubscriptionGuard)
export class FsmCrewsController {
  constructor(private readonly crews: CrewsService) {}

  @Get()
  @CompanyRoles('OWNER', 'MANAGER', 'MEMBER')
  list(
    @CurrentUser() user: JwtPayload,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.crews.list(user, {
      includeInactive: includeInactive === 'true' || includeInactive === '1',
    });
  }

  @Get(':id')
  @CompanyRoles('OWNER', 'MANAGER', 'MEMBER')
  get(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.crews.get(user, id);
  }

  @Post()
  @CompanyRoles('OWNER', 'MANAGER')
  create(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      name: string;
      description?: string;
      color?: string;
      memberIds?: string[];
      leadMemberId?: string;
    },
  ) {
    return this.crews.create(user, body);
  }

  @Patch(':id')
  @CompanyRoles('OWNER', 'MANAGER')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string | null;
      color?: string | null;
      isActive?: boolean;
      memberIds?: string[];
      leadMemberId?: string;
    },
  ) {
    return this.crews.update(user, id, body);
  }

  @Delete(':id')
  @CompanyRoles('OWNER', 'MANAGER')
  delete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.crews.delete(user, id);
  }
}

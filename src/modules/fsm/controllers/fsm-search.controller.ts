import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { GlobalSearchService } from '../services/search/global-search.service';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '@/modules/companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';

@Controller(`${CONTROLLER_PATH.fsm}/search`)
export class FsmSearchController {
  constructor(private readonly search: GlobalSearchService) {}

  @Get()
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER', 'MEMBER')
  globalSearch(@CurrentUser() user: JwtPayload, @Query('q') q?: string) {
    return this.search.search(user, q ?? '');
  }
}

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '@/modules/companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { PipelineService, type PipelineEntity } from '../services/pipeline/pipeline.service';
import { PipelineColumnQueryDto } from '../dto/pipeline.dto';

@Controller(`${CONTROLLER_PATH.fsm}/pipeline`)
export class FsmPipelineController {
  constructor(private readonly pipeline: PipelineService) {}

  @Get(':entity')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  board(@CurrentUser() user: JwtPayload, @Param('entity') entity: string) {
    return this.pipeline.getBoard(user, entity as PipelineEntity);
  }

  @Get(':entity/column')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  column(
    @CurrentUser() user: JwtPayload,
    @Param('entity') entity: string,
    @Query() query: PipelineColumnQueryDto,
  ) {
    return this.pipeline.getColumn(user, entity as PipelineEntity, query.status, query.cursor);
  }
}

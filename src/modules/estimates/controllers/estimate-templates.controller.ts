import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '../../companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '../../auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { EstimateTemplatesService } from '../services/estimate-templates.service';
import { CreateTemplateDto, UpdateTemplateDto } from '../dto/template.dto';

@Controller(`${CONTROLLER_PATH.estimates}/templates`)
@UseGuards(CompanyGuard, SubscriptionGuard)
@RequiresFeature('estimates')
export class EstimateTemplatesController {
  constructor(private readonly service: EstimateTemplatesService) {}

  @Get()
  @CompanyRoles('OWNER', 'MANAGER', 'MEMBER')
  list(@CurrentUser() user: JwtPayload) {
    return this.service.list(user);
  }

  @Get(':id')
  @CompanyRoles('OWNER', 'MANAGER', 'MEMBER')
  get(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @CompanyRoles('OWNER', 'MANAGER')
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.service.create(user, dto);
  }

  @Put(':id')
  @CompanyRoles('OWNER', 'MANAGER')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  @CompanyRoles('OWNER', 'MANAGER')
  delete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.delete(user, id);
  }

  @Post(':id/apply/:projectId')
  @CompanyRoles('OWNER', 'MANAGER')
  apply(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('projectId') projectId: string,
    @Body() body?: { mode?: 'overwrite' | 'append' },
  ) {
    return this.service.applyTemplate(user, projectId, id, {
      mode: body?.mode,
    });
  }
}

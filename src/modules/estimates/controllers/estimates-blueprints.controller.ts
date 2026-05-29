import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '../../companies/guards/company.guard';
import { SubscriptionGuard } from '../../auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { EstimatesService } from '../estimates.service';

@Controller(CONTROLLER_PATH.estimates)
export class EstimatesBlueprintsController {
  constructor(private readonly estimates: EstimatesService) {}

  @Get('blueprints')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  listBlueprints() {
    return this.estimates.listBlueprints();
  }

  @Get('blueprints/category/:slug')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  blueprintBySlug(@Param('slug') slug: string) {
    return this.estimates.getBlueprintByCategorySlug(slug);
  }
}

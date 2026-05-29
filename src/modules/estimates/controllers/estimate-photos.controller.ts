import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '../../companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '../../auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { EstimatesService } from '../estimates.service';

@Controller(CONTROLLER_PATH.estimates)
export class EstimatePhotosController {
  constructor(private readonly estimates: EstimatesService) {}

  @Get('projects/:id/photos')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER', 'MEMBER')
  listPhotos(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.estimates.listProjectPhotos(user, id);
  }

  @Post('projects/:id/photos')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  addPhotos(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { fileKeys: string[]; caption?: string },
  ) {
    return this.estimates.addProjectPhotos(user, id, body.fileKeys, body.caption);
  }

  @Patch('projects/:id/photos/:photoId')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  updatePhotoCaption(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @Body() body: { caption: string | null },
  ) {
    return this.estimates.updateProjectPhotoCaption(user, id, photoId, body.caption);
  }

  @Delete('projects/:id/photos/:photoId')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  deletePhoto(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
  ) {
    return this.estimates.deleteProjectPhoto(user, id, photoId);
  }
}

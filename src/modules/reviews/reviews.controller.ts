import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CONTROLLER_PATH } from '../../common/constants';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CompanyGuard } from '@/modules/companies/guards/company.guard';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { CreateCompanyReviewDto } from './dto/create-company-review.dto';
import { ReviewsService } from './reviews.service';

@Controller(CONTROLLER_PATH.reviews)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('company/slug/:slug')
  listBySlug(
    @Param('slug') slug: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviews.findForCompanyBySlug(
      slug,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Public()
  @Get('company/:companyId')
  listByCompany(
    @Param('companyId') companyId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviews.findForCompany(
      companyId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @UseGuards(RolesGuard)
  @Roles('END_CLIENT')
  @Get('can-create/company/:companyId')
  canCreate(@CurrentUser() user: JwtPayload, @Param('companyId') companyId: string) {
    return this.reviews.canCreate(user, companyId);
  }

  @UseGuards(RolesGuard)
  @Roles('END_CLIENT')
  @Get('can-create/intervention/:interventionId')
  canCreateForIntervention(
    @CurrentUser() user: JwtPayload,
    @Param('interventionId') interventionId: string,
  ) {
    return this.reviews.canCreateForIntervention(user, interventionId);
  }

  @UseGuards(RolesGuard)
  @Roles('END_CLIENT')
  @Get('my')
  myReviews(@CurrentUser() user: JwtPayload) {
    return this.reviews.findMine(user);
  }

  @UseGuards(RolesGuard)
  @Roles('END_CLIENT')
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCompanyReviewDto) {
    return this.reviews.create(user, dto);
  }

  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  @Get('company/me/list')
  companyReviews(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviews.findMyCompanyReviews(
      user,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}

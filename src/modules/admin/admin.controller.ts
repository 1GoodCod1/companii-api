import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CONTROLLER_PATH } from '../../common/constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { AdminService } from './admin.service';
import { AdminAuditQueryDto } from './dto/admin-audit-query.dto';
import { CreateAdminCategoryDto, UpdateAdminCategoryDto } from './dto/admin-category.dto';
import { CreateAdminCityDto, UpdateAdminCityDto } from './dto/admin-city.dto';
import { UpdateAdminClientDto } from './dto/admin-client.dto';
import { ModerateCompanyDto } from './dto/admin-company-moderation.dto';
import { UpdateAdminReviewDto } from './dto/admin-review.dto';

@Controller(CONTROLLER_PATH.admin)
@UseGuards(RolesGuard)
@Roles('PLATFORM_ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('companies/pending')
  pending(@CurrentUser() user: JwtPayload) {
    this.admin.assertAdmin(user);
    return this.admin.pendingCompanies();
  }

  @Get('companies/:id')
  companyDetail(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    this.admin.assertAdmin(user);
    return this.admin.getCompany(id);
  }

  @Patch('companies/:id/verify')
  verify(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ModerateCompanyDto,
  ) {
    this.admin.assertAdmin(user);
    return this.admin.verifyCompany(id, user.sub, dto.note);
  }

  @Patch('companies/:id/reject')
  reject(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ModerateCompanyDto,
  ) {
    this.admin.assertAdmin(user);
    return this.admin.rejectCompany(id, user.sub, dto.note);
  }

  @Patch('companies/:id/unpublish')
  unpublish(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ModerateCompanyDto,
  ) {
    this.admin.assertAdmin(user);
    return this.admin.unpublishCompany(id, user.sub, dto.note);
  }

  @Get('stats')
  stats(@CurrentUser() user: JwtPayload) {
    this.admin.assertAdmin(user);
    return this.admin.stats();
  }

  @Get('companies')
  companies(@CurrentUser() user: JwtPayload) {
    this.admin.assertAdmin(user);
    return this.admin.listCompanies();
  }

  @Get('audit')
  audit(@CurrentUser() user: JwtPayload, @Query() query: AdminAuditQueryDto) {
    this.admin.assertAdmin(user);
    return this.admin.listAuditLogs(query);
  }

  @Get('waitlist')
  waitlist(@CurrentUser() user: JwtPayload) {
    this.admin.assertAdmin(user);
    return this.admin.listWaitlist();
  }

  @Get('reviews')
  reviews(@CurrentUser() user: JwtPayload) {
    this.admin.assertAdmin(user);
    return this.admin.listReviews();
  }

  @Patch('reviews/:id')
  moderateReview(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAdminReviewDto,
  ) {
    this.admin.assertAdmin(user);
    return this.admin.moderateReview(id, dto.status, user.sub);
  }

  @Get('cities')
  cities(@CurrentUser() user: JwtPayload) {
    this.admin.assertAdmin(user);
    return this.admin.listCities();
  }

  @Post('cities')
  createCity(@CurrentUser() user: JwtPayload, @Body() dto: CreateAdminCityDto) {
    this.admin.assertAdmin(user);
    return this.admin.createCity(dto);
  }

  @Patch('cities/:id')
  updateCity(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAdminCityDto,
  ) {
    this.admin.assertAdmin(user);
    return this.admin.updateCity(id, dto);
  }

  @Delete('cities/:id')
  deleteCity(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    this.admin.assertAdmin(user);
    return this.admin.deleteCity(id);
  }

  @Get('categories')
  categories(@CurrentUser() user: JwtPayload) {
    this.admin.assertAdmin(user);
    return this.admin.listCategories();
  }

  @Post('categories')
  createCategory(@CurrentUser() user: JwtPayload, @Body() dto: CreateAdminCategoryDto) {
    this.admin.assertAdmin(user);
    return this.admin.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAdminCategoryDto,
  ) {
    this.admin.assertAdmin(user);
    return this.admin.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  deleteCategory(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    this.admin.assertAdmin(user);
    return this.admin.deleteCategory(id);
  }

  @Get('clients')
  clients(@CurrentUser() user: JwtPayload) {
    this.admin.assertAdmin(user);
    return this.admin.listClients();
  }

  @Patch('clients/:id')
  updateClient(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAdminClientDto,
  ) {
    this.admin.assertAdmin(user);
    return this.admin.updateClient(id, dto);
  }
}

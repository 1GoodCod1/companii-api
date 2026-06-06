import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CONTROLLER_PATH } from '../../common/constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { AdminService } from './admin.service';
import { AdminAuditQueryDto } from './dto/admin-audit-query.dto';
import { CreateAdminCategoryDto, UpdateAdminCategoryDto } from './dto/admin-category.dto';
import { CreateAdminCityDto, UpdateAdminCityDto } from './dto/admin-city.dto';
import { UpdateAdminClientDto } from './dto/admin-client.dto';
import { ModerateCompanyDto } from './dto/admin-company-moderation.dto';
import { UpdateAdminReviewDto } from './dto/admin-review.dto';
import { CreateAdminBlueprintDto, UpdateAdminBlueprintDto } from './dto/admin-blueprint.dto';

@Controller(CONTROLLER_PATH.admin)
@UseGuards(RolesGuard)
@Roles('PLATFORM_ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('companies/pending')
  pending() {
    return this.admin.pendingCompanies();
  }

  @Get('companies/:id')
  companyDetail(@Param('id') id: string) {
    return this.admin.getCompany(id);
  }

  @Patch('companies/:id/verify')
  verify(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ModerateCompanyDto,
  ) {
    return this.admin.verifyCompany(id, user.sub, dto.note);
  }

  @Patch('companies/:id/reject')
  reject(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ModerateCompanyDto,
  ) {
    return this.admin.rejectCompany(id, user.sub, dto.note);
  }

  @Patch('companies/:id/unpublish')
  unpublish(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ModerateCompanyDto,
  ) {
    return this.admin.unpublishCompany(id, user.sub, dto.note);
  }

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('companies')
  companies() {
    return this.admin.listCompanies();
  }

  @Get('audit')
  audit(@Query() query: AdminAuditQueryDto) {
    return this.admin.listAuditLogs(query);
  }

  @Get('waitlist')
  waitlist() {
    return this.admin.listWaitlist();
  }

  @Get('reviews')
  reviews() {
    return this.admin.listReviews();
  }

  @Patch('reviews/:id')
  moderateReview(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAdminReviewDto,
  ) {
    return this.admin.moderateReview(id, dto.status, user.sub);
  }

  @Get('cities')
  cities() {
    return this.admin.listCities();
  }

  @Post('cities')
  createCity(@Body() dto: CreateAdminCityDto) {
    return this.admin.createCity(dto);
  }

  @Patch('cities/:id')
  updateCity(@Param('id') id: string, @Body() dto: UpdateAdminCityDto) {
    return this.admin.updateCity(id, dto);
  }

  @Delete('cities/:id')
  deleteCity(@Param('id') id: string) {
    return this.admin.deleteCity(id);
  }

  @Get('categories')
  categories() {
    return this.admin.listCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateAdminCategoryDto) {
    return this.admin.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateAdminCategoryDto,
  ) {
    return this.admin.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.admin.deleteCategory(id);
  }

  @Get('clients')
  clients() {
    return this.admin.listClients();
  }

  @Patch('clients/:id')
  updateClient(@Param('id') id: string, @Body() dto: UpdateAdminClientDto) {
    return this.admin.updateClient(id, dto);
  }

  @Get('blueprints')
  blueprints() {
    return this.admin.listBlueprints();
  }

  @Post('blueprints')
  createBlueprint(@Body() dto: CreateAdminBlueprintDto) {
    return this.admin.createBlueprint(dto);
  }

  @Patch('blueprints/:id')
  updateBlueprint(
    @Param('id') id: string,
    @Body() dto: UpdateAdminBlueprintDto,
  ) {
    return this.admin.updateBlueprint(id, dto);
  }

  @Delete('blueprints/:id')
  deleteBlueprint(@Param('id') id: string) {
    return this.admin.deleteBlueprint(id);
  }

  @Get('feedback')
  feedback() {
    return this.admin.listFeedback();
  }
}
